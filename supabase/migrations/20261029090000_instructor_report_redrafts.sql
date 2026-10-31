-- AI redrafts that replaced an existing document (docs/instructor-report-authoring.md RPT-034): production allows 2 per report.
alter table public.instructor_reports add column redrafts int not null default 0 check (redrafts >= 0);
