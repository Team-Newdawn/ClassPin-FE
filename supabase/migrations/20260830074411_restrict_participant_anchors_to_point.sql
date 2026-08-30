alter policy "participants create anchors in live lectures"
on public.region_anchors
with check (
  (select private.is_participant())
  and created_by = 'user'
  and kind = 'point'
  and exists (
    select 1
    from public.slides s
    join public.material_versions mv on mv.id = s.material_version_id
    join public.materials m on m.id = mv.material_id
    join public.lectures l on l.id = m.lecture_id
    where s.id = region_anchors.slide_id and l.status = 'live'
  )
);

comment on policy "participants create anchors in live lectures" on public.region_anchors is
'Participants may create point PIN anchors only; historical box and path anchors remain readable by owners.';
