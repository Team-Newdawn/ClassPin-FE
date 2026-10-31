-- A participant question must point at a slide of its own lecture. Direct PostgREST inserts could store a null or
-- foreign slide_id, which makes the instructor's insight analysis reject the whole lecture (ORPHAN_QUESTION).
-- ohpin_submit_point_question already validates the slide and runs under this policy unchanged.
set local lock_timeout = '5s';

drop policy "participants add live questions" on public.questions;
create policy "participants add live questions" on public.questions for insert to authenticated
with check (
  (select private.is_participant())
  and (select auth.uid()) = author_id
  and status = 'unanswered'
  and (select private.question_category_enabled(lecture_id, category))
  and exists (
    select 1 from public.lectures as lecture
    where lecture.id = questions.lecture_id
      and lecture.course_id = questions.course_id
      and lecture.status = 'live'
  )
  and exists (
    select 1 from public.slides as slide
    join public.material_versions as version on version.id = slide.material_version_id
    join public.materials as material on material.id = version.material_id
    where slide.id = questions.slide_id
      and material.lecture_id = questions.lecture_id
  )
);
