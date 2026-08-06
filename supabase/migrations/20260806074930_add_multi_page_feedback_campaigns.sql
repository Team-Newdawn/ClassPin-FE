-- 피드백 캠페인의 기준 자료를 이미지 1장에서 순서가 있는 여러 페이지로 확장한다.
-- 기존 캠페인은 campaigns.image_*를 0번 페이지로 이관해 동작을 보존한다.

create table public.campaign_pages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  image_path text not null,
  image_width integer not null check (image_width > 0),
  image_height integer not null check (image_height > 0),
  created_at timestamptz not null default now(),
  unique (campaign_id, page_index)
);

create index campaign_pages_campaign_idx on public.campaign_pages(campaign_id, page_index);

insert into public.campaign_pages (campaign_id, page_index, image_path, image_width, image_height)
select id, 0, image_path, image_width, image_height
from public.campaigns
where image_path is not null and image_width is not null and image_height is not null
on conflict (campaign_id, page_index) do nothing;

alter table public.feedback_pins
  add column page_index integer not null default 0 check (page_index >= 0);

create index feedback_pins_campaign_page_created_idx
  on public.feedback_pins(campaign_id, page_index, created_at desc);

-- 핀 INSERT 정책이 페이지 테이블 RLS를 다시 타지 않도록 존재 확인을 private definer로 분리한다.
create or replace function private.campaign_page_exists(target_campaign_id uuid, target_page_index integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_pages
    where campaign_id = target_campaign_id and page_index = target_page_index
  );
$$;
revoke all on function private.campaign_page_exists(uuid, integer) from public, anon, authenticated;
grant execute on function private.campaign_page_exists(uuid, integer) to authenticated;

alter table public.campaign_pages enable row level security;

create policy "owners manage campaign pages" on public.campaign_pages
for all to authenticated
using ((select private.campaign_owned(campaign_id)))
with check ((select private.campaign_owned(campaign_id)));

-- 새 프로젝트의 Data API 기본 노출 변경과 기존 프로젝트의 넓은 default privilege 양쪽에서
-- 같은 결과가 나도록 grants를 명시한다. 참여자는 테이블을 직접 열지 않고 코드 RPC만 쓴다.
revoke all on public.campaign_pages from anon, authenticated;
grant select, insert, delete on public.campaign_pages to authenticated;

-- public에는 invoker 래퍼만 두고, 코드 대조로 RLS를 우회하는 본체는 비노출 private에 둔다.
create or replace function private.find_campaign_by_code(target_code text)
returns setof public.campaigns
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.campaigns
  where (select auth.uid()) is not null
    and char_length(target_code) between 4 and 10
    and join_code = upper(target_code)
    and status in ('live', 'ended');
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

create or replace function private.find_campaign_pages_by_code(target_code text)
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
    and c.join_code = upper(target_code)
    and c.status in ('live', 'ended')
  order by p.page_index;
$$;
revoke all on function private.find_campaign_pages_by_code(text) from public, anon, authenticated;
grant execute on function private.find_campaign_pages_by_code(text) to authenticated;

create or replace function public.find_campaign_pages(target_code text)
returns setof public.campaign_pages
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.find_campaign_pages_by_code(target_code);
$$;
revoke all on function public.find_campaign_pages(text) from public, anon, authenticated;
grant execute on function public.find_campaign_pages(text) to authenticated;

drop policy "participants add live feedback" on public.feedback_pins;
create policy "participants add live feedback" on public.feedback_pins for insert to authenticated
with check (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_is_live(campaign_id))
  and (select private.campaign_page_exists(campaign_id, page_index))
);

notify pgrst, 'reload schema';
