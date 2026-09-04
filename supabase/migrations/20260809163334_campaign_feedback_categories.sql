-- 내부 분류 키는 기존 enum과 리포트 의미를 보존하고, 캠페인별 표시 이름과 노출 여부만 설정한다.
begin;

create or replace function private.feedback_categories_are_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'object' then false
    else (
      select count(*) = 5
        and count(distinct item.key) = 5
        and bool_and(item.key = any (array['praise', 'improve', 'confusing', 'bug', 'idea']))
        and bool_and(coalesce(jsonb_typeof(item.value) = 'object', false))
        and bool_and(coalesce(jsonb_typeof(item.value -> 'label') = 'string', false))
        and bool_and(coalesce(char_length(item.value ->> 'label') <= 40, false))
        and bool_and(coalesce(jsonb_typeof(item.value -> 'enabled') = 'boolean', false))
        and bool_or(case
          when jsonb_typeof(item.value -> 'enabled') = 'boolean'
            then (item.value ->> 'enabled')::boolean
          else false
        end)
      from jsonb_each(value) as item
    )
  end;
$$;

revoke all on function private.feedback_categories_are_valid(jsonb) from public, anon, authenticated;

alter table public.campaigns
  add column feedback_categories jsonb not null default
    '{"praise":{"label":"","enabled":true},"improve":{"label":"","enabled":true},"confusing":{"label":"","enabled":true},"bug":{"label":"","enabled":true},"idea":{"label":"","enabled":true}}'::jsonb,
  add constraint campaigns_feedback_categories_valid
    check (private.feedback_categories_are_valid(feedback_categories));

create or replace function private.campaign_accepts_feedback_category(
  target_campaign_id uuid,
  target_category public.feedback_category
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaigns
    where id = target_campaign_id
      and status = 'live'
      and (feedback_categories -> target_category::text ->> 'enabled')::boolean
  );
$$;

revoke all on function private.campaign_accepts_feedback_category(uuid, public.feedback_category) from public, anon, authenticated;
grant execute on function private.campaign_accepts_feedback_category(uuid, public.feedback_category) to authenticated;

drop policy "participants add live feedback" on public.feedback_pins;
create policy "participants add live feedback" on public.feedback_pins for insert to authenticated
with check (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_accepts_feedback_category(campaign_id, category))
  and (select private.campaign_page_exists(campaign_id, page_index))
);

drop policy "authors update own visible feedback" on public.feedback_pins;
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
