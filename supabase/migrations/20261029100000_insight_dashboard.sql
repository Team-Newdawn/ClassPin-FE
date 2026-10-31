-- Lecture insight dashboard (docs/instructor-insight-dashboard.md DSH-020): the player's minute samples and slide changes,
-- and the AI analysis a report was drafted from (its `groups` are the dashboard topics). Server-only, like both tables.
alter table public.lecture_audience_records
  add column samples jsonb not null default '[]',
  add column slide_changes jsonb not null default '[]';
alter table public.instructor_reports add column analysis jsonb;
