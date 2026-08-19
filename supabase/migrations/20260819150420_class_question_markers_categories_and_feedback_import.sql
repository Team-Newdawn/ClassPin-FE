begin;

create function private.valid_question_category_settings(settings jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  total_count integer;
  visible_count integer;
  enabled_count integer;
  invalid_count integer;
begin
  if settings is null or jsonb_typeof(settings) <> 'object' then
    return false;
  end if;

  select
    count(*),
    count(*) filter (where (item.value ->> 'archived')::boolean = false),
    count(*) filter (where (item.value ->> 'enabled')::boolean = true and (item.value ->> 'archived')::boolean = false),
    count(*) filter (where not (
      item.key ~ '^[a-z0-9][a-z0-9-]{0,63}$'
      and jsonb_typeof(item.value) = 'object'
      and jsonb_typeof(item.value -> 'label') = 'string'
      and char_length(item.value ->> 'label') <= 40
      and item.value ->> 'label' = btrim(item.value ->> 'label')
      and (
        item.key in ('concept', 'why', 'example', 'error', 'important', 'praise', 'improve', 'confusing', 'bug', 'idea')
        or char_length(item.value ->> 'label') > 0
      )
      and jsonb_typeof(item.value -> 'enabled') = 'boolean'
      and jsonb_typeof(item.value -> 'archived') = 'boolean'
    ))
  into total_count, visible_count, enabled_count, invalid_count
  from jsonb_each(settings) as item;

  return total_count between 1 and 50
    and visible_count <= 20
    and enabled_count >= 1
    and invalid_count = 0;
exception
  when others then return false;
end;
$$;

revoke all on function private.valid_question_category_settings(jsonb)
from public, anon, authenticated;

alter table public.lectures
  add column question_categories jsonb not null default '{
    "concept":{"label":"","enabled":true,"archived":false},
    "why":{"label":"","enabled":true,"archived":false},
    "example":{"label":"","enabled":true,"archived":false},
    "error":{"label":"","enabled":true,"archived":false},
    "important":{"label":"","enabled":true,"archived":false}
  }'::jsonb,
  add constraint lectures_question_categories_valid
    check (private.valid_question_category_settings(question_categories));

alter table public.questions alter column category drop default;
alter table public.questions alter column category type text using category::text;
alter table public.questions alter column category set default 'concept';
alter table public.questions
  add column marker text not null default 'pin',
  add constraint questions_marker_check check (marker in ('pin', 'question', 'smile', 'idea'));

create function private.question_category_enabled(target_lecture_id uuid, target_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((lecture.question_categories -> target_category ->> 'enabled')::boolean, false)
    and not coalesce((lecture.question_categories -> target_category ->> 'archived')::boolean, false)
  from public.lectures as lecture
  where lecture.id = target_lecture_id;
$$;

revoke all on function private.question_category_enabled(uuid, text)
from public, anon, authenticated;
grant execute on function private.question_category_enabled(uuid, text) to authenticated;

create function private.validate_lecture_question_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.valid_question_category_settings(new.question_categories)) then
    raise exception using errcode = '23514', message = 'Invalid question category settings';
  end if;
  if exists (
    select 1
    from public.questions as question
    where question.lecture_id = new.id
      and not (new.question_categories ? question.category)
  ) then
    raise exception using errcode = '23514', message = 'A used question category cannot be removed';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_lecture_question_categories()
from public, anon, authenticated;

create trigger lectures_validate_question_categories
before insert or update of question_categories on public.lectures
for each row execute function private.validate_lecture_question_categories();

create function private.validate_question_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.lectures as lecture
    where lecture.id = new.lecture_id
      and lecture.question_categories ? new.category
  ) then
    raise exception using errcode = '23514', message = 'Question category is not configured for this lecture';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_question_category()
from public, anon, authenticated;

create trigger questions_validate_category
before insert or update of lecture_id, category on public.questions
for each row execute function private.validate_question_category();

drop policy "participants add live questions" on public.questions;
create policy "participants add live questions" on public.questions for insert to authenticated
with check (
  (select private.is_participant())
  and (select auth.uid()) = author_id
  and status = 'unanswered'
  and (select private.question_category_enabled(lecture_id, category))
  and exists (
    select 1 from public.lectures as lecture
    where lecture.id = questions.lecture_id
      and lecture.course_id = questions.course_id
      and lecture.status = 'live'
  )
);

