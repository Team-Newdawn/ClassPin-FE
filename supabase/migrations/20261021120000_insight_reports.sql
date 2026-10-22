-- Insight reports: one row per analysis run. Only the server (service_role) touches it after owner checks.
create table public.ai_insight_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null,
  status text not null default 'running' check (status in ('running','failed','ready','confirmed')),
  body jsonb,
  error text,
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check ((status in ('ready','confirmed')) = (body is not null)),
  check ((status = 'confirmed') = (confirmed_at is not null))
);
create index ai_insight_reports_owner on public.ai_insight_reports(owner_id, created_at desc);
alter table public.ai_insight_reports enable row level security;
revoke all on public.ai_insight_reports from public, anon, authenticated;
grant select, insert, update, delete on public.ai_insight_reports to service_role;
