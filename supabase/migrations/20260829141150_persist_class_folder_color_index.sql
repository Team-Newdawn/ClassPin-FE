alter table public.session_folders
add column color_index smallint;

with ranked_folders as (
  select
    id,
    ((row_number() over (partition by owner_id order by created_at, id) - 1) % 6)::smallint as color_index
  from public.session_folders
)
update public.session_folders as folder
set color_index = ranked.color_index
from ranked_folders as ranked
where ranked.id = folder.id;

alter table public.session_folders
alter column color_index set default 0,
alter column color_index set not null;

alter table public.session_folders
add constraint session_folders_color_index_check
check (color_index between 0 and 5);

-- 기존 owner RLS와 authenticated grant가 새 열에도 그대로 적용된다.
notify pgrst, 'reload schema';
