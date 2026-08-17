-- 발표 메모는 참여자도 읽는 slides 행과 분리한다. RLS는 행 단위이므로
-- slides에 private 컬럼을 추가하면 Data API에서 컬럼을 직접 조회할 수 있다.
create table public.slide_instructor_notes (
  slide_id uuid primary key references public.slides(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.slide_instructor_notes enable row level security;

create policy "owners manage slide instructor notes"
on public.slide_instructor_notes
for all
to authenticated
using (
  exists (
    select 1
    from public.slides s
    join public.material_versions mv on mv.id = s.material_version_id
    join public.materials m on m.id = mv.material_id
    where s.id = slide_instructor_notes.slide_id
      and (select private.course_owned(m.course_id))
  )
)
with check (
  exists (
    select 1
    from public.slides s
    join public.material_versions mv on mv.id = s.material_version_id
    join public.materials m on m.id = mv.material_id
    where s.id = slide_instructor_notes.slide_id
      and (select private.course_owned(m.course_id))
  )
);

revoke all on public.slide_instructor_notes from public, anon, authenticated;
grant select, insert, update, delete on public.slide_instructor_notes to authenticated;

comment on table public.slide_instructor_notes is
  'Owner-only per-slide speaking notes. Never queried by audience clients.';
