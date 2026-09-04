-- Existing drafts have no distinct lifecycle in the application. Preserve their
-- lectures and questions by treating them as ended before narrowing the enum.
update public.lectures
set status = 'ended'
where status = 'draft';

-- These policies depend on lectures.status and must be recreated after changing
-- the column's enum type.
drop policy "participants view live courses" on public.courses;
drop policy "participants view live lectures" on public.lectures;
drop policy "participants view live materials" on public.materials;
drop policy "participants view live material versions" on public.material_versions;
drop policy "participants view live slides" on public.slides;
drop policy "participants create anchors in live lectures" on public.region_anchors;
drop policy "participants add live questions" on public.questions;
drop policy "authors update own unanswered questions" on public.questions;

alter table public.lectures alter column status drop default;
alter type public.lecture_status rename to lecture_status_with_draft;
create type public.lecture_status as enum ('live', 'ended', 'archived');

alter table public.lectures
alter column status type public.lecture_status
using status::text::public.lecture_status;

alter table public.lectures alter column status set default 'live';
drop type public.lecture_status_with_draft;

create policy "participants view live courses" on public.courses for select to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1 from public.lectures l
    where l.course_id = courses.id and l.status = 'live'
  )
);

create policy "participants view live lectures" on public.lectures for select to authenticated
using ((select private.is_participant()) and status = 'live');

create policy "participants view live materials" on public.materials for select to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1 from public.lectures l
    where l.id = materials.lecture_id and l.status = 'live'
  )
);

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

create policy "authors update own unanswered questions"
on public.questions
for update
to authenticated
using (
  (select private.is_participant())
  and (select auth.uid()) = author_id
  and status = 'unanswered'
  and exists (
    select 1
    from public.lectures l
    where l.id = questions.lecture_id
      and l.course_id = questions.course_id
      and l.status = 'live'
  )
)
with check (
  (select private.is_participant())
  and (select auth.uid()) = author_id
  and status = 'unanswered'
  and exists (
    select 1
    from public.lectures l
    where l.id = questions.lecture_id
      and l.course_id = questions.course_id
      and l.status = 'live'
  )
);
