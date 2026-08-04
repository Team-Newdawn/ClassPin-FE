-- 수강생이 점뿐 아니라 사각 영역에도 질문을 연결할 수 있게 한다.
-- polygon은 AI/admin용으로 남겨 두고, 사용자 입력은 point/box로 제한한다.
alter table public.region_anchors
drop constraint if exists region_user_point;

alter table public.region_anchors
drop constraint if exists region_user_supported_shape;

alter table public.region_anchors
drop constraint if exists region_box_range;

alter table public.region_anchors
add constraint region_user_supported_shape
check (created_by <> 'user' or kind in ('point', 'box'))
not valid;

alter table public.region_anchors
add constraint region_box_range
check (
  kind <> 'box' or coalesce((
    jsonb_typeof(coords -> 'x') = 'number'
    and jsonb_typeof(coords -> 'y') = 'number'
    and jsonb_typeof(coords -> 'width') = 'number'
    and jsonb_typeof(coords -> 'height') = 'number'
    and (coords ->> 'x')::numeric between 0 and 1
    and (coords ->> 'y')::numeric between 0 and 1
    and (coords ->> 'width')::numeric > 0
    and (coords ->> 'height')::numeric > 0
    and (coords ->> 'x')::numeric + (coords ->> 'width')::numeric <= 1
    and (coords ->> 'y')::numeric + (coords ->> 'height')::numeric <= 1
  ), false)
)
not valid;

alter table public.region_anchors
validate constraint region_user_supported_shape;

alter table public.region_anchors
validate constraint region_box_range;
