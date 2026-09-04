-- 카테고리는 캠페인마다 추가·삭제되므로 고정 enum 대신 설정 key(text)를 저장한다.
-- 활성 카테고리가 없으면 category를 null로 저장해 본문만 받는다.
begin;

drop policy "participants add live feedback" on public.feedback_pins;
drop policy "authors update own visible feedback" on public.feedback_pins;
drop function private.campaign_accepts_feedback_category(uuid, public.feedback_category);

alter table public.campaigns drop constraint campaigns_feedback_categories_valid;

create or replace function private.feedback_categories_are_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'object' then false
    else (
      select count(*) <= 50
        and coalesce(bool_and(coalesce(item.key ~ '^[a-z0-9][a-z0-9-]{0,63}$', false)), true)
        and coalesce(bool_and(coalesce(jsonb_typeof(item.value) = 'object', false)), true)
        and coalesce(bool_and(coalesce(jsonb_typeof(item.value -> 'label') = 'string', false)), true)
        and coalesce(bool_and(coalesce(char_length(item.value ->> 'label') <= 40, false)), true)
        and coalesce(bool_and(coalesce((item.value ->> 'label') = btrim(item.value ->> 'label'), false)), true)
        and coalesce(bool_and(coalesce(
          char_length(item.value ->> 'label') > 0
          or item.key = any (array['praise', 'improve', 'confusing', 'bug', 'idea'])
        , false)), true)
        and coalesce(bool_and(coalesce(jsonb_typeof(item.value -> 'enabled') = 'boolean', false)), true)
      from jsonb_each(value) as item
    )
  end;
$$;

alter table public.campaigns
  add constraint campaigns_feedback_categories_valid
    check (private.feedback_categories_are_valid(feedback_categories));

alter table public.feedback_pins
  alter column category drop default,
  alter column category drop not null,
  alter column category type text using category::text;

drop type public.feedback_category;

create or replace function private.campaign_accepts_feedback_category(
  target_campaign_id uuid,
  target_category text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaigns c
    where c.id = target_campaign_id
      and c.status = 'live'
      and case
        when target_category is null then not exists (
          select 1
          from jsonb_each(c.feedback_categories) as item
          where (item.value ->> 'enabled')::boolean
        )
        else coalesce((c.feedback_categories -> target_category ->> 'enabled')::boolean, false)
      end
  );
$$;

revoke all on function private.campaign_accepts_feedback_category(uuid, text) from public, anon, authenticated;
grant execute on function private.campaign_accepts_feedback_category(uuid, text) to authenticated;

create policy "participants add live feedback" on public.feedback_pins for insert to authenticated
with check (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_accepts_feedback_category(campaign_id, category))
  and (select private.campaign_page_exists(campaign_id, page_index))
);

create policy "authors update own visible feedback" on public.feedback_pins for update to authenticated
using (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_is_live(campaign_id))
)
with check (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_accepts_feedback_category(campaign_id, category))
);

notify pgrst, 'reload schema';

commit;
