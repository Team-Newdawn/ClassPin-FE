-- 발표 화면의 청중 참여 QR을 어느 모서리에 배치할지 강의별로 저장한다.
alter table public.lectures
add column if not exists presentation_qr_position text not null default 'bottom-right';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lectures_presentation_qr_position_check'
      and conrelid = 'public.lectures'::regclass
  ) then
    alter table public.lectures
    add constraint lectures_presentation_qr_position_check
    check (presentation_qr_position in ('top-left', 'top-right', 'bottom-left', 'bottom-right'));
  end if;
end
$$;

comment on column public.lectures.presentation_qr_position is
'Corner used for the audience join QR in presentation mode.';
