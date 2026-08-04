-- 강사는 질문 데이터와 무관하게 관리자·슬라이드쇼의 핀 오버레이만 숨길 수 있다.
-- 기존 강의는 현재 동작을 유지하도록 기본값을 true 로 둔다.
alter table public.lectures
add column show_question_pins boolean not null default true;

comment on column public.lectures.show_question_pins is
'Whether question pin overlays are visible in instructor and presentation views.';
