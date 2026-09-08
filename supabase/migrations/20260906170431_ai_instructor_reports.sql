begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- CHECK constraints invoking this immutable validator must also be evaluable by
-- trusted server-side imports using the service role.
grant execute on function private.valid_normalized_path(jsonb) to service_role;

alter table public.slides
add column image_checksum text check (image_checksum is null or image_checksum ~ '^[0-9a-f]{64}$');

create or replace function public.append_lecture_slides(
  target_material_version_id uuid,
  new_slides jsonb
)
returns setof public.slides
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_page_index integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Instructor access is required.' using errcode = '42501';
  end if;
  if new_slides is null or jsonb_typeof(new_slides) <> 'array'
    or jsonb_array_length(new_slides) < 1 or jsonb_array_length(new_slides) > 20
  then
    raise exception 'Between 1 and 20 slides are required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new_slides) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'id', '') = ''
      or coalesce(item.value ->> 'image_path', '') = ''
      or item.value ->> 'image_path' not like (select auth.uid())::text || '/%'
      or item.value ->> 'image_path' like '%..%'
      or coalesce(item.value ->> 'image_checksum', '') !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'Slide payload is invalid.' using errcode = '22023';
  end if;
  perform 1
  from public.material_versions as version
  join public.materials as material on material.id = version.material_id
  where version.id = target_material_version_id
    and (select private.course_owned(material.course_id))
  for update of version;
  if not found then
    raise exception 'Material version was not found.' using errcode = '42501';
  end if;
  select coalesce(max(slide.page_index) + 1, 0)
  into next_page_index
  from public.slides as slide
  where slide.material_version_id = target_material_version_id;
  return query
  insert into public.slides (id, material_version_id, page_index, image_path, image_checksum)
  select
    (item.value ->> 'id')::uuid,
    target_material_version_id,
    (next_page_index + item.position - 1)::integer,
    item.value ->> 'image_path',
    item.value ->> 'image_checksum'
  from jsonb_array_elements(new_slides) with ordinality as item(value, position)
  returning *;
end;
$$;

create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  selection_kind text not null check (selection_kind in ('material', 'materials', 'folder')),
  folder_id uuid references public.session_folders(id) on delete set null,
  folder_name_snapshot text,
  supersedes_report_id uuid references public.ai_reports(id) on delete set null,
  cutoff_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'preparing', 'analyzing', 'synthesizing', 'criticizing', 'ready', 'failed', 'confirmed', 'deleting')),
  progress_completed integer not null default 0 check (progress_completed >= 0),
  progress_total integer not null check (progress_total > 0),
  material_count integer not null check (material_count between 1 and 20),
  slide_count integer not null check (slide_count between 1 and 300),
  question_count integer not null check (question_count between 0 and 5000),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  model_fingerprint text not null check (char_length(model_fingerprint) between 1 and 300),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  schema_version text not null check (char_length(schema_version) between 1 and 80),
  pricing_at timestamptz not null,
  estimated_cost_min_usd numeric(12, 6) not null check (estimated_cost_min_usd >= 0),
  estimated_cost_max_usd numeric(12, 6) not null check (estimated_cost_max_usd >= estimated_cost_min_usd),
  actual_cost_usd numeric(12, 6) not null default 0 check (actual_cost_usd >= 0),
  canonical_result jsonb check (canonical_result is null or jsonb_typeof(canonical_result) = 'object'),
  current_revision_id uuid,
  confirmed_revision_id uuid,
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (progress_completed <= progress_total),
  check ((status in ('ready', 'confirmed')) = (canonical_result is not null)),
  check ((status = 'confirmed') = (confirmed_revision_id is not null))
);

create table public.ai_report_materials (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  material_version_id uuid not null references public.material_versions(id),
  material_alias text not null check (material_alias ~ '^M[0-9]{3}$'),
  ordinal integer not null check (ordinal > 0),
  title_snapshot text not null check (char_length(title_snapshot) between 1 and 120),
  source_checksum text,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (report_id, owner_id) references public.ai_reports(id, owner_id) on delete cascade,
  unique (report_id, material_id),
  unique (report_id, material_alias),
  unique (report_id, ordinal),
  unique (id, report_id, owner_id)
);

create table public.ai_report_slides (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  report_material_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_slide_id uuid references public.slides(id) on delete set null,
  slide_alias text not null check (slide_alias ~ '^S[0-9]{3}$'),
  ordinal integer not null check (ordinal > 0),
  page_index integer not null check (page_index >= 0),
  source_image_path text not null,
  source_checksum text check (source_checksum is null or source_checksum ~ '^[0-9a-f]{64}$'),
  question_snapshot jsonb not null check (
    jsonb_typeof(question_snapshot) = 'object'
    and question_snapshot ->> 'schemaVersion' = 'ai-report-question-snapshot.v1'
  ),
  redaction_record jsonb check (redaction_record is null or jsonb_typeof(redaction_record) = 'object'),
  evidence_prefix text,
  processing_status text not null default 'queued'
    check (processing_status in ('queued', 'processing', 'succeeded', 'failed')),
  attempt integer not null default 0 check (attempt between 0 and 3),
  lease_expires_at timestamptz,
  analysis_result jsonb check (analysis_result is null or jsonb_typeof(analysis_result) = 'object'),
  code_validation jsonb check (code_validation is null or jsonb_typeof(code_validation) = 'object'),
  critic_result jsonb check (critic_result is null or jsonb_typeof(critic_result) = 'object'),
  usage_record jsonb check (usage_record is null or jsonb_typeof(usage_record) = 'object'),
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (report_id, owner_id) references public.ai_reports(id, owner_id) on delete cascade,
  foreign key (report_material_id, report_id, owner_id)
    references public.ai_report_materials(id, report_id, owner_id) on delete cascade,
  unique (report_id, slide_alias),
  unique (report_id, ordinal),
  unique (id, report_id, owner_id),
  check ((processing_status = 'succeeded') = (analysis_result is not null))
);

