-- 여러 강의자 탭에서 동시에 추가해도 page_index가 충돌하지 않도록
-- material_versions 행을 잠근 한 트랜잭션 안에서 덱 끝 번호를 계산한다.
create or replace function public.append_lecture_slides(
  target_material_version_id uuid,
  new_slides jsonb
)
returns setof public.slides
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_page_index integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Instructor access is required.' using errcode = '42501';
  end if;

  if new_slides is null
    or jsonb_typeof(new_slides) <> 'array'
    or jsonb_array_length(new_slides) < 1
    or jsonb_array_length(new_slides) > 20 then
    raise exception 'Between 1 and 20 slides are required.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new_slides) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'id', '') = ''
      or coalesce(item.value ->> 'image_path', '') = ''
      or item.value ->> 'image_path' not like (select auth.uid())::text || '/%'
      or item.value ->> 'image_path' like '%..%'
  ) then
    raise exception 'Slide payload is invalid.' using errcode = '22023';
  end if;

  perform 1
  from public.material_versions mv
  join public.materials m on m.id = mv.material_id
  where mv.id = target_material_version_id
    and (select private.course_owned(m.course_id))
  for update of mv;

  if not found then
    raise exception 'Material version was not found.' using errcode = '42501';
  end if;

  select coalesce(max(s.page_index) + 1, 0)
  into next_page_index
  from public.slides s
  where s.material_version_id = target_material_version_id;

  return query
  insert into public.slides (id, material_version_id, page_index, image_path)
  select
    (item.value ->> 'id')::uuid,
    target_material_version_id,
    (next_page_index + item.position - 1)::integer,
    item.value ->> 'image_path'
  from jsonb_array_elements(new_slides) with ordinality as item(value, position)
  returning *;
end;
$$;

revoke all on function public.append_lecture_slides(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.append_lecture_slides(uuid, jsonb) to authenticated;

-- RPC가 실패하면 앱이 먼저 올린 렌더 이미지를 회수할 수 있어야 한다.
create policy "owners delete rendered slides"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lecture-slides'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_admin())
);

-- 슬라이드 행 추가를 강의자·발표·청중 탭에 즉시 전달한다.
do $$ begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'slides'
  ) then
    alter publication supabase_realtime add table public.slides;
  end if;
end $$;