drop policy "authors update own unanswered questions" on public.questions;
create policy "authors update own unanswered questions" on public.questions
for update to authenticated
using (
  (select private.is_participant())
  and (select auth.uid()) = author_id
  and status = 'unanswered'
  and exists (
    select 1 from public.lectures as lecture
    where lecture.id = questions.lecture_id
      and lecture.course_id = questions.course_id
      and lecture.status = 'live'
  )
)
with check (
  (select private.is_participant())
  and (select auth.uid()) = author_id
  and status = 'unanswered'
  and (select private.question_category_enabled(lecture_id, category))
  and exists (
    select 1 from public.lectures as lecture
    where lecture.id = questions.lecture_id
      and lecture.course_id = questions.course_id
      and lecture.status = 'live'
  )
);

grant update (question_categories) on public.lectures to authenticated;
grant insert (marker) on public.questions to authenticated;
grant update (marker) on public.questions to authenticated;

create or replace function private.find_lecture_questions(target_lecture_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', question.id,
    'lecture_id', question.lecture_id,
    'slide_id', question.slide_id,
    'category', question.category,
    'marker', question.marker,
    'raw_text', question.raw_text,
    'status', question.status,
    'reaction_count', question.reaction_count,
    'reacted_by_me', exists (
      select 1
      from public.question_reactions as reaction
      where reaction.question_id = question.id
        and reaction.reactor_id = (select auth.uid())
    ),
    'is_mine', question.author_id = (select auth.uid()),
    'created_at', question.created_at,
    'region_anchors', case when anchor.id is null then null else jsonb_build_object(
      'kind', anchor.kind,
      'coords', anchor.coords
    ) end,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'body', answer.body,
        'created_at', answer.created_at
      ) order by answer.created_at)
      from public.answers as answer
      where answer.question_id = question.id
        and answer.visibility in ('participants', 'public')
    ), '[]'::jsonb)
  ) order by question.created_at desc), '[]'::jsonb)
  from public.questions as question
  left join public.region_anchors as anchor on anchor.id = question.region_id
  where (select auth.uid()) is not null
    and (select private.is_participant())
    and question.lecture_id = target_lecture_id
    and question.status <> 'archived'::public.question_status
    and exists (
      select 1
      from public.lectures as lecture
      where lecture.id = question.lecture_id
        and lecture.status = 'live'::public.lecture_status
    );
$$;

revoke all on function private.find_lecture_questions(uuid)
from public, anon, authenticated;
grant execute on function private.find_lecture_questions(uuid) to authenticated;

create unique index material_versions_pin_feedback_source_idx
on public.material_versions(source_path)
where source_path like 'pin-feedback/%';

