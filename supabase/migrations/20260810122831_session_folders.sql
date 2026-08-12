-- 기존 campaigns 행은 세션으로 표시하되 DB 이름은 공개 RPC·링크 호환성을 위해 유지한다.
-- 폴더는 관리자 소유이며, 폴더 삭제 시 안의 세션은 삭제하지 않고 루트로 돌려보낸다.
create table public.session_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index session_folders_owner_name_idx
on public.session_folders (owner_id, lower(name));

alter table public.campaigns add column folder_id uuid;

-- 폴더와 세션의 owner_id 를 함께 참조해 다른 관리자의 폴더로 이동할 수 없게 한다.
-- PostgreSQL 17의 열 지정 SET NULL로 owner_id는 보존하고 folder_id만 비운다.
alter table public.campaigns
add constraint campaigns_folder_owner_fk
foreign key (folder_id, owner_id)
references public.session_folders(id, owner_id)
on delete set null (folder_id);

create index campaigns_folder_idx on public.campaigns(folder_id);

alter table public.session_folders enable row level security;

create policy "owners manage session folders"
on public.session_folders
for all
to authenticated
using (
  (select auth.uid()) = owner_id
  and (select private.is_admin())
)
with check (
  (select auth.uid()) = owner_id
  and (select private.is_admin())
);

revoke all on table public.session_folders from public, anon, authenticated;
grant select, insert, update, delete on table public.session_folders to authenticated;

notify pgrst, 'reload schema';
