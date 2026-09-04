-- 슬라이드 삭제는 질문·페이지 번호·현재 페이지를 한 트랜잭션에서 함께 정리한다.
-- 일반 Data API 삭제도 기존 owner 정책만으로 통과하지 않도록 admin 게이트를 겹친다.
create policy "only admins delete slides"
on public.slides
as restrictive
for delete
to authenticated
using ((select private.is_admin()));

-- 질문은 지금까지 DELETE 정책이 없었다. 슬라이드 삭제 RPC가 소유 강의의 질문만
-- 정리할 수 있도록 admin + course owner 조건을 함께 건다.
create policy "admins delete course questions"
on public.questions
for delete
to authenticated
using (
  (select private.is_admin())
  and (select private.course_owned(course_id))
);

create or replace function public.delete_lecture_slide(target_slide_id uuid)
returns table (
  deleted_image_path text,
  deleted_page_index integer,
  deleted_question_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_material_version_id uuid;
  target_lecture_id uuid;
  target_page_index integer;
  target_image_path text;
  slide_count integer;
  removed_questions integer;
  moved_slide record;
begin
  if not (select private.is_admin()) then
    raise exception 'Instructor access is required.' using errcode = '42501';
  end if;

  select s.material_version_id, m.lecture_id, s.page_index, s.image_path
  into target_material_version_id, target_lecture_id, target_page_index, target_image_path
  from public.slides s
  join public.material_versions mv on mv.id = s.material_version_id
  join public.materials m on m.id = mv.material_id
  where s.id = target_slide_id
    and (select private.course_owned(m.course_id))
  for update of mv;

  if not found then
    raise exception 'Slide was not found.' using errcode = '42501';
  end if;

  select count(*)::integer
  into slide_count
  from public.slides s
  where s.material_version_id = target_material_version_id;

  if slide_count <= 1 then
    raise exception 'The final slide cannot be deleted.' using errcode = '22023';
  end if;

  delete from public.questions q
  where q.slide_id = target_slide_id;
  get diagnostics removed_questions = row_count;

  delete from public.slides s
  where s.id = target_slide_id;

  -- unique(material_version_id, page_index)가 즉시 검사되므로 앞 번호부터 하나씩 당긴다.
  for moved_slide in
    select s.id, s.page_index
    from public.slides s
    where s.material_version_id = target_material_version_id
      and s.page_index > target_page_index
    order by s.page_index
  loop
    update public.slides
    set page_index = moved_slide.page_index - 1
    where id = moved_slide.id;
  end loop;

  update public.lectures
  set current_page = case
    when current_page > target_page_index then current_page - 1
    when current_page = target_page_index then least(target_page_index, slide_count - 2)
    else current_page
  end
  where id = target_lecture_id;

  -- 마지막 장을 지우면 뒤 슬라이드 UPDATE가 없으므로, 남은 첫 장에 no-op UPDATE를
  -- 발생시켜 필터된 Realtime 구독도 전체 슬라이드를 다시 읽게 한다.
  update public.slides
  set page_index = page_index
  where id = (
    select s.id
    from public.slides s
    where s.material_version_id = target_material_version_id
    order by s.page_index
    limit 1
  );

  return query select target_image_path, target_page_index, removed_questions;
end;
$$;

revoke all on function public.delete_lecture_slide(uuid) from public, anon, authenticated;
grant execute on function public.delete_lecture_slide(uuid) to authenticated;
