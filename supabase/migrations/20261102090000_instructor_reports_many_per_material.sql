-- RPT-001 (2026-11-02): a material may have several reports (e.g. one per template), so drop the one-per-material key.
-- instructor_reports_material still indexes material_id lookups.
alter table public.instructor_reports drop constraint if exists instructor_reports_owner_id_material_id_key;
