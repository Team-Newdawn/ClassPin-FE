-- 발표 리모컨 (lecture-roles-and-remote LRR-020~024).
-- owner가 발급한 링크를 처음 연 익명 세션 하나만 현재 페이지를 옮긴다. 토큰 원문은 저장하지 않는다.
create table public.lecture_remotes (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  token_hash bytea not null unique,
  holder_id uuid
);

alter table public.lecture_remotes enable row level security;

-- 쓰기 정책은 두지 않는다. 발급·차지·이동은 아래 security definer RPC로만 한다.
create policy "owners view lecture remotes" on public.lecture_remotes for select to authenticated
using (exists (
  select 1 from public.lectures as lecture
  where lecture.id = lecture_id and (select private.course_owned(lecture.course_id))
));

create or replace function public.ohpin_issue_lecture_remote(target_lecture_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text := gen_random_uuid()::text;
begin
  if not exists (
    select 1 from public.lectures as lecture
    where lecture.id = target_lecture_id and private.course_owned(lecture.course_id)
  ) then
    raise exception 'Lecture not found' using errcode = '42501';
  end if;
  insert into public.lecture_remotes (lecture_id, token_hash)
  values (target_lecture_id, sha256(convert_to(token, 'UTF8')))
  on conflict (lecture_id) do update
  set token_hash = excluded.token_hash, holder_id = null;
  return token;
end;
$$;

revoke all on function public.ohpin_issue_lecture_remote(uuid) from public, anon, authenticated;
grant execute on function public.ohpin_issue_lecture_remote(uuid) to authenticated;

create or replace function public.ohpin_remote_control(remote_token text, step integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hash bytea := sha256(convert_to(remote_token, 'UTF8'));
  target uuid;
  holder uuid;
  slide_count integer;
  lecture public.lectures;
begin
  if uid is null or step is null or step not in (-1, 0, 1) then
    raise exception 'Invalid remote request' using errcode = '22023';
  end if;

  -- 처음 연 세션이 차지한다. 차지하는 호출은 이동하지 않아서 강의 행을 잠그지 않는다.
  -- 그래야 강의 종료(강의 행 → 리모컨 행 순서로 잠금)와 잠금 순서가 엇갈리지 않는다.
  update public.lecture_remotes set holder_id = uid
  where token_hash = hash and holder_id is null;
  if found then
    step := 0;
  end if;

  select remote.lecture_id, remote.holder_id into target, holder
  from public.lecture_remotes as remote
  where remote.token_hash = hash;
  if not found then
    raise exception 'remote_revoked' using errcode = 'P0002';
  end if;
  if holder <> uid then
    raise exception 'remote_in_use' using errcode = '42501';
  end if;

  -- ohpin_update_lecture_settings 와 같은 기준으로 슬라이드 수를 센다.
  select count(*) into slide_count
  from public.slides as slide
  where slide.material_version_id = (
    select version.id
    from public.materials as material
    join public.material_versions as version on version.material_id = material.id
    where material.lecture_id = target
    order by material.created_at, version.version_no desc
    limit 1
  );

  if step <> 0 and slide_count > 0 then
    update public.lectures
    set current_page = least(greatest(current_page + step, 0), slide_count - 1)
    where id = target
      and status = 'live'
      and current_page <> least(greatest(current_page + step, 0), slide_count - 1);
  end if;

  select * into lecture from public.lectures where id = target;
  return jsonb_build_object(
    'current_page', lecture.current_page,
    'slide_count', slide_count,
    'status', lecture.status,
    'title', lecture.title
  );
end;
$$;

revoke all on function public.ohpin_remote_control(text, integer) from public, anon, authenticated;
grant execute on function public.ohpin_remote_control(text, integer) to authenticated;

-- LIVE를 벗어나면(수동·자동·BE 종료 모두) 리모컨을 해제한다.
create or replace function private.release_lecture_remote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.lecture_remotes where lecture_id = new.id;
  return null;
end;
$$;

revoke all on function private.release_lecture_remote() from public, anon, authenticated;

create trigger release_lecture_remote
after update of status on public.lectures
for each row
when (old.status = 'live' and new.status <> 'live')
execute function private.release_lecture_remote();
