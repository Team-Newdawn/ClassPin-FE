-- Shared analysis (docs/instructor-report-authoring.md §4.1, RPT-120..128): one row per material with the AI's slide analysis and
-- question groups, read by the analysis dashboard and by every report of the material. `fingerprint` names the inputs it was
-- made from, so the server calls the AI again only when they change. Server-only (service_role after owner checks), like
-- instructor_reports and lecture_question_groups (which this replaces; that table is dropped after this ships).
create table public.material_analyses (
  material_id uuid primary key references public.materials(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  status text not null check (status in ('running','ready','failed')),
  -- Stable error codes only; provider messages may echo prompt content.
  error text,
  -- { category, failedPages, slides: [{ slideId, page, topic, content?, questionSummary, suggestion, issues, metrics }] }
  slides jsonb,
  -- [{ title, summary, questionIds }]
  groups jsonb,
  -- Dashboard-only extras (RPT-122): { en: { groups: [{ title, summary }], slides: [{ slideId, summary }] } }
  dashboard jsonb,
  provider text not null,
  model text not null,
  -- Start of the run that owns the row; a run writes only while it is still the current one.
  started_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.material_analyses enable row level security;
revoke all on public.material_analyses from public, anon, authenticated;
grant select, insert, update, delete on public.material_analyses to service_role;
