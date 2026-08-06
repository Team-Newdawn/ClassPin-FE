-- 참여자가 고른 유형에 따라 캠페인 페이지를 나눈다. 관리자 소유자 조회와 플레이어는
-- campaign_pages를 직접 읽으므로 전체 페이지를 그대로 받는다.

alter table public.campaign_pages
  add column audience_groups text[] not null
  default array['design_sprint', 'ai_playground', 'event']::text[],
  add constraint campaign_pages_audience_groups_valid check (
    audience_groups <@ array['design_sprint', 'ai_playground', 'event']::text[]
  );

-- 테이블 전체 UPDATE 권한은 열지 않고 관리자가 바꿔야 하는 컬럼만 허용한다.
grant update (audience_groups) on public.campaign_pages to authenticated;

-- 예전 1-인자 RPC를 남기면 참여자가 유형 필터 없이 모든 페이지를 요청할 수 있다.
drop function public.find_campaign_pages(text);
drop function private.find_campaign_pages_by_code(text);

create function private.find_campaign_pages_by_code(target_code text, target_audience_group text)
returns setof public.campaign_pages
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.campaign_pages p
  join public.campaigns c on c.id = p.campaign_id
  where (select auth.uid()) is not null
    and char_length(target_code) between 4 and 10
    and target_audience_group = any (array['design_sprint', 'ai_playground', 'event']::text[])
    and target_audience_group = any (p.audience_groups)
    and c.join_code = upper(target_code)
    and c.status in ('live', 'ended')
  order by p.page_index;
$$;
revoke all on function private.find_campaign_pages_by_code(text, text) from public, anon, authenticated;
grant execute on function private.find_campaign_pages_by_code(text, text) to authenticated;

create function public.find_campaign_pages(target_code text, target_audience_group text)
returns setof public.campaign_pages
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.find_campaign_pages_by_code(target_code, target_audience_group);
$$;
revoke all on function public.find_campaign_pages(text, text) from public, anon, authenticated;
grant execute on function public.find_campaign_pages(text, text) to authenticated;

notify pgrst, 'reload schema';
