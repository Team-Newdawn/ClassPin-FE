-- Pin Class Phase 0 schema
-- Anonymous Auth must be enabled: students receive an auth.uid() without sign-up UI.

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;
create schema if not exists private;

create type public.lecture_status as enum ('draft', 'live', 'ended', 'archived');
create type public.question_status as enum ('unanswered', 'answered', 'resolved', 'archived');
create type public.question_category as enum ('concept', 'why', 'example', 'error', 'important');

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  subject_domain text,
  visibility text not null default 'link' check (visibility in ('private', 'link', 'public')),
  created_at timestamptz not null default now()
);

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  seq_no integer not null default 1 check (seq_no > 0),
  title text not null check (char_length(title) between 1 and 120),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6,10}$'),
  interaction_mode text not null default 'live' check (interaction_mode in ('live', 'async', 'hybrid')),
  status public.lecture_status not null default 'draft',
  current_page integer not null default 0 check (current_page >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, seq_no)
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  type text not null check (type in ('slide_deck', 'pdf', 'image')),
  file_name text not null,
  created_at timestamptz not null default now()
);

create table public.material_versions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  version_no integer not null default 1 check (version_no > 0),
  source_path text not null,
  checksum text,
  created_at timestamptz not null default now(),
  unique (material_id, version_no)
);

