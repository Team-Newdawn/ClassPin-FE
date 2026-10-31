-- Instructor reports (docs/instructor-report-authoring.md §9): one editable report per material, and the live audience
-- count the player records at lecture end. Only the server (service_role) touches either table after owner checks.
create table public.instructor_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Deleting a course cascades to its materials; a report quoting their questions goes with them.
  material_id uuid not null references public.materials(id) on delete cascade,
  lecture_id uuid not null,
  title text not null,
  file_name text not null,
  status text not null default 'drafting' check (status in ('drafting','failed','ready')),
  error text,
  -- A failed redraft keeps the last document, so only `ready` requires one.
  document jsonb check (status <> 'ready' or document is not null),
  previous_document jsonb,
  messages jsonb not null default '[]',
  -- Start of the latest AI draft run: daily quota, stale-run detection, and the guard that keeps an old run from finishing a newer one.
  drafted_at timestamptz,
  created_at timestamptz not null default now(),
  -- Document/status version for the editor's 409 check; chat turns do not bump it.
  updated_at timestamptz not null default now(),
  unique (owner_id, material_id)
);
create index instructor_reports_owner on public.instructor_reports(owner_id, updated_at desc);
create index instructor_reports_material on public.instructor_reports(material_id);
alter table public.instructor_reports enable row level security;
revoke all on public.instructor_reports from public, anon, authenticated;
grant select, insert, update, delete on public.instructor_reports to service_role;

create table public.lecture_audience_records (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  audience int not null check (audience >= 0),
  peak_audience int not null check (peak_audience >= 0),
  recorded_at timestamptz not null default now()
);
alter table public.lecture_audience_records enable row level security;
revoke all on public.lecture_audience_records from public, anon, authenticated;
grant select, insert, update, delete on public.lecture_audience_records to service_role;
