-- Page images of a source PDF (docs/frontend-performance-audit.md, "브라우저에서 페이지 이미지 만들기", 2026-11-07).
-- The owner's browser renders each page once with pdf.js and uploads `{owner}/{upload}/pages/{page}.jpg` beside
-- `{owner}/{upload}/source.pdf`; `/api/pdf/page` then serves those instead of rendering on the server.
-- Owners already upload and read their own folder; only the bucket's types and the participant read change.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg'
]
where id = 'course-materials';

-- Same gate as before (a participant, a PDF material, a live lecture), now also for that source's page images.
drop policy "participants read live pdf materials" on storage.objects;
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
    where material.type = 'pdf'
      and lecture.status = 'live'
      and (
        version.source_path = storage.objects.name
        or (
          version.source_path like '%/source.pdf'
          and storage.objects.name ~ '^[^/]+/[^/]+/pages/[0-9]+\.jpg$'
          and starts_with(storage.objects.name, left(version.source_path, -length('source.pdf')) || 'pages/')
        )
      )
  )
);
