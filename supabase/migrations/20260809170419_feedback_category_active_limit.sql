-- 관리자 UI의 활성 카테고리 상한을 API 우회 요청에도 동일하게 적용한다.
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
        and count(*) filter (where item.value -> 'enabled' = 'true'::jsonb) <= 20
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

notify pgrst, 'reload schema';
