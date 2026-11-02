-- Question types without a report (docs/instructor-insight-dashboard.md DSH-034): the AI's topic groups for a lecture's
-- questions, kept with the question ids they were made from so the server calls the AI again only when that set changes.
-- Server-only (service_role after owner checks), like instructor_reports and lecture_audience_records.
create table public.lecture_question_groups (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_ids jsonb not null,
  groups jsonb not null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);
alter table public.lecture_question_groups enable row level security;
revoke all on public.lecture_question_groups from public, anon, authenticated;
grant select, insert, update, delete on public.lecture_question_groups to service_role;
