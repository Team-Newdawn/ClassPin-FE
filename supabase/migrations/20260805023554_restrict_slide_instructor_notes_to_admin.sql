drop policy if exists "owners manage slide instructor notes"
on public.slide_instructor_notes;

create policy "owners manage slide instructor notes"
on public.slide_instructor_notes
for all
to authenticated
using (
  (select private.is_admin())
  and exists (
    select 1
    from public.slides s
    join public.material_versions mv on mv.id = s.material_version_id
    join public.materials m on m.id = mv.material_id
    where s.id = slide_instructor_notes.slide_id
      and (select private.course_owned(m.course_id))
  )
)
with check (
  (select private.is_admin())
  and exists (
    select 1
    from public.slides s
    join public.material_versions mv on mv.id = s.material_version_id
    join public.materials m on m.id = mv.material_id
    where s.id = slide_instructor_notes.slide_id
      and (select private.course_owned(m.course_id))
  )
);
