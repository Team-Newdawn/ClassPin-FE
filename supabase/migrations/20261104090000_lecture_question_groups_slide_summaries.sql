-- DSH-033 (2026-11-04): the dashboard's per-slide analysis of PIN questions, made with the question groups and without a report.
-- [{ "slideId": uuid, "summary": text }]; null on rows grouped before this column, which the route regroups once.
alter table public.lecture_question_groups add column slide_summaries jsonb;
