alter table public.slides
  alter column image_path drop not null,
  add column source_page_index integer check (source_page_index >= 0),
  add constraint slides_exactly_one_source
    check (num_nonnulls(image_path, source_page_index) = 1);

create unique index slides_material_source_page_idx
on public.slides(material_version_id, source_page_index)
where source_page_index is not null;

create policy "participants read live pdf materials"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'course-materials'
  and (select private.is_participant())
  and exists (
    select 1
    from public.material_versions as version
    join public.materials as material on material.id = version.material_id
    join public.lectures as lecture on lecture.id = material.lecture_id
    where version.source_path = storage.objects.name
      and material.type = 'pdf'
      and lecture.status = 'live'
  )
);
