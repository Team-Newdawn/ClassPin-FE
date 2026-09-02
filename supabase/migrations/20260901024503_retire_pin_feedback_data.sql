begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop policy "owners upload campaign images" on storage.objects;
drop policy "owners delete campaign images" on storage.objects;

lock table storage.objects in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'campaign-images'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'campaign-images must be empty before retiring Pin Feedback';
  end if;
end;
$$;

lock table
  public.campaigns,
  public.campaign_pages,
  public.feedback_pins,
  public.feedback_pin_reactions,
  public.platform_experience_responses
in share row exclusive mode;

do $$
declare
  campaign_count bigint;
  campaign_hash text;
  page_count bigint;
  page_hash text;
  pin_count bigint;
  pin_hash text;
  reaction_count bigint;
  reaction_hash text;
  survey_count bigint;
  survey_hash text;
begin
  select
    count(*),
    encode(extensions.digest(coalesce(string_agg(to_jsonb(row)::text, E'\n' order by row.id), ''), 'sha256'), 'hex')
  into campaign_count, campaign_hash
  from public.campaigns as row;

  select
    count(*),
    encode(extensions.digest(coalesce(string_agg(to_jsonb(row)::text, E'\n' order by row.id), ''), 'sha256'), 'hex')
  into page_count, page_hash
  from public.campaign_pages as row;

  select
    count(*),
    encode(extensions.digest(coalesce(string_agg(to_jsonb(row)::text, E'\n' order by row.id), ''), 'sha256'), 'hex')
  into pin_count, pin_hash
  from public.feedback_pins as row;

  select
    count(*),
    encode(extensions.digest(coalesce(string_agg(to_jsonb(row)::text, E'\n' order by row.pin_id, row.reactor_id), ''), 'sha256'), 'hex')
  into reaction_count, reaction_hash
  from public.feedback_pin_reactions as row;

  select
    count(*),
    encode(extensions.digest(coalesce(string_agg(to_jsonb(row)::text, E'\n' order by row.id), ''), 'sha256'), 'hex')
  into survey_count, survey_hash
  from public.platform_experience_responses as row
  where row.campaign_id is not null;

  if campaign_count + page_count + pin_count + reaction_count + survey_count = 0 then
    return;
  end if;

  if campaign_count <> 24
    or campaign_hash <> '264158445f460d2a711279f03899214f56b1502a878b059289dbcdf05cb7b43d'
    or page_count <> 54
    or page_hash <> '2e6d7b6c59d9ef68a29a16ffdb13a717f7e3297832635ae07a3dd66ad934e5b8'
    or pin_count <> 1001
    or pin_hash <> '9ebd2627927ded8f3ee32951574c9dee6220406d8a9a002e54863b418f8c8e56'
    or reaction_count <> 93
    or reaction_hash <> '81539463cff9067884fee198bf79bc2def6ce491178fdab4ab7f208f318314a3'
    or survey_count <> 0
    or survey_hash <> 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  then
    raise exception using
      errcode = 'P0001',
      message = 'Pin Feedback source changed after backup; create and verify a new backup before retrying';
  end if;
end;
$$;

delete from public.platform_experience_responses
where campaign_id is not null;

drop policy "owners view platform experience responses"
on public.platform_experience_responses;

drop policy "owners manage campaign pages" on public.campaign_pages;
drop policy "only admins create campaigns" on public.campaigns;
drop policy "owners manage campaigns" on public.campaigns;
drop policy "participants view joined campaigns" on public.campaigns;
drop policy "authors update own visible feedback" on public.feedback_pins;
drop policy "authors view own feedback" on public.feedback_pins;
drop policy "owners update campaign feedback" on public.feedback_pins;
drop policy "owners view campaign feedback" on public.feedback_pins;
drop policy "participants add live feedback" on public.feedback_pins;

drop trigger feedback_pin_reactions_sync_count
on public.feedback_pin_reactions;

alter table public.campaigns
  drop constraint campaigns_audience_groups_valid,
  drop constraint campaigns_feedback_categories_valid;
alter table public.campaign_pages
  drop constraint campaign_pages_audience_groups_valid;

drop function public.find_campaign_pages(text, text);
drop function public.find_campaign_player(uuid);
drop function public.find_live_campaign(text);
drop function public.import_feedback_campaign(uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb);
drop function public.set_campaign_audience_groups(uuid, text[]);
drop function public.set_feedback_pin_reaction(uuid, boolean);
drop function public.submit_platform_experience_response(text, text, text, text);

drop function private.campaign_accepts_feedback_category(uuid, text);
drop function private.campaign_is_live(uuid);
drop function private.campaign_owned(uuid);
drop function private.campaign_page_exists(uuid, integer);
drop function private.feedback_categories_are_valid(jsonb);
drop function private.find_campaign_by_code(text);
drop function private.find_campaign_pages_by_code(text, text);
drop function private.find_campaign_player(uuid);
drop function private.import_feedback_campaign(uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb);
drop function private.set_feedback_pin_reaction(uuid, boolean);
drop function private.sync_feedback_pin_reaction_count();
drop function private.valid_campaign_audience_groups(text[]);

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campaigns'
  ) then
    execute 'alter publication supabase_realtime drop table public.campaigns';
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feedback_pins'
  ) then
    execute 'alter publication supabase_realtime drop table public.feedback_pins';
  end if;
end;
$$;

drop index public.platform_experience_responses_campaign_idx;
alter table public.platform_experience_responses
  drop constraint platform_experience_response_source,
  drop constraint platform_experience_responses_campaign_id_fkey,
  drop column campaign_id,
  alter column lecture_id set not null;

create policy "owners view platform experience responses"
on public.platform_experience_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.lectures as lecture
    where lecture.id = platform_experience_responses.lecture_id
      and (select private.course_owned(lecture.course_id))
  )
);

create function public.submit_lecture_experience_response(
  target_code text,
  target_experience text,
  target_improvement text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  response_id uuid;
  target_lecture_id uuid;
  normalized_experience text := btrim(target_experience);
  normalized_improvement text := btrim(target_improvement);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if char_length(normalized_experience) not between 1 and 1000
    or char_length(normalized_improvement) not between 1 and 1000
  then
    raise exception 'Response fields must contain 1 to 1000 characters.' using errcode = '23514';
  end if;

  select lecture.id
  into target_lecture_id
  from public.lectures as lecture
  where lecture.join_code = upper(btrim(target_code))
    and lecture.status in ('live', 'ended');

  if target_lecture_id is null then
    raise exception 'Lecture not found.' using errcode = 'P0002';
  end if;

  insert into public.platform_experience_responses (
    lecture_id,
    author_id,
    experience,
    improvement
  ) values (
    target_lecture_id,
    (select auth.uid()),
    normalized_experience,
    normalized_improvement
  )
  returning id into response_id;

  return response_id;
end;
$$;

revoke all on function public.submit_lecture_experience_response(text, text, text)
from public, anon, authenticated;
grant execute on function public.submit_lecture_experience_response(text, text, text)
to authenticated;

drop index public.material_versions_pin_feedback_source_idx;

drop table public.feedback_pin_reactions;
drop table public.feedback_pins;
drop table public.campaign_pages;
drop table public.campaigns;
drop type public.campaign_status;

notify pgrst, 'reload schema';

commit;
