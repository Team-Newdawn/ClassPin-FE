-- 수강생은 라이브 세션에서 아직 답변되지 않은 자기 질문의 유형과 내용만 수정할 수 있다.
-- 질문의 작성자·세션·슬라이드·핀 연결은 column privilege 로 변경을 막는다.
revoke update on public.questions from authenticated;
grant update (category, raw_text, status, updated_at) on public.questions to authenticated;

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

-- 작성자가 Realtime 새로고침 뒤에도 자기 질문의 핀 좌표를 다시 읽을 수 있게 한다.
create policy "question authors view own anchors"
on public.region_anchors
for select
to authenticated
using (
  (select private.is_participant())
  and exists (
    select 1
    from public.questions q
    where q.region_id = region_anchors.id
      and q.author_id = (select auth.uid())
  )
);
