-- Report templates (docs/instructor-report-authoring.md RPT-036): the form the instructor picked on /admin/reports and their
-- optional extra request. Both steer every AI draft of the report, including redrafts. Older reports keep null (AI-chosen form).
alter table public.instructor_reports
  add column template text check (template in ('executive', 'improvement', 'summary', 'blank')),
  add column request text check (char_length(request) <= 500);
