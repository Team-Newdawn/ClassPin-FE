-- 관리자가 캠페인마다 참여자 그룹을 만들고, 각 페이지의 공개 대상을 고른다.
-- 그룹이 하나도 없으면 참여자에게 모든 페이지를 보여 기존 캠페인의 동작을 보존한다.

create function private.valid_campaign_audience_groups(groups text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select groups is not null
    and cardinality(groups) <= 20
    and not exists (
      select 1 from unnest(groups) as group_name
      where group_name is null
        or group_name <> btrim(group_name)
        or char_length(group_name) not between 1 and 40
    )
    and cardinality(groups) = (
      select count(distinct lower(group_name)) from unnest(groups) as group_name
    );
$$;
revoke all on function private.valid_campaign_audience_groups(text[]) from public, anon, authenticated;
grant execute on function private.valid_campaign_audience_groups(text[]) to authenticated;

alter table public.campaigns
  add column audience_groups text[] not null default '{}'::text[],
  add constraint campaigns_audience_groups_valid
    check (private.valid_campaign_audience_groups(audience_groups));

alter table public.campaign_pages
  add column audience_groups text[] not null default '{}'::text[],
  add constraint campaign_pages_audience_groups_valid
    check (private.valid_campaign_audience_groups(audience_groups));

-- 테이블 전체 UPDATE 권한은 열지 않고 관리자가 바꿔야 하는 컬럼만 허용한다.
grant update (audience_groups) on public.campaign_pages to authenticated;

-- 그룹을 삭제할 때 페이지에 남은 연결도 같은 트랜잭션에서 제거한다.
create function public.set_campaign_audience_groups(target_campaign_id uuid, target_audience_groups text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.valid_campaign_audience_groups(target_audience_groups)) then
    raise exception 'Invalid audience groups';
  end if;

  update public.campaign_pages as page
  set audience_groups = array(
    select group_name
    from unnest(page.audience_groups) as group_name
    where group_name = any(target_audience_groups)
  )
  where page.campaign_id = target_campaign_id;

  update public.campaigns
  set audience_groups = target_audience_groups, updated_at = now()
  where id = target_campaign_id;

  if not found then
    raise exception 'Campaign not found';
  end if;
end;
$$;
revoke all on function public.set_campaign_audience_groups(uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_campaign_audience_groups(uuid, text[]) to authenticated;

-- 예전 1-인자 RPC를 남기면 그룹 분기를 건너뛰고 모든 페이지를 요청할 수 있다.
drop function public.find_campaign_pages(text);
drop function private.find_campaign_pages_by_code(text);

create function private.find_campaign_pages_by_code(target_code text, target_audience_group text)
returns setof public.campaign_pages
language sql
stable
security definer
set search_path = ''
as $$
  select page.*
  from public.campaign_pages as page
  join public.campaigns as campaign on campaign.id = page.campaign_id
  where (select auth.uid()) is not null
    and char_length(target_code) between 4 and 10
    and campaign.join_code = upper(target_code)
    and campaign.status in ('live', 'ended')
    and (
      cardinality(campaign.audience_groups) = 0
      or (
        target_audience_group = any(campaign.audience_groups)
        and target_audience_group = any(page.audience_groups)
      )
    )
  order by page.page_index;
$$;
revoke all on function private.find_campaign_pages_by_code(text, text) from public, anon, authenticated;
grant execute on function private.find_campaign_pages_by_code(text, text) to authenticated;

create function public.find_campaign_pages(target_code text, target_audience_group text default null)
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
