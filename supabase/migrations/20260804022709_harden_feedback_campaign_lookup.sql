-- 참여 코드 조회에 필요한 RLS 우회는 private 함수 안으로 한정한다.
-- public RPC는 invoker로 유지해 Security Advisor가 지적하는 공개 SECURITY DEFINER
-- 엔드포인트를 없애고, 실제 로그인된 사용자만 private 함수를 통과하게 한다.
create or replace function private.find_campaign_by_code(target_code text)
returns setof public.campaigns
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.campaigns c
  where (select auth.uid()) is not null
    and char_length(target_code) between 4 and 10
    and c.join_code = upper(target_code)
    and c.status in ('live', 'ended');
$$;

revoke all on function private.find_campaign_by_code(text) from public, anon, authenticated;
grant execute on function private.find_campaign_by_code(text) to authenticated;

create or replace function public.find_live_campaign(target_code text)
returns setof public.campaigns
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.find_campaign_by_code(target_code);
$$;

revoke all on function public.find_live_campaign(text) from public, anon, authenticated;
grant execute on function public.find_live_campaign(text) to authenticated;
