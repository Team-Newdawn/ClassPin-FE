-- 역할 분리: admin(구글 로그인 강사) / participant(익명 수강생)
-- Supabase Dashboard 에서 Google provider 를 활성화해야 한다.
-- 익명 로그인(Anonymous Sign-ins)은 수강생 참여용으로 계속 켜 둔다.

create type public.user_role as enum ('admin', 'participant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'participant',
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- role 은 아래 트리거로만 바뀐다. 사용자에게는 조회만 연다.
create policy "users view own profile" on public.profiles for select to authenticated
using ((select auth.uid()) = id);

-- 가입 경로가 곧 역할이다: 익명 세션이면 participant, 구글(이메일) 가입이면 admin.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, email, display_name, avatar_url)
  values (
    new.id,
    case when coalesce(new.is_anonymous, false) then 'participant'::public.user_role else 'admin'::public.user_role end,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- 익명 수강생이 구글 계정을 연결해 영구 계정이 되면 admin 으로 승격하고 프로필을 최신화한다.
create or replace function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set
    role = case when coalesce(new.is_anonymous, false) then role else 'admin'::public.user_role end,
    email = new.email,
    display_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', display_name),
    avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url),
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;
revoke all on function private.handle_user_updated() from public, anon, authenticated;

create trigger on_auth_user_updated
after update on auth.users
for each row
when (
  old.email is distinct from new.email
  or old.raw_user_meta_data is distinct from new.raw_user_meta_data
  or old.is_anonymous is distinct from new.is_anonymous
)
execute function private.handle_user_updated();

-- 마이그레이션 이전에 만들어진 사용자(기존 익명 세션 포함) 백필
insert into public.profiles (id, role, email, display_name, avatar_url)
select
  u.id,
  case when coalesce(u.is_anonymous, false) then 'participant'::public.user_role else 'admin'::public.user_role end,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- 코스 생성(=세션 개설)은 admin 만. 기존 owner 정책 위에 restrictive 로 겹친다.
create policy "only admins create courses" on public.courses
as restrictive for insert to authenticated
with check ((select private.is_admin()));

-- 자료 원본·렌더된 슬라이드 업로드도 admin 만.
create policy "only admins upload materials" on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id not in ('course-materials', 'lecture-slides')
  or (select private.is_admin())
);
