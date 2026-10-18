-- CLASS-LIVE-006: 모바일 리모컨과 발표 PC가 PIN 본문 표시 방식을 공유한다.
-- 기존 lectures owner RLS와 UPDATE Realtime을 재사용한다.
alter table public.lectures add column show_question_labels boolean not null default false;
