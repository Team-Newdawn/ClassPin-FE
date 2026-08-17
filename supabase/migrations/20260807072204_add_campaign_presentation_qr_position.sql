alter table public.campaigns
add column if not exists presentation_qr_position text not null default 'bottom-right';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaigns'::regclass
      and conname = 'campaigns_presentation_qr_position_check'
  ) then
    alter table public.campaigns
    add constraint campaigns_presentation_qr_position_check
    check (presentation_qr_position in ('top-left', 'top-right', 'bottom-left', 'bottom-right'));
  end if;
end
$$;

comment on column public.campaigns.presentation_qr_position is
  'Feedback player audience QR corner.';

notify pgrst, 'reload schema';
