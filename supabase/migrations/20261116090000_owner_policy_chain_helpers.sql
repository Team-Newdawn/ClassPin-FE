-- Owner policies on material_versions, slides, region_anchors and slide_instructor_notes walked
-- slides -> material_versions -> materials inside EXISTS, so each of those tables' own RLS ran again for every row.
-- 2026-11-16, production: the instructor course graph (GET /instructor/courses) took 415 ms mean in Postgres and read
-- ~44,000 buffers for one account with 1,169 questions (materials was scanned 4,890 times) - docs/frontend-performance-audit.md.
--
-- These helpers read the same chain once with the definer's rights, like private.course_owned, so a row costs a few
-- primary-key lookups. The rule is unchanged: a row is the caller's when its course's owner_id is auth.uid().
-- Participant policies are not touched.

create or replace function private.material_owned(target_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materials m
    join public.courses c on c.id = m.course_id
    where m.id = target_material_id and c.owner_id = (select auth.uid())
  );
$$;

create or replace function private.material_version_owned(target_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.material_versions v
    join public.materials m on m.id = v.material_id
    join public.courses c on c.id = m.course_id
    where v.id = target_version_id and c.owner_id = (select auth.uid())
  );
$$;

create or replace function private.slide_owned(target_slide_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.slides s
    join public.material_versions v on v.id = s.material_version_id
    join public.materials m on m.id = v.material_id
    join public.courses c on c.id = m.course_id
    where s.id = target_slide_id and c.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.material_owned(uuid) from public, anon, authenticated;
revoke all on function private.material_version_owned(uuid) from public, anon, authenticated;
revoke all on function private.slide_owned(uuid) from public, anon, authenticated;
grant execute on function private.material_owned(uuid) to authenticated;
grant execute on function private.material_version_owned(uuid) to authenticated;
grant execute on function private.slide_owned(uuid) to authenticated;

alter policy "owners manage material versions" on public.material_versions
  using ((select private.material_owned(material_versions.material_id)))
  with check ((select private.material_owned(material_versions.material_id)));

alter policy "owners manage slides" on public.slides
  using ((select private.material_version_owned(slides.material_version_id)))
  with check ((select private.material_version_owned(slides.material_version_id)));

alter policy "owners view anchors" on public.region_anchors
  using ((select private.slide_owned(region_anchors.slide_id)));

alter policy "owners manage slide instructor notes" on public.slide_instructor_notes
  using ((select private.is_admin()) and (select private.slide_owned(slide_instructor_notes.slide_id)))
  with check ((select private.is_admin()) and (select private.slide_owned(slide_instructor_notes.slide_id)));

-- Foreign keys without an index (Supabase advisor): joins and cascading deletes on these columns scanned the table.
create index if not exists materials_course_id_idx on public.materials (course_id);
create index if not exists questions_slide_id_idx on public.questions (slide_id);
create index if not exists questions_region_id_idx on public.questions (region_id);
create index if not exists region_anchors_slide_id_idx on public.region_anchors (slide_id);
create index if not exists region_anchors_material_version_id_idx on public.region_anchors (material_version_id);
create index if not exists answers_author_id_idx on public.answers (author_id);