create table public.slides (
  id uuid primary key default gen_random_uuid(),
  material_version_id uuid not null references public.material_versions(id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  image_path text not null,
  width_px integer check (width_px > 0),
  height_px integer check (height_px > 0),
  created_at timestamptz not null default now(),
  unique (material_version_id, page_index)
);

create table public.region_anchors (
  id uuid primary key default gen_random_uuid(),
  slide_id uuid not null references public.slides(id) on delete cascade,
  material_version_id uuid not null references public.material_versions(id) on delete cascade,
  kind text not null default 'point' check (kind in ('point', 'box', 'polygon')),
  coords jsonb not null,
  created_by text not null default 'user' check (created_by in ('user', 'ai', 'admin')),
  created_at timestamptz not null default now(),
  constraint region_user_point check (created_by <> 'user' or kind = 'point'),
  constraint region_point_range check (
    kind <> 'point' or
    (jsonb_typeof(coords -> 'x') = 'number' and jsonb_typeof(coords -> 'y') = 'number'
      and (coords ->> 'x')::numeric between 0 and 1
      and (coords ->> 'y')::numeric between 0 and 1)
  )
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  slide_id uuid references public.slides(id) on delete set null,
  region_id uuid references public.region_anchors(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  is_anonymous boolean not null default true,
  category public.question_category not null default 'concept',
  raw_text text not null check (char_length(raw_text) between 1 and 300),
  status public.question_status not null default 'unanswered',
  occurred_in text not null default 'live' check (occurred_in in ('live', 'post')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_region_slide check (region_id is null or slide_id is not null)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  visibility text not null default 'participants' check (visibility in ('private', 'participants', 'public')),
  is_ai_generated boolean not null default false,
  source_chunk_ids uuid[],
  created_at timestamptz not null default now()
);

create table public.course_brain_memory (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lecture_id uuid references public.lectures(id) on delete cascade,
  chunk_type text not null check (chunk_type in ('question', 'answer', 'material_text', 'slide_caption', 'cluster_summary', 'insight')),
  source_id uuid,
  content text not null,
  embedding extensions.vector(1536),
  reuse_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create index courses_owner_idx on public.courses(owner_id);
create index lectures_course_idx on public.lectures(course_id);
create index lectures_join_code_idx on public.lectures(join_code);
create index materials_lecture_idx on public.materials(lecture_id);
create index questions_lecture_created_idx on public.questions(lecture_id, created_at desc);
create index questions_course_idx on public.questions(course_id);
create index questions_author_idx on public.questions(author_id);
create index answers_question_idx on public.answers(question_id);
create index brain_course_idx on public.course_brain_memory(course_id, created_at desc);

create or replace function private.course_owned(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses
    where id = target_course_id and owner_id = (select auth.uid())
  );
$$;
revoke all on function private.course_owned(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.course_owned(uuid) to authenticated;

create or replace function private.capture_question_memory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.course_brain_memory(course_id, lecture_id, chunk_type, source_id, content)
  values (new.course_id, new.lecture_id, 'question', new.id, new.raw_text);
  return new;
end;
$$;
revoke all on function private.capture_question_memory() from public, anon, authenticated;

create or replace function private.capture_answer_memory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target public.questions;
begin
  select * into target from public.questions where id = new.question_id;
  update public.questions set status = 'answered', updated_at = now() where id = new.question_id;
  insert into public.course_brain_memory(course_id, lecture_id, chunk_type, source_id, content)
  values (target.course_id, target.lecture_id, 'answer', new.id, new.body);
  return new;
end;
$$;
revoke all on function private.capture_answer_memory() from public, anon, authenticated;

create trigger questions_capture_memory after insert on public.questions
for each row execute function private.capture_question_memory();
create trigger answers_capture_memory after insert on public.answers
for each row execute function private.capture_answer_memory();

alter table public.courses enable row level security;
alter table public.lectures enable row level security;
alter table public.materials enable row level security;
alter table public.material_versions enable row level security;
alter table public.slides enable row level security;
alter table public.region_anchors enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.course_brain_memory enable row level security;

create policy "owners manage courses" on public.courses for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "participants view live courses" on public.courses for select to authenticated
using (exists (select 1 from public.lectures l where l.course_id = courses.id and l.status = 'live'));

create policy "owners manage lectures" on public.lectures for all to authenticated
using ((select private.course_owned(course_id))) with check ((select private.course_owned(course_id)));
create policy "participants view live lectures" on public.lectures for select to authenticated using (status = 'live');

create policy "owners manage materials" on public.materials for all to authenticated
using ((select private.course_owned(course_id))) with check ((select private.course_owned(course_id)));
create policy "participants view live materials" on public.materials for select to authenticated
using (exists (select 1 from public.lectures l where l.id = materials.lecture_id and l.status = 'live'));

create policy "owners manage material versions" on public.material_versions for all to authenticated
using (exists (select 1 from public.materials m where m.id = material_versions.material_id and (select private.course_owned(m.course_id))))
with check (exists (select 1 from public.materials m where m.id = material_versions.material_id and (select private.course_owned(m.course_id))));
create policy "participants view live material versions" on public.material_versions for select to authenticated
using (exists (select 1 from public.materials m join public.lectures l on l.id = m.lecture_id where m.id = material_versions.material_id and l.status = 'live'));

create policy "owners manage slides" on public.slides for all to authenticated
using (exists (select 1 from public.material_versions mv join public.materials m on m.id = mv.material_id where mv.id = slides.material_version_id and (select private.course_owned(m.course_id))))
with check (exists (select 1 from public.material_versions mv join public.materials m on m.id = mv.material_id where mv.id = slides.material_version_id and (select private.course_owned(m.course_id))));
create policy "participants view live slides" on public.slides for select to authenticated
using (exists (select 1 from public.material_versions mv join public.materials m on m.id = mv.material_id join public.lectures l on l.id = m.lecture_id where mv.id = slides.material_version_id and l.status = 'live'));

create policy "participants create anchors in live lectures" on public.region_anchors for insert to authenticated
with check (created_by = 'user' and exists (
  select 1 from public.slides s join public.material_versions mv on mv.id = s.material_version_id join public.materials m on m.id = mv.material_id join public.lectures l on l.id = m.lecture_id
  where s.id = region_anchors.slide_id and l.status = 'live'
));
create policy "owners view anchors" on public.region_anchors for select to authenticated
using (exists (select 1 from public.slides s join public.material_versions mv on mv.id = s.material_version_id join public.materials m on m.id = mv.material_id where s.id = region_anchors.slide_id and (select private.course_owned(m.course_id))));

create policy "participants add live questions" on public.questions for insert to authenticated
with check ((select auth.uid()) = author_id and status = 'unanswered' and exists (select 1 from public.lectures l where l.id = lecture_id and l.course_id = course_id and l.status = 'live'));
create policy "owners view course questions" on public.questions for select to authenticated using ((select private.course_owned(course_id)));
create policy "authors view own questions" on public.questions for select to authenticated using ((select auth.uid()) = author_id);
create policy "owners update course questions" on public.questions for update to authenticated
using ((select private.course_owned(course_id))) with check ((select private.course_owned(course_id)));

create policy "owners add answers" on public.answers for insert to authenticated
with check ((select auth.uid()) = author_id and exists (select 1 from public.questions q where q.id = question_id and (select private.course_owned(q.course_id))));
create policy "owners view course answers" on public.answers for select to authenticated
using (exists (select 1 from public.questions q where q.id = question_id and (select private.course_owned(q.course_id))));
create policy "question authors view answers" on public.answers for select to authenticated
using (exists (select 1 from public.questions q where q.id = question_id and q.author_id = (select auth.uid())));

create policy "owners view course brain" on public.course_brain_memory for select to authenticated using ((select private.course_owned(course_id)));

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, 41943040, array['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lecture-slides', 'lecture-slides', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "owners upload source materials" on storage.objects for insert to authenticated
with check (bucket_id = 'course-materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owners read source materials" on storage.objects for select to authenticated
using (bucket_id = 'course-materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owners upload rendered slides" on storage.objects for insert to authenticated
with check (bucket_id = 'lecture-slides' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'questions') then
    alter publication supabase_realtime add table public.questions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lectures') then
    alter publication supabase_realtime add table public.lectures;
  end if;
end $$;