create table public.ai_report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision_no integer not null check (revision_no between 1 and 20),
  kind text not null check (kind in ('initial', 'full', 'section')),
  target_section text,
  instruction_redacted text check (instruction_redacted is null or char_length(instruction_redacted) <= 2000),
  previous_revision_id uuid references public.ai_report_revisions(id) deferrable initially deferred,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed', 'rejected')),
  display_result jsonb check (display_result is null or jsonb_typeof(display_result) = 'object'),
  selected_claim_ids jsonb check (selected_claim_ids is null or jsonb_typeof(selected_claim_ids) = 'array'),
  code_validation jsonb check (code_validation is null or jsonb_typeof(code_validation) = 'object'),
  critic_result jsonb check (critic_result is null or jsonb_typeof(critic_result) = 'object'),
  usage_record jsonb check (usage_record is null or jsonb_typeof(usage_record) = 'object'),
  actual_cost_usd numeric(12, 6) not null default 0 check (actual_cost_usd >= 0),
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  foreign key (report_id, owner_id) references public.ai_reports(id, owner_id) on delete cascade,
  unique (report_id, revision_no),
  unique (id, report_id),
  check ((status = 'ready') = (display_result is not null))
);

alter table public.ai_reports
  add constraint ai_reports_current_revision_fkey
    foreign key (current_revision_id, id) references public.ai_report_revisions(id, report_id)
    deferrable initially deferred,
  add constraint ai_reports_confirmed_revision_fkey
    foreign key (confirmed_revision_id, id) references public.ai_report_revisions(id, report_id)
    deferrable initially deferred;

