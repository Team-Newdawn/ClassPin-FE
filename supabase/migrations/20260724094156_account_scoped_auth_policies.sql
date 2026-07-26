-- 강사 계정은 자기 owner_id 데이터만 보고, 라이브 공개 정책은 익명 participant에게만 적용한다.
-- authenticated 역할에는 Google 사용자와 익명 사용자가 모두 포함되므로 역할 검사가 필요하다.
create or replace function private.is_participant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'participant'
  );
$$;
revoke all on function private.is_participant() from public, anon, authenticated;
grant execute on function private.is_participant() to authenticated;
drop policy "participants view live courses" on public.courses;
create policy "participants view live courses" on public.courses for select to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1 from public.lectures l
    where l.course_id = courses.id and l.status = 'live'
  )
);
drop policy "participants view live lectures" on public.lectures;
create policy "participants view live lectures" on public.lectures for select to authenticated
using ((select private.is_participant()) and status = 'live');
drop policy "participants view live materials" on public.materials;
create policy "participants view live materials" on public.materials for select to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1 from public.lectures l
    where l.id = materials.lecture_id and l.status = 'live'
  )
);
drop policy "participants view live material versions" on public.material_versions;
create policy "participants view live material versions" on public.material_versions for select to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1
    from public.materials m
    join public.lectures l on l.id = m.lecture_id
    where m.id = material_versions.material_id and l.status = 'live'
  )
);
drop policy "participants view live slides" on public.slides;
create policy "participants view live slides" on public.slides for select to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1
    from public.material_versions mv
    join public.materials m on m.id = mv.material_id
    join public.lectures l on l.id = m.lecture_id
    where mv.id = slides.material_version_id and l.status = 'live'
  )
);
drop policy "participants create anchors in live lectures" on public.region_anchors;
create policy "participants create anchors in live lectures" on public.region_anchors for insert to authenticated
with check (
  (select private.is_participant())
  and created_by = 'user'
  and exists (
    select 1
    from public.slides s
    join public.material_versions mv on mv.id = s.material_version_id
    join public.materials m on m.id = mv.material_id
    join public.lectures l on l.id = m.lecture_id
    where s.id = region_anchors.slide_id and l.status = 'live'
  )
);
drop policy "participants add live questions" on public.questions;
create policy "participants add live questions" on public.questions for insert to authenticated
with check (
  (select private.is_participant())
  and (select auth.uid()) = author_id
  and status = 'unanswered'
  and exists (
    select 1 from public.lectures l
    where l.id = questions.lecture_id
      and l.course_id = questions.course_id
      and l.status = 'live'
  )
);
drop policy "authors view own questions" on public.questions;
create policy "authors view own questions" on public.questions for select to authenticated
using ((select private.is_participant()) and (select auth.uid()) = author_id);
drop policy "question authors view answers" on public.answers;
create policy "question authors view answers" on public.answers for select to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1 from public.questions q
    where q.id = answers.question_id and q.author_id = (select auth.uid())
  )
);
