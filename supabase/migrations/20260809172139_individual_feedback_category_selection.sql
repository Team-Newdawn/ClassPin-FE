-- 카테고리별 enabled 상태를 관리자가 직접 선택하고, 삭제된 과거 항목은 archived로 보존한다.
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
      select count(*) <= 50
        and count(*) filter (where item.value -> 'archived' is distinct from 'true'::jsonb) <= 20
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
        and coalesce(bool_and(coalesce(
          item.value -> 'archived' is null
          or jsonb_typeof(item.value -> 'archived') = 'boolean'
        , false)), true)
      from jsonb_each(value) as item
    )
  end;
$$;

-- CHECK 제약은 UPDATE 호출자의 함수 실행 권한으로 평가된다.
-- 함수는 immutable JSON 검증만 수행하므로 관리자 역할에만 실행을 허용한다.
grant execute on function private.feedback_categories_are_valid(jsonb) to authenticated;

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
          where item.value -> 'enabled' = 'true'::jsonb
            and item.value -> 'archived' is distinct from 'true'::jsonb
        )
        else coalesce((c.feedback_categories -> target_category ->> 'enabled')::boolean, false)
          and not coalesce((c.feedback_categories -> target_category ->> 'archived')::boolean, false)
      end
  );
$$;

revoke all on function private.campaign_accepts_feedback_category(uuid, text) from public, anon, authenticated;
grant execute on function private.campaign_accepts_feedback_category(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
