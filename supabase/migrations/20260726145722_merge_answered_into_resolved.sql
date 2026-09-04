-- 강사 화면에서 '답변 등록'과 '해결 처리'는 더 이상 다른 상태가 아니다. 둘 다 resolved 로 끝난다.
-- 남아 있는 answered 행과, 답변만 쌓인 채 상태가 unanswered 로 뒤처진 행을 함께 정리한다.
-- 후자는 답변 등록이 questions.status 를 올리지 않던 시절에 생긴 행이다.
update public.questions q
set status = 'resolved', updated_at = now()
where q.status = 'answered'
   or (q.status = 'unanswered' and exists (select 1 from public.answers a where a.question_id = q.id));
