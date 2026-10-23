-- Deleting a course (ohpin_delete_course) cascades to its materials; reports summarizing those questions must go with them.
delete from public.ai_insight_reports r where not exists (select 1 from public.materials m where m.id = r.material_id);
alter table public.ai_insight_reports
  add constraint ai_insight_reports_material_id_fkey foreign key (material_id) references public.materials(id) on delete cascade;
create index ai_insight_reports_material on public.ai_insight_reports(material_id);