create function private.import_feedback_campaign(
  target_campaign_id uuid,
  target_course_id uuid,
  target_lecture_id uuid,
  target_material_id uuid,
  target_version_id uuid,
  target_join_code text,
  target_slides jsonb,
  target_question_categories jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_campaign public.campaigns%rowtype;
  source_page_count integer;
  mapped_page_count integer;
  fallback_category text;
  existing_lecture_id uuid;
  source_pin record;
  imported_question_id uuid;
  imported_region_id uuid;
begin
  if actor_id is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Instructor authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_campaign_id::text, 0));

  select material.lecture_id
  into existing_lecture_id
  from public.material_versions as version
  join public.materials as material on material.id = version.material_id
  join public.courses as course on course.id = material.course_id
  where version.source_path = 'pin-feedback/' || target_campaign_id::text
    and course.owner_id = actor_id
  limit 1;
  if existing_lecture_id is not null then
    return existing_lecture_id;
  end if;

  select * into source_campaign
  from public.campaigns
  where id = target_campaign_id and owner_id = actor_id;
  if not found then
    raise exception using errcode = '42501', message = 'Feedback campaign not found';
  end if;
  if target_join_code !~ '^[A-Z0-9]{6,10}$' then
    raise exception using errcode = '22023', message = 'Invalid lecture join code';
  end if;
  if exists (select 1 from public.lectures where join_code = target_join_code) then
    raise exception using errcode = '23505', message = 'Lecture join code already exists';
  end if;
  if not (select private.valid_question_category_settings(target_question_categories)) then
    raise exception using errcode = '22023', message = 'Invalid question category settings';
  end if;

  select count(*) into source_page_count
  from public.campaign_pages
  where campaign_id = target_campaign_id;
  if source_page_count < 1 or source_page_count > 500
    or jsonb_typeof(target_slides) <> 'array'
    or jsonb_array_length(target_slides) <> source_page_count then
    raise exception using errcode = '22023', message = 'Campaign page mapping is incomplete';
  end if;

  select count(*) into mapped_page_count
  from jsonb_to_recordset(target_slides) as mapping(
    id uuid,
    source_page_id uuid,
    page_index integer,
    image_path text
  )
  join public.campaign_pages as page
    on page.id = mapping.source_page_id
   and page.campaign_id = target_campaign_id
   and page.page_index = mapping.page_index
  join storage.objects as object
    on object.bucket_id = 'lecture-slides'
   and object.name = mapping.image_path
  where mapping.id is not null
    and mapping.image_path like (actor_id::text || '/' || target_lecture_id::text || '/pin-feedback/%');

  if mapped_page_count <> source_page_count
    or (select count(distinct mapping.source_page_id) from jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)) <> source_page_count
    or (select count(distinct mapping.page_index) from jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)) <> source_page_count then
    raise exception using errcode = '22023', message = 'Campaign page mapping is invalid';
  end if;

  if exists (
    select 1
    from public.feedback_pins as pin
    where pin.campaign_id = target_campaign_id
      and pin.hidden = false
      and pin.category is not null
      and not (target_question_categories ? pin.category)
  ) then
    raise exception using errcode = '22023', message = 'Feedback category mapping is incomplete';
  end if;

  select category.key into fallback_category
  from jsonb_each(target_question_categories) as category
  where (category.value ->> 'enabled')::boolean = true
    and (category.value ->> 'archived')::boolean = false
  limit 1;

  insert into public.courses(id, owner_id, folder_id, title, visibility, created_at)
  values (target_course_id, actor_id, source_campaign.folder_id, source_campaign.title, 'link', source_campaign.created_at);

  insert into public.lectures(
    id, course_id, title, join_code, status, current_page,
    presentation_interactions, show_question_pins, show_presentation_qr,
    presentation_qr_position, question_categories, ended_at, created_at
  ) values (
    target_lecture_id, target_course_id, source_campaign.title, target_join_code, 'ended', 0,
    true, true, source_campaign.show_presentation_qr,
    source_campaign.presentation_qr_position, target_question_categories, now(), source_campaign.created_at
  );

  insert into public.materials(id, course_id, lecture_id, type, file_name, created_at)
  values (target_material_id, target_course_id, target_lecture_id, 'slide_deck', source_campaign.title || ' (PinFeedback)', source_campaign.created_at);

  insert into public.material_versions(id, material_id, version_no, source_path, created_at)
  values (target_version_id, target_material_id, 1, 'pin-feedback/' || target_campaign_id::text, source_campaign.created_at);

  insert into public.slides(id, material_version_id, page_index, image_path, width_px, height_px, created_at)
  select mapping.id, target_version_id, mapping.page_index, mapping.image_path, page.image_width, page.image_height, page.created_at
  from jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)
  join public.campaign_pages as page on page.id = mapping.source_page_id;

  for source_pin in
    select pin.*, mapping.id as target_slide_id
    from public.feedback_pins as pin
    join public.campaign_pages as page
      on page.campaign_id = pin.campaign_id and page.page_index = pin.page_index
    join jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)
      on mapping.source_page_id = page.id
    where pin.campaign_id = target_campaign_id and pin.hidden = false
    order by pin.created_at
  loop
    imported_region_id := gen_random_uuid();
    imported_question_id := gen_random_uuid();

    insert into public.region_anchors(id, slide_id, material_version_id, kind, coords, created_by, created_at)
    values (
      imported_region_id,
      source_pin.target_slide_id,
      target_version_id,
      'point',
      jsonb_build_object('x', source_pin.x, 'y', source_pin.y),
      'user',
      source_pin.created_at
    );

    insert into public.questions(
      id, course_id, lecture_id, slide_id, region_id, author_id, is_anonymous,
      category, marker, raw_text, status, occurred_in, created_at, updated_at
    ) values (
      imported_question_id,
      target_course_id,
      target_lecture_id,
      source_pin.target_slide_id,
      imported_region_id,
      source_pin.author_id,
      true,
      coalesce(source_pin.category, fallback_category),
      source_pin.marker,
      source_pin.body,
      'unanswered',
      'post',
      source_pin.created_at,
      source_pin.updated_at
    );

    insert into public.question_reactions(question_id, reactor_id, created_at)
    select imported_question_id, reaction.reactor_id, reaction.created_at
    from public.feedback_pin_reactions as reaction
    where reaction.pin_id = source_pin.id
    on conflict do nothing;
  end loop;

  return target_lecture_id;
end;
$$;

revoke all on function private.import_feedback_campaign(uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function private.import_feedback_campaign(uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb)
to authenticated;

create function public.import_feedback_campaign(
  target_campaign_id uuid,
  target_course_id uuid,
  target_lecture_id uuid,
  target_material_id uuid,
  target_version_id uuid,
  target_join_code text,
  target_slides jsonb,
  target_question_categories jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.import_feedback_campaign(
    target_campaign_id,
    target_course_id,
    target_lecture_id,
    target_material_id,
    target_version_id,
    target_join_code,
    target_slides,
    target_question_categories
  );
$$;

revoke all on function public.import_feedback_campaign(uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.import_feedback_campaign(uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb)
to authenticated;

notify pgrst, 'reload schema';

commit;
