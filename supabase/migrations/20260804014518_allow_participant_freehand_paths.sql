-- 자유곡선은 슬라이드에 독립적인 0~1 좌표 배열로 저장한다.
-- 점 개수를 제한해 브라우저에서 과도하게 큰 JSON payload를 만들 수 없게 한다.
create or replace function private.valid_normalized_path(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  points jsonb;
  point jsonb;
  point_x numeric;
  point_y numeric;
begin
  if jsonb_typeof(value) <> 'object'
    or jsonb_typeof(value -> 'x') <> 'number'
    or jsonb_typeof(value -> 'y') <> 'number' then
    return false;
  end if;

  point_x := (value ->> 'x')::numeric;
  point_y := (value ->> 'y')::numeric;
  if point_x not between 0 and 1 or point_y not between 0 and 1 then
    return false;
  end if;

  points := value -> 'points';
  if jsonb_typeof(points) <> 'array'
    or jsonb_array_length(points) not between 2 and 512 then
    return false;
  end if;

  for point in select element from jsonb_array_elements(points) as elements(element)
  loop
    if jsonb_typeof(point) <> 'array' or jsonb_array_length(point) <> 2 then
      return false;
    end if;
    if jsonb_typeof(point -> 0) <> 'number' or jsonb_typeof(point -> 1) <> 'number' then
      return false;
    end if;

    point_x := (point ->> 0)::numeric;
    point_y := (point ->> 1)::numeric;
    if point_x not between 0 and 1 or point_y not between 0 and 1 then
      return false;
    end if;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function private.valid_normalized_path(jsonb) from public, anon;
grant execute on function private.valid_normalized_path(jsonb) to authenticated;

alter table public.region_anchors
drop constraint if exists region_anchors_kind_check;

alter table public.region_anchors
add constraint region_anchors_kind_check
check (kind in ('point', 'box', 'polygon', 'path'))
not valid;

alter table public.region_anchors
drop constraint if exists region_user_supported_shape;

alter table public.region_anchors
add constraint region_user_supported_shape
check (created_by <> 'user' or kind in ('point', 'box', 'path'))
not valid;

alter table public.region_anchors
drop constraint if exists region_path_range;

alter table public.region_anchors
add constraint region_path_range
check (kind <> 'path' or private.valid_normalized_path(coords))
not valid;

alter table public.region_anchors validate constraint region_anchors_kind_check;
alter table public.region_anchors validate constraint region_user_supported_shape;
alter table public.region_anchors validate constraint region_path_range;

comment on function private.valid_normalized_path(jsonb) is
'Validates a 2-512 point freehand path stored in normalized slide coordinates.';
