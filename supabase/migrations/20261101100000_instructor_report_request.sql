-- RPT-036 (docs/instructor-report-authoring.md): the instructor's optional prompt from /admin/reports. It steers every AI draft of
-- the report, including a failed draft's retry. Older reports keep null. (Edited 2026-11-04 before reaching production: the
-- template column it first added was dropped with the templates; the report now has one fixed format, RPT-031.)
alter table public.instructor_reports
  add column request text check (char_length(request) <= 500);
