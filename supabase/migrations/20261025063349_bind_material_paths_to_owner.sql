-- Instructors write material rows directly through PostgREST, and the insight routes (service role) and the
-- participant Storage policy trust source_path. Bind it to the course owner's Storage folder on every new write.
-- Legacy rows from before the backend (no owner prefix, no matching object) keep working until their path changes.
-- Fail fast instead of queueing live traffic behind the lecture/material locks.
set local lock_timeout = '5s';

create or replace function private.enforce_owned_source_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.source_path is not distinct from old.source_path and new.material_id = old.material_id then
    return new;
  end if;
  if new.source_path is null or new.source_path ~ '(^|/)\.\.(/|$)|%|\\' or not exists (
    select 1 from public.materials m join public.courses c on c.id = m.course_id
    where m.id = new.material_id and new.source_path like c.owner_id::text || '/%'
  ) then
    raise exception 'Invalid source path' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_owned_source_path() from public, anon, authenticated;

create trigger enforce_owned_source_path
before insert or update of source_path, material_id on public.material_versions
for each row execute function private.enforce_owned_source_path();

-- A material's lecture must belong to the material's own course.
alter table public.lectures add constraint lectures_id_course_id_key unique (id, course_id);
alter table public.materials
  drop constraint materials_lecture_id_fkey,
  add constraint materials_lecture_id_fkey foreign key (lecture_id, course_id)
    references public.lectures(id, course_id) on delete cascade;
