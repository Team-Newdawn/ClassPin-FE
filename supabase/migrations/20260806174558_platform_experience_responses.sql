-- 강의·피드백 참여가 끝난 뒤 받는 플랫폼 자체 이용경험이다. 질문·핀 같은
-- 운영 데이터와 섞지 않고, 두 출처 중 정확히 하나만 외래키로 연결한다.
create table public.platform_experience_responses (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid references public.lectures(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  experience text not null check (char_length(experience) between 1 and 1000),
  improvement text not null check (char_length(improvement) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint platform_experience_response_source check (num_nonnulls(lecture_id, campaign_id) = 1)
);

create index platform_experience_responses_lecture_idx
on public.platform_experience_responses(lecture_id, created_at desc) where lecture_id is not null;
create index platform_experience_responses_campaign_idx
on public.platform_experience_responses(campaign_id, created_at desc) where campaign_id is not null;

alter table public.platform_experience_responses enable row level security;

-- 응답 본문은 해당 강의·캠페인의 소유자만 읽는다. 참여자에게는 자기 응답도
-- 다시 열지 않아, 다른 응답을 조회할 수 있는 API 표면을 만들지 않는다.
create policy "owners view platform experience responses"
on public.platform_experience_responses
for select
to authenticated
using (
  (
    lecture_id is not null
    and exists (
      select 1
      from public.lectures as lecture
      where lecture.id = platform_experience_responses.lecture_id
        and (select private.course_owned(lecture.course_id))
    )
  )
  or (
    campaign_id is not null
    and (select private.campaign_owned(campaign_id))
  )
);

-- 참여 코드를 DB에서 다시 대조한 뒤 저장해 브라우저가 임의의 lecture_id나
-- campaign_id를 보내지 못하게 한다.
create or replace function public.submit_platform_experience_response(
  target_platform text,
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
  target_campaign_id uuid;
  normalized_experience text := btrim(target_experience);
  normalized_improvement text := btrim(target_improvement);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if char_length(normalized_experience) not between 1 and 1000
    or char_length(normalized_improvement) not between 1 and 1000 then
    raise exception 'Response fields must contain 1 to 1000 characters.' using errcode = '23514';
  end if;

  if target_platform = 'lecture' then
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
    )
    values (
      target_lecture_id,
      (select auth.uid()),
      normalized_experience,
      normalized_improvement
    )
    returning id into response_id;
  elsif target_platform = 'feedback' then
    select campaign.id
    into target_campaign_id
    from public.campaigns as campaign
    where campaign.join_code = upper(btrim(target_code))
      and campaign.status in ('live', 'ended');

    if target_campaign_id is null then
      raise exception 'Campaign not found.' using errcode = 'P0002';
    end if;

    insert into public.platform_experience_responses (
      campaign_id,
      author_id,
      experience,
      improvement
    )
    values (
      target_campaign_id,
      (select auth.uid()),
      normalized_experience,
      normalized_improvement
    )
    returning id into response_id;
  else
    raise exception 'Unsupported platform.' using errcode = '22023';
  end if;

  return response_id;
end;
$$;

revoke all on public.platform_experience_responses from public, anon, authenticated;
grant select on public.platform_experience_responses to authenticated;

revoke all on function public.submit_platform_experience_response(text, text, text, text)
from public, anon, authenticated;
grant execute on function public.submit_platform_experience_response(text, text, text, text)
to authenticated;
