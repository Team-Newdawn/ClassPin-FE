-- 강의 슬라이드쇼와 피드백 플레이어의 참여 QR 표시 여부를 관리 화면에서 제어한다.
-- 기존 발표 화면은 그대로 유지하도록 기본값을 true 로 둔다.
alter table public.lectures
add column if not exists show_presentation_qr boolean not null default true;

alter table public.campaigns
add column if not exists show_presentation_qr boolean not null default true;

comment on column public.lectures.show_presentation_qr is
'Whether the audience join QR is visible in the lecture presentation.';

comment on column public.campaigns.show_presentation_qr is
'Whether the audience join QR is visible in the feedback player.';