create table public.ai_report_jobs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.ai_reports(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision_id uuid references public.ai_report_revisions(id) on delete cascade,
  kind text not null check (kind in ('generate', 'retry', 'revision')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  stage text not null default 'prepare'
    check (stage in ('prepare', 'slide', 'synthesize', 'criticize', 'revision', 'complete')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt integer not null default 0 check (attempt between 0 and 3),
  expected_units integer not null check (expected_units > 0),
  completed_units integer not null default 0 check (completed_units >= 0),
  lease_expires_at timestamptz,
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  check (completed_units <= expected_units)
);

create table public.ai_report_storage_cleanup (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  report_id uuid not null,
  storage_prefix text not null,
  attempt integer not null default 0 check (attempt between 0 and 20),
  available_at timestamptz not null default now(),
  safe_error_code text,
  created_at timestamptz not null default now(),
  unique (report_id, storage_prefix)
);

create table public.ai_report_cost_calls (
  call_key text primary key check (char_length(call_key) between 16 and 200),
  report_id uuid not null references public.ai_reports(id) on delete cascade,
  job_id uuid not null references public.ai_report_jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  call_role text not null check (call_role in ('slide_generation', 'slide_critic', 'report_generation', 'report_critic')),
  reserved_cost_usd numeric(12, 6) not null check (reserved_cost_usd > 0),
  actual_cost_usd numeric(12, 6) check (actual_cost_usd is null or actual_cost_usd >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  foreign key (report_id, owner_id) references public.ai_reports(id, owner_id) on delete cascade
);

create index ai_reports_owner_created_idx on public.ai_reports(owner_id, created_at desc, id desc);
create index ai_reports_folder_idx on public.ai_reports(folder_id) where folder_id is not null;
create index ai_reports_supersedes_idx on public.ai_reports(supersedes_report_id) where supersedes_report_id is not null;
create index ai_report_materials_material_idx on public.ai_report_materials(material_id);
create index ai_report_materials_version_idx on public.ai_report_materials(material_version_id);
create index ai_report_materials_owner_idx on public.ai_report_materials(owner_id);
create index ai_report_slides_material_idx on public.ai_report_slides(report_material_id);
create index ai_report_slides_source_idx on public.ai_report_slides(source_slide_id) where source_slide_id is not null;
create index ai_report_slides_report_ordinal_idx on public.ai_report_slides(report_id, ordinal);
create index ai_report_slides_owner_idx on public.ai_report_slides(owner_id);
create index ai_report_slides_pending_idx on public.ai_report_slides(report_id, processing_status)
  where processing_status <> 'succeeded';
create index ai_report_revisions_report_idx on public.ai_report_revisions(report_id, revision_no);
create index ai_report_revisions_owner_idx on public.ai_report_revisions(owner_id);
create index ai_report_jobs_report_idx on public.ai_report_jobs(report_id, created_at desc);
create index ai_report_jobs_owner_active_idx on public.ai_report_jobs(owner_id, status)
  where status in ('queued', 'running');
create unique index ai_report_jobs_one_active_per_report_idx on public.ai_report_jobs(report_id)
  where status in ('queued', 'running');
create index ai_report_cleanup_available_idx on public.ai_report_storage_cleanup(available_at, id);
create index ai_report_cost_calls_active_idx on public.ai_report_cost_calls(report_id, expires_at)
  where status = 'reserved';

create function private.touch_ai_report_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_ai_report_updated_at() from public, anon, authenticated;

create trigger ai_reports_touch_updated_at before update on public.ai_reports
for each row execute function private.touch_ai_report_updated_at();
create trigger ai_report_slides_touch_updated_at before update on public.ai_report_slides
for each row execute function private.touch_ai_report_updated_at();
create trigger ai_report_jobs_touch_updated_at before update on public.ai_report_jobs
for each row execute function private.touch_ai_report_updated_at();

create function private.guard_ai_report_immutable_results()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'confirmed' then
    raise exception using errcode = '55000', message = 'Confirmed AI reports are immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_ai_report_immutable_results() from public, anon, authenticated;
create trigger ai_reports_guard_confirmed before update on public.ai_reports
for each row execute function private.guard_ai_report_immutable_results();

create function private.guard_ai_report_slide_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.processing_status = 'succeeded'
    and (new.analysis_result, new.code_validation, new.critic_result, new.usage_record)
      is distinct from (old.analysis_result, old.code_validation, old.critic_result, old.usage_record)
  then
    raise exception using errcode = '55000', message = 'Successful AI slide results are append-only';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_ai_report_slide_result() from public, anon, authenticated;
create trigger ai_report_slides_guard_result before update on public.ai_report_slides
for each row execute function private.guard_ai_report_slide_result();

create function private.guard_ai_report_revision_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'ready' then
    raise exception using errcode = '55000', message = 'Ready AI report revisions are append-only';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_ai_report_revision_result() from public, anon, authenticated;
create trigger ai_report_revisions_guard_result before update on public.ai_report_revisions
for each row execute function private.guard_ai_report_revision_result();

create function private.capture_ai_report_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_report_storage_cleanup(owner_id, report_id, storage_prefix)
  values (old.owner_id, old.id, old.owner_id::text || '/' || old.id::text || '/')
  on conflict (report_id, storage_prefix) do nothing;
  return old;
end;
$$;
revoke all on function private.capture_ai_report_cleanup() from public, anon, authenticated;
create trigger ai_reports_capture_cleanup before delete on public.ai_reports
for each row execute function private.capture_ai_report_cleanup();

create function private.delete_ai_reports_for_material()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_reports as report
  where exists (
    select 1 from public.ai_report_materials as report_material
    where report_material.report_id = report.id
      and report_material.material_id = old.id
  );
  return old;
end;
$$;
revoke all on function private.delete_ai_reports_for_material() from public, anon, authenticated;
create trigger materials_delete_ai_reports before delete on public.materials
for each row execute function private.delete_ai_reports_for_material();

create function public.inspect_ai_report_selection(
  target_owner_id uuid,
  target_selection_kind text,
  target_folder_id uuid,
  target_material_ids uuid[],
  target_cutoff timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_material_ids uuid[];
  selected_material_count integer;
  selected_version_count integer;
  selected_materials_with_slides integer;
  selected_slide_count integer;
  selected_question_count integer;
  target_fingerprint text;
  folder_material_ids uuid[];
begin
  if target_owner_id is null
    or not exists (
      select 1 from public.profiles
      where id = target_owner_id and role = 'admin'::public.user_role
    )
  then
    raise exception using errcode = '42501', message = 'AI report owner must be an admin';
  end if;
  if target_selection_kind not in ('material', 'materials', 'folder') then
    raise exception using errcode = '22023', message = 'Invalid AI report selection kind';
  end if;

  select array_agg(material_id order by material_id)
  into normalized_material_ids
  from (select distinct unnest(target_material_ids) as material_id) selected;
  if coalesce(cardinality(normalized_material_ids), 0) not between 1 and 20
    or (target_selection_kind = 'material' and cardinality(normalized_material_ids) <> 1)
    or (target_selection_kind = 'materials' and cardinality(normalized_material_ids) < 2)
  then
    raise exception using errcode = '22023', message = 'AI report material limit exceeded';
  end if;

  select count(*)
  into selected_material_count
  from public.materials as material
  join public.courses as course on course.id = material.course_id
  where material.id = any(normalized_material_ids)
    and course.owner_id = target_owner_id
    and (target_selection_kind <> 'folder' or course.folder_id = target_folder_id);
  if selected_material_count <> cardinality(normalized_material_ids) then
    raise exception using errcode = '42501', message = 'AI report selection is not owned by requester';
  end if;

  if target_selection_kind = 'folder' then
    if target_folder_id is null or not exists (
      select 1 from public.session_folders
      where id = target_folder_id and owner_id = target_owner_id
    ) then
      raise exception using errcode = '42501', message = 'AI report folder is not owned by requester';
    end if;
    select array_agg(material.id order by material.id)
    into folder_material_ids
    from public.materials as material
    join public.courses as course on course.id = material.course_id
    where course.owner_id = target_owner_id and course.folder_id = target_folder_id;
    if coalesce(folder_material_ids, '{}'::uuid[]) <> normalized_material_ids then
      raise exception using errcode = '22023', message = 'AI report folder selection is incomplete';
    end if;
  end if;

  with selected_versions as (
    select material.id as material_id, version.id as version_id
    from public.materials as material
    join lateral (
      select candidate.id
      from public.material_versions as candidate
      where candidate.material_id = material.id
      order by candidate.version_no desc, candidate.id desc
      limit 1
    ) as version on true
    where material.id = any(normalized_material_ids)
  ), selected_slides as (
    select selected_versions.material_id, slide.id
    from selected_versions
    join public.slides as slide on slide.material_version_id = selected_versions.version_id
  )
  select
    (select count(*) from selected_versions),
    count(distinct selected_slides.material_id),
    count(*)
  into selected_version_count, selected_materials_with_slides, selected_slide_count
  from selected_slides;
  if selected_version_count <> selected_material_count
    or selected_materials_with_slides <> selected_material_count
  then
    raise exception using errcode = '55000', message = 'AI report source is incomplete';
  end if;
  if selected_slide_count not between 1 and 300 then
    raise exception using errcode = '22023', message = 'AI report slide limit exceeded';
  end if;

  with selected_versions as (
    select version.id as version_id
    from public.materials as material
    join lateral (
      select candidate.id
      from public.material_versions as candidate
      where candidate.material_id = material.id
      order by candidate.version_no desc, candidate.id desc
      limit 1
    ) as version on true
    where material.id = any(normalized_material_ids)
  ), selected_slides as (
    select slide.id
    from selected_versions
    join public.slides as slide on slide.material_version_id = selected_versions.version_id
  )
  select count(*)
  into selected_question_count
  from public.questions as question
  where question.slide_id in (select id from selected_slides)
    and question.created_at <= target_cutoff
    and question.status <> 'archived'::public.question_status;
  if selected_question_count > 5000 or exists (
    with selected_versions as (
      select version.id as version_id
      from public.materials as material
      join lateral (
        select candidate.id
        from public.material_versions as candidate
        where candidate.material_id = material.id
        order by candidate.version_no desc, candidate.id desc
        limit 1
      ) as version on true
      where material.id = any(normalized_material_ids)
    ), selected_slides as (
      select slide.id
      from selected_versions
      join public.slides as slide on slide.material_version_id = selected_versions.version_id
    )
    select 1
    from public.questions as question
    where question.slide_id in (select id from selected_slides)
      and question.created_at <= target_cutoff
      and question.status <> 'archived'::public.question_status
    group by question.slide_id
    having count(*) > 100
  ) then
    raise exception using errcode = '22023', message = 'AI report question limit exceeded';
  end if;

  with selected_versions as (
    select material.id as material_id, version.id as version_id,
      coalesce(version.checksum, '') as version_checksum
    from public.materials as material
    join lateral (
      select candidate.id, candidate.checksum
      from public.material_versions as candidate
      where candidate.material_id = material.id
      order by candidate.version_no desc, candidate.id desc
      limit 1
    ) as version on true
    where material.id = any(normalized_material_ids)
  ), fingerprint_rows as (
    select concat_ws('|',
      selected_versions.material_id::text,
      selected_versions.version_id::text,
      selected_versions.version_checksum,
      slide.id::text,
      slide.page_index::text,
      slide.image_path,
      coalesce(slide.image_checksum, ''),
      coalesce(question.id::text, ''),
      coalesce(question.raw_text, ''),
      coalesce(question.category::text, ''),
      coalesce(question.status::text, ''),
      coalesce(question.updated_at::text, ''),
      coalesce(question.reaction_count::text, ''),
      coalesce(anchor.kind, ''),
      coalesce(anchor.coords::text, ''),
      coalesce((
        select encode(extensions.digest(convert_to(coalesce(string_agg(
          jsonb_build_array(answer.id, answer.body, answer.visibility, answer.created_at)::text,
          E'\n' order by answer.created_at, answer.id
        ), ''), 'UTF8'), 'sha256'), 'hex')
        from public.answers as answer
        where answer.question_id = question.id and answer.created_at <= target_cutoff
      ), '')
    ) as fingerprint_part,
    selected_versions.material_id,
    slide.page_index,
    question.created_at,
    question.id as question_id
    from selected_versions
    join public.slides as slide on slide.material_version_id = selected_versions.version_id
    left join public.questions as question on question.slide_id = slide.id
      and question.created_at <= target_cutoff
      and question.status <> 'archived'::public.question_status
    left join public.region_anchors as anchor on anchor.id = question.region_id
  )
  select encode(extensions.digest(convert_to(concat_ws(E'\n',
    target_selection_kind,
    coalesce(target_folder_id::text, ''),
    array_to_string(normalized_material_ids, ','),
    string_agg(fingerprint_part, E'\n' order by material_id, page_index, created_at nulls first, question_id)
  ), 'UTF8'), 'sha256'), 'hex')
  into target_fingerprint
  from fingerprint_rows;

  return jsonb_build_object(
    'materialCount', selected_material_count,
    'slideCount', selected_slide_count,
    'questionCount', selected_question_count,
    'sourceFingerprint', target_fingerprint,
    'cutoffAt', target_cutoff
  );
end;
$$;
revoke all on function public.inspect_ai_report_selection(uuid, text, uuid, uuid[], timestamptz)
from public, anon, authenticated;
grant execute on function public.inspect_ai_report_selection(uuid, text, uuid, uuid[], timestamptz)
to service_role;

create function public.create_ai_report_snapshot(
  target_owner_id uuid,
  target_selection_kind text,
  target_folder_id uuid,
  target_material_ids uuid[],
  target_expected_source_fingerprint text,
  target_idempotency_key text,
  target_request_hash text,
  target_model_fingerprint text,
  target_prompt_version text,
  target_schema_version text,
  target_pricing_at timestamptz,
  target_estimated_cost_min_usd numeric,
  target_estimated_cost_max_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_material_ids uuid[];
  target_cutoff timestamptz := now();
  target_report_id uuid := gen_random_uuid();
  existing_job public.ai_report_jobs;
  target_job_id uuid;
  selected_material_count integer;
  selected_slide_count integer;
  selected_question_count integer;
  target_fingerprint text;
  selection_inspection jsonb;
begin
  if target_owner_id is null
    or not exists (
      select 1 from public.profiles
      where id = target_owner_id and role = 'admin'::public.user_role
    )
  then
    raise exception using errcode = '42501', message = 'AI report owner must be an admin';
  end if;
  if target_selection_kind not in ('material', 'materials', 'folder') then
    raise exception using errcode = '22023', message = 'Invalid AI report selection kind';
  end if;
  if char_length(target_idempotency_key) not between 16 and 200
    or target_request_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'Invalid AI report idempotency data';
  end if;

  select array_agg(material_id order by material_id)
  into normalized_material_ids
  from (select distinct unnest(target_material_ids) as material_id) selected;
  if coalesce(cardinality(normalized_material_ids), 0) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'AI report material limit exceeded';
  end if;

  select * into existing_job
  from public.ai_report_jobs
  where owner_id = target_owner_id and idempotency_key = target_idempotency_key;
  if found then
    if existing_job.request_hash <> target_request_hash then
      raise exception using errcode = '23505', message = 'Idempotency key payload conflict';
    end if;
    return jsonb_build_object('reportId', existing_job.report_id, 'jobId', existing_job.id, 'reused', true);
  end if;

  if (
    select count(*) from public.ai_report_jobs
    where owner_id = target_owner_id and status in ('queued', 'running')
  ) >= 2 then
    raise exception using errcode = '53300', message = 'AI report active job limit exceeded';
  end if;

  selection_inspection := public.inspect_ai_report_selection(
    target_owner_id, target_selection_kind, target_folder_id, normalized_material_ids, target_cutoff
  );
  selected_material_count := (selection_inspection ->> 'materialCount')::integer;
  selected_slide_count := (selection_inspection ->> 'slideCount')::integer;
  selected_question_count := (selection_inspection ->> 'questionCount')::integer;
  target_fingerprint := selection_inspection ->> 'sourceFingerprint';
  if target_expected_source_fingerprint !~ '^[0-9a-f]{64}$'
    or target_fingerprint <> target_expected_source_fingerprint
  then
    raise exception using errcode = '40001', message = 'AI report source changed after preflight';
  end if;

  insert into public.ai_reports(
    id, owner_id, selection_kind, folder_id, folder_name_snapshot, cutoff_at,
    progress_total, material_count, slide_count, question_count,
    snapshot_hash, source_fingerprint, model_fingerprint, prompt_version, schema_version,
    pricing_at, estimated_cost_min_usd, estimated_cost_max_usd
  )
  values (
    target_report_id, target_owner_id, target_selection_kind, target_folder_id,
    (select name from public.session_folders where id = target_folder_id and owner_id = target_owner_id),
    target_cutoff, selected_slide_count, selected_material_count, selected_slide_count,
    selected_question_count, target_fingerprint, target_fingerprint,
    target_model_fingerprint, target_prompt_version, target_schema_version,
    target_pricing_at, target_estimated_cost_min_usd, target_estimated_cost_max_usd
  );

  insert into public.ai_report_materials(
    report_id, owner_id, material_id, material_version_id, material_alias,
    ordinal, title_snapshot, source_checksum, source_fingerprint
  )
  select target_report_id, target_owner_id, selected.material_id, selected.version_id,
    'M' || lpad(selected.ordinal::text, 3, '0'), selected.ordinal,
    selected.file_name, selected.checksum, selected.fingerprint
  from (
    select material.id as material_id, material.file_name,
      version.id as version_id, version.checksum,
      row_number() over (order by material.id)::integer as ordinal,
      encode(extensions.digest(convert_to(concat_ws('|', material.id::text, version.id::text, coalesce(version.checksum, '')), 'UTF8'), 'sha256'), 'hex') as fingerprint
    from public.materials as material
    join lateral (
      select candidate.id, candidate.checksum
      from public.material_versions as candidate
      where candidate.material_id = material.id
      order by candidate.version_no desc, candidate.id desc
      limit 1
    ) as version on true
    where material.id = any(normalized_material_ids)
  ) as selected;

  insert into public.ai_report_slides(
    report_id, report_material_id, owner_id, source_slide_id, slide_alias,
    ordinal, page_index, source_image_path, source_checksum, question_snapshot
  )
  select target_report_id, report_material.id, target_owner_id, selected.slide_id,
    'S' || lpad(selected.global_ordinal::text, 3, '0'), selected.global_ordinal,
    selected.page_index, selected.image_path, selected.image_checksum,
    jsonb_build_object(
      'schemaVersion', 'ai-report-question-snapshot.v1',
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'questionAlias', 'Q' || lpad(question_row.ordinal::text, 3, '0'),
          'sourceMapping', jsonb_build_object('questionId', question_row.id, 'anchorId', question_row.region_id),
          'text', question_row.raw_text,
          'category', question_row.category,
          'status', question_row.status,
          'reactionCount', question_row.reaction_count,
          'anchor', case when question_row.region_id is null then null else jsonb_build_object('kind', question_row.kind, 'coords', question_row.coords) end,
          'answers', coalesce((
            select jsonb_agg(jsonb_build_object('body', answer.body, 'createdAt', answer.created_at) order by answer.created_at, answer.id)
            from public.answers as answer
            where answer.question_id = question_row.id and answer.created_at <= target_cutoff
          ), '[]'::jsonb)
        ) order by question_row.ordinal)
        from (
          select question.id, question.region_id, question.raw_text, question.category,
            question.status, question.reaction_count, anchor.kind, anchor.coords,
            row_number() over (order by question.created_at, question.id)::integer as ordinal
          from public.questions as question
          left join public.region_anchors as anchor on anchor.id = question.region_id
          where question.slide_id = selected.slide_id
            and question.created_at <= target_cutoff
            and question.status <> 'archived'::public.question_status
        ) as question_row
      ), '[]'::jsonb)
    )
  from (
    select slide.id as slide_id, slide.material_version_id, slide.page_index, slide.image_path, slide.image_checksum,
      row_number() over (order by report_material.ordinal, slide.page_index, slide.id)::integer as global_ordinal
    from public.ai_report_materials as report_material
    join public.slides as slide on slide.material_version_id = report_material.material_version_id
    where report_material.report_id = target_report_id
  ) as selected
  join public.ai_report_materials as report_material
    on report_material.report_id = target_report_id
    and report_material.material_version_id = selected.material_version_id;

  insert into public.ai_report_jobs(
    report_id, owner_id, kind, idempotency_key, request_hash, expected_units
  )
  values (
    target_report_id, target_owner_id, 'generate', target_idempotency_key,
    target_request_hash, selected_slide_count
  )
  returning id into target_job_id;

  return jsonb_build_object(
    'reportId', target_report_id,
    'jobId', target_job_id,
    'sourceFingerprint', target_fingerprint,
    'cutoffAt', target_cutoff,
    'reused', false
  );
end;
$$;
revoke all on function public.create_ai_report_snapshot(
  uuid, text, uuid, uuid[], text, text, text, text, text, text, timestamptz, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.create_ai_report_snapshot(
  uuid, text, uuid, uuid[], text, text, text, text, text, text, timestamptz, numeric, numeric
) to service_role;

create function public.reserve_ai_report_cost(
  target_job_id uuid,
  target_call_key text,
  target_call_role text,
  target_reserved_cost_usd numeric,
  target_hard_cap_usd numeric,
  target_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report public.ai_reports;
  target_job public.ai_report_jobs;
  existing_call public.ai_report_cost_calls;
  active_reserved numeric;
  allowed_cost numeric;
begin
  if char_length(target_call_key) not between 16 and 200
    or target_call_role not in ('slide_generation', 'slide_critic', 'report_generation', 'report_critic')
    or target_reserved_cost_usd <= 0
    or target_hard_cap_usd <= 0
    or target_lease_seconds not between 30 and 1800
  then
    raise exception using errcode = '22023', message = 'Invalid AI report cost reservation';
  end if;

  select job.* into target_job
  from public.ai_report_jobs as job
  where job.id = target_job_id and job.status = 'running';
  if not found then
    raise exception using errcode = '55000', message = 'AI report job is not running';
  end if;
  select report.* into target_report
  from public.ai_reports as report
  where report.id = target_job.report_id
    and report.status in ('preparing', 'analyzing', 'synthesizing', 'criticizing')
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'AI report is not active';
  end if;

  select * into existing_call from public.ai_report_cost_calls where call_key = target_call_key;
  if found then
    if existing_call.report_id <> target_report.id or existing_call.job_id <> target_job.id then
      raise exception using errcode = '23505', message = 'AI report cost call key conflict';
    end if;
    return jsonb_build_object(
      'reportId', existing_call.report_id,
      'status', existing_call.status,
      'reused', true
    );
  end if;

  update public.ai_report_cost_calls
  set status = 'released', settled_at = now()
  where report_id = target_report.id and status = 'reserved' and expires_at <= now();
  select coalesce(sum(reserved_cost_usd), 0)
  into active_reserved
  from public.ai_report_cost_calls
  where report_id = target_report.id and status = 'reserved' and expires_at > now();
  allowed_cost := least(target_report.estimated_cost_max_usd, target_hard_cap_usd);
  if target_report.actual_cost_usd + active_reserved + target_reserved_cost_usd > allowed_cost then
    raise exception using errcode = '22003', message = 'AI report hard cost cap would be exceeded';
  end if;

  insert into public.ai_report_cost_calls(
    call_key, report_id, job_id, owner_id, call_role, reserved_cost_usd, expires_at
  ) values (
    target_call_key, target_report.id, target_job.id, target_job.owner_id,
    target_call_role, target_reserved_cost_usd, now() + make_interval(secs => target_lease_seconds)
  );
  return jsonb_build_object('reportId', target_report.id, 'status', 'reserved', 'reused', false);
end;
$$;

create function public.settle_ai_report_cost(
  target_call_key text,
  target_actual_cost_usd numeric,
  target_hard_cap_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_call public.ai_report_cost_calls;
  target_report public.ai_reports;
  next_actual_cost numeric;
  allowed_cost numeric;
begin
  if target_actual_cost_usd < 0 or target_hard_cap_usd <= 0 then
    raise exception using errcode = '22023', message = 'Invalid AI report settled cost';
  end if;
  select * into target_call from public.ai_report_cost_calls
  where call_key = target_call_key for update;
  if not found then
    raise exception using errcode = '55000', message = 'AI report cost reservation is missing';
  end if;
  if target_call.status = 'settled' then
    return jsonb_build_object(
      'reportId', target_call.report_id,
      'actualCostUsd', target_call.actual_cost_usd,
      'withinReservation', target_call.actual_cost_usd <= target_call.reserved_cost_usd,
      'reused', true
    );
  end if;
  if target_call.status <> 'reserved' then
    raise exception using errcode = '55000', message = 'AI report cost reservation is not active';
  end if;

  select * into target_report from public.ai_reports
  where id = target_call.report_id for update;
  next_actual_cost := target_report.actual_cost_usd + target_actual_cost_usd;
  allowed_cost := least(target_report.estimated_cost_max_usd, target_hard_cap_usd);
  update public.ai_reports set actual_cost_usd = next_actual_cost
  where id = target_report.id;
  update public.ai_report_cost_calls set
    actual_cost_usd = target_actual_cost_usd,
    status = 'settled',
    settled_at = now()
  where call_key = target_call_key;
  return jsonb_build_object(
    'reportId', target_report.id,
    'actualCostUsd', next_actual_cost,
    'withinReservation', target_actual_cost_usd <= target_call.reserved_cost_usd,
    'withinCap', next_actual_cost <= allowed_cost,
    'reused', false
  );
end;
$$;

create function public.release_ai_report_cost(target_call_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_report_cost_calls
  set status = 'released', settled_at = now()
  where call_key = target_call_key and status = 'reserved';
  return found;
end;
$$;

revoke all on function public.reserve_ai_report_cost(uuid, text, text, numeric, numeric, integer),
  public.settle_ai_report_cost(text, numeric, numeric), public.release_ai_report_cost(text)
from public, anon, authenticated;
grant execute on function public.reserve_ai_report_cost(uuid, text, text, numeric, numeric, integer),
  public.settle_ai_report_cost(text, numeric, numeric), public.release_ai_report_cost(text)
to service_role;

create function public.claim_ai_report_prepare(target_job_id uuid, target_lease_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_job public.ai_report_jobs;
begin
  if target_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'Invalid AI report lease';
  end if;
  update public.ai_report_jobs
  set status = 'running', attempt = attempt + 1,
      lease_expires_at = now() + make_interval(secs => target_lease_seconds)
  where id = target_job_id
    and stage = 'prepare'
    and status in ('queued', 'running')
    and attempt < 3
    and (lease_expires_at is null or lease_expires_at < now())
  returning * into claimed_job;
  if not found then return null; end if;

  update public.ai_reports
  set status = 'preparing', safe_error_code = null
  where id = claimed_job.report_id and status in ('queued', 'preparing');
  return jsonb_build_object('jobId', claimed_job.id, 'reportId', claimed_job.report_id, 'attempt', claimed_job.attempt);
end;
$$;

create function public.complete_ai_report_prepare(target_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report_id uuid;
  slide_aliases jsonb;
begin
  update public.ai_report_jobs
  set stage = 'slide', status = 'running', attempt = 0, lease_expires_at = null
  where id = target_job_id and stage = 'prepare' and status = 'running'
  returning report_id into target_report_id;
  if not found then return null; end if;

  update public.ai_reports set status = 'analyzing'
  where id = target_report_id and status = 'preparing';
  select coalesce(jsonb_agg(slide_alias order by ordinal), '[]'::jsonb)
  into slide_aliases from public.ai_report_slides where report_id = target_report_id;
  return jsonb_build_object('reportId', target_report_id, 'slideAliases', slide_aliases);
end;
$$;

create function public.claim_ai_report_slide(
  target_job_id uuid,
  target_slide_alias text,
  target_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_slide public.ai_report_slides;
begin
  if target_slide_alias !~ '^S[0-9]{3}$' or target_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'Invalid AI report slide claim';
  end if;
  update public.ai_report_slides as slide
  set processing_status = 'processing', attempt = slide.attempt + 1,
      lease_expires_at = now() + make_interval(secs => target_lease_seconds), safe_error_code = null
  from public.ai_report_jobs as job
  where job.id = target_job_id and job.report_id = slide.report_id
    and job.stage = 'slide' and job.status = 'running'
    and slide.slide_alias = target_slide_alias
    and slide.processing_status in ('queued', 'processing')
    and slide.attempt < 3
    and (slide.lease_expires_at is null or slide.lease_expires_at < now())
  returning slide.* into claimed_slide;
  if not found then return null; end if;
  return to_jsonb(claimed_slide);
end;
$$;

create function public.complete_ai_report_slide(
  target_job_id uuid,
  target_slide_alias text,
  target_source_checksum text,
  target_redaction_record jsonb,
  target_evidence_prefix text,
  target_analysis_result jsonb,
  target_code_validation jsonb,
  target_critic_result jsonb,
  target_usage_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report_id uuid;
  completed integer;
  expected integer;
begin
  if target_source_checksum !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(target_analysis_result) <> 'object'
    or jsonb_typeof(target_code_validation) <> 'object'
    or jsonb_typeof(target_critic_result) <> 'object'
    or jsonb_typeof(target_usage_record) <> 'object'
  then
    raise exception using errcode = '22023', message = 'Invalid AI report slide result';
  end if;
  update public.ai_report_slides as slide
  set source_checksum = target_source_checksum, redaction_record = target_redaction_record,
      evidence_prefix = target_evidence_prefix, analysis_result = target_analysis_result,
      code_validation = target_code_validation, critic_result = target_critic_result,
      usage_record = target_usage_record, processing_status = 'succeeded', lease_expires_at = null
  from public.ai_report_jobs as job
  where job.id = target_job_id and job.report_id = slide.report_id
    and job.stage = 'slide' and job.status = 'running'
    and slide.slide_alias = target_slide_alias and slide.processing_status = 'processing'
    and (slide.source_checksum is null or slide.source_checksum = target_source_checksum)
  returning slide.report_id into target_report_id;
  if not found then return null; end if;

  update public.ai_report_jobs
  set completed_units = completed_units + 1
  where id = target_job_id
  returning completed_units, expected_units into completed, expected;
  update public.ai_reports set progress_completed = completed
  where id = target_report_id;
  if completed = expected then
    update public.ai_report_jobs set stage = 'synthesize', attempt = 0, lease_expires_at = null
    where id = target_job_id and stage = 'slide';
    update public.ai_reports set status = 'synthesizing' where id = target_report_id and status = 'analyzing';
  end if;
  return jsonb_build_object('reportId', target_report_id, 'shouldSynthesize', completed = expected);
end;
$$;

create function public.release_ai_report_slide(
  target_job_id uuid,
  target_slide_alias text,
  target_error_code text,
  target_terminal boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report_id uuid;
  current_attempt integer;
begin
  select slide.report_id, slide.attempt into target_report_id, current_attempt
  from public.ai_report_slides as slide
  join public.ai_report_jobs as job on job.report_id = slide.report_id
  where job.id = target_job_id and slide.slide_alias = target_slide_alias
    and slide.processing_status = 'processing';
  if not found then return false; end if;
  if target_terminal or current_attempt >= 3 then
    update public.ai_report_slides set processing_status = 'failed', lease_expires_at = null,
      safe_error_code = left(target_error_code, 80)
    where report_id = target_report_id and slide_alias = target_slide_alias and processing_status = 'processing';
    update public.ai_report_jobs set status = 'failed', lease_expires_at = null,
      safe_error_code = left(target_error_code, 80) where id = target_job_id;
    update public.ai_reports set status = 'failed', safe_error_code = left(target_error_code, 80)
    where id = target_report_id and status not in ('ready', 'confirmed', 'deleting');
  else
    update public.ai_report_slides set processing_status = 'queued', lease_expires_at = null,
      safe_error_code = left(target_error_code, 80)
    where report_id = target_report_id and slide_alias = target_slide_alias and processing_status = 'processing';
  end if;
  return true;
end;
$$;

create function public.claim_ai_report_synthesis(target_job_id uuid, target_lease_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_job public.ai_report_jobs;
begin
  if target_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'Invalid AI report lease';
  end if;
  update public.ai_report_jobs
  set status = 'running', attempt = attempt + 1,
      lease_expires_at = now() + make_interval(secs => target_lease_seconds)
  where id = target_job_id and stage = 'synthesize' and status = 'running'
    and completed_units = expected_units and attempt < 3
    and (lease_expires_at is null or lease_expires_at < now())
  returning * into claimed_job;
  if not found then return null; end if;
  return jsonb_build_object('jobId', claimed_job.id, 'reportId', claimed_job.report_id, 'attempt', claimed_job.attempt);
end;
$$;

create function public.complete_ai_report(
  target_job_id uuid,
  target_canonical_result jsonb,
  target_display_result jsonb,
  target_code_validation jsonb,
  target_critic_result jsonb,
  target_usage_record jsonb,
  target_actual_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report_id uuid;
  target_owner_id uuid;
  target_revision_id uuid := gen_random_uuid();
begin
  if jsonb_typeof(target_canonical_result) <> 'object'
    or jsonb_typeof(target_display_result) <> 'object'
    or jsonb_typeof(target_code_validation) <> 'object'
    or jsonb_typeof(target_critic_result) <> 'object'
    or jsonb_typeof(target_usage_record) <> 'object'
    or target_actual_cost_usd < 0
  then
    raise exception using errcode = '22023', message = 'Invalid AI report completion';
  end if;
  select report_id, owner_id into target_report_id, target_owner_id
  from public.ai_report_jobs
  where id = target_job_id and stage = 'synthesize' and status = 'running'
    and completed_units = expected_units;
  if not found then return null; end if;

  insert into public.ai_report_revisions(
    id, report_id, owner_id, revision_no, kind, status, display_result,
    selected_claim_ids, code_validation, critic_result, usage_record, actual_cost_usd
  ) values (
    target_revision_id, target_report_id, target_owner_id, 1, 'initial', 'ready', target_display_result,
    coalesce(target_canonical_result -> 'claimIds', '[]'::jsonb), target_code_validation,
    target_critic_result, target_usage_record, target_actual_cost_usd
  );
  update public.ai_reports set status = 'ready', progress_completed = progress_total,
    canonical_result = target_canonical_result, current_revision_id = target_revision_id,
    actual_cost_usd = target_actual_cost_usd, safe_error_code = null
  where id = target_report_id and status in ('synthesizing', 'criticizing');
  update public.ai_report_jobs set stage = 'complete', status = 'succeeded', lease_expires_at = null,
    safe_error_code = null where id = target_job_id;
  return jsonb_build_object('reportId', target_report_id, 'revisionId', target_revision_id);
end;
$$;

create function public.fail_ai_report_job(target_job_id uuid, target_error_code text, target_terminal boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report_id uuid;
  current_attempt integer;
begin
  select report_id, attempt into target_report_id, current_attempt from public.ai_report_jobs
  where id = target_job_id and status in ('queued', 'running');
  if not found then return false; end if;
  if target_terminal or current_attempt >= 3 then
    update public.ai_report_jobs set status = 'failed', lease_expires_at = null,
      safe_error_code = left(target_error_code, 80) where id = target_job_id;
    update public.ai_reports set status = 'failed', safe_error_code = left(target_error_code, 80)
    where id = target_report_id and status not in ('ready', 'confirmed', 'deleting');
  else
    update public.ai_report_jobs set lease_expires_at = null,
      safe_error_code = left(target_error_code, 80) where id = target_job_id;
  end if;
  return true;
end;
$$;

create function public.retry_ai_report(
  target_report_id uuid,
  target_owner_id uuid,
  target_idempotency_key text,
  target_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job public.ai_report_jobs;
  target_job_id uuid;
  expected integer;
  completed integer;
  next_stage text;
begin
  if char_length(target_idempotency_key) not between 16 and 200 or target_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid AI report retry data';
  end if;
  select * into existing_job from public.ai_report_jobs
  where owner_id = target_owner_id and idempotency_key = target_idempotency_key;
  if found then
    if existing_job.request_hash <> target_request_hash or existing_job.report_id <> target_report_id then
      raise exception using errcode = '23505', message = 'Idempotency key payload conflict';
    end if;
    return jsonb_build_object('reportId', existing_job.report_id, 'jobId', existing_job.id, 'stage', existing_job.stage, 'reused', true);
  end if;
  if not exists (select 1 from public.ai_reports where id = target_report_id and owner_id = target_owner_id and status = 'failed') then
    raise exception using errcode = '55000', message = 'AI report is not retryable';
  end if;
  if exists (select 1 from public.ai_report_jobs where report_id = target_report_id and status in ('queued', 'running'))
    or (select count(*) from public.ai_report_jobs where owner_id = target_owner_id and status in ('queued', 'running')) >= 2 then
    raise exception using errcode = '53300', message = 'AI report active job limit exceeded';
  end if;

  update public.ai_report_slides set processing_status = 'queued', attempt = 0,
    lease_expires_at = null, safe_error_code = null
  where report_id = target_report_id and processing_status = 'failed';
  select count(*), count(*) filter (where processing_status = 'succeeded')
  into expected, completed from public.ai_report_slides where report_id = target_report_id;
  next_stage := case when completed = expected then 'synthesize' else 'prepare' end;

  insert into public.ai_report_jobs(
    report_id, owner_id, kind, idempotency_key, request_hash, stage, status,
    expected_units, completed_units
  ) values (
    target_report_id, target_owner_id, 'retry', target_idempotency_key, target_request_hash,
    next_stage, case when next_stage = 'synthesize' then 'running' else 'queued' end,
    expected, completed
  ) returning id into target_job_id;
  update public.ai_reports set status = case when next_stage = 'synthesize' then 'synthesizing' else 'queued' end,
    progress_completed = completed, safe_error_code = null where id = target_report_id;
  return jsonb_build_object('reportId', target_report_id, 'jobId', target_job_id, 'stage', next_stage, 'reused', false);
end;
$$;

revoke all on function public.claim_ai_report_prepare(uuid, integer),
  public.complete_ai_report_prepare(uuid), public.claim_ai_report_slide(uuid, text, integer),
  public.complete_ai_report_slide(uuid, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb),
  public.release_ai_report_slide(uuid, text, text, boolean),
  public.claim_ai_report_synthesis(uuid, integer),
  public.complete_ai_report(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, numeric),
  public.fail_ai_report_job(uuid, text, boolean), public.retry_ai_report(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.claim_ai_report_prepare(uuid, integer),
  public.complete_ai_report_prepare(uuid), public.claim_ai_report_slide(uuid, text, integer),
  public.complete_ai_report_slide(uuid, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb),
  public.release_ai_report_slide(uuid, text, text, boolean),
  public.claim_ai_report_synthesis(uuid, integer),
  public.complete_ai_report(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, numeric),
  public.fail_ai_report_job(uuid, text, boolean), public.retry_ai_report(uuid, uuid, text, text)
to service_role;

alter table public.ai_reports enable row level security;
alter table public.ai_report_materials enable row level security;
alter table public.ai_report_slides enable row level security;
alter table public.ai_report_revisions enable row level security;
alter table public.ai_report_jobs enable row level security;
alter table public.ai_report_storage_cleanup enable row level security;
alter table public.ai_report_cost_calls enable row level security;

create policy "owners view ai reports" on public.ai_reports for select to authenticated
using ((select private.is_admin()) and owner_id = (select auth.uid()));
create policy "owners view ai report materials" on public.ai_report_materials for select to authenticated
using ((select private.is_admin()) and owner_id = (select auth.uid()));
create policy "owners view ai report slides" on public.ai_report_slides for select to authenticated
using ((select private.is_admin()) and owner_id = (select auth.uid()));
create policy "owners view ai report revisions" on public.ai_report_revisions for select to authenticated
using ((select private.is_admin()) and owner_id = (select auth.uid()));

revoke all on public.ai_reports, public.ai_report_materials, public.ai_report_slides,
  public.ai_report_revisions, public.ai_report_jobs, public.ai_report_storage_cleanup
  , public.ai_report_cost_calls
from public, anon, authenticated;
grant select on public.ai_reports, public.ai_report_materials, public.ai_report_slides,
  public.ai_report_revisions to authenticated;
grant all on public.ai_reports, public.ai_report_materials, public.ai_report_slides,
  public.ai_report_revisions, public.ai_report_jobs, public.ai_report_storage_cleanup,
  public.ai_report_cost_calls to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-report-evidence', 'ai-report-evidence', false, 10485760, array['image/jpeg', 'image/png', 'application/json'])
on conflict (id) do update set public = false;

notify pgrst, 'reload schema';

commit;
