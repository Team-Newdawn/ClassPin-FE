-- Pin 피드백 앱: 관리자가 기준 이미지 한 장을 올리고 참여자가 그 위에 의견 핀을 찍는다.
-- 강의 앱의 course→lecture→material_version→slide 체인을 타지 않는다. 캠페인은 이미지 1장이라
-- 그 체인을 재사용하면 캠페인 하나당 5개 테이블에 행을 넣어야 한다.
-- 좌표는 jsonb 가 아니라 전용 컬럼 + CHECK 로 둔다 (PRD §7).

create type public.campaign_status as enum ('live', 'ended', 'archived');
create type public.feedback_category as enum ('discomfort', 'broken', 'danger', 'suggestion', 'etc');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  guide_text text check (guide_text is null or char_length(guide_text) <= 300),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{4,10}$'),
  image_path text,
  -- 이미지 원본 비율. 캔버스를 이 비율로 맞춰야 object-fit 레터박스가 생기지 않고,
  -- 컨테이너 기준으로 계산한 0~1 좌표가 이미지상 위치와 일치한다.
  image_width integer check (image_width is null or image_width > 0),
  image_height integer check (image_height is null or image_height > 0),
  status public.campaign_status not null default 'live',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feedback_pins (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  is_anonymous boolean not null default true,
  x numeric not null check (x between 0 and 1),
  y numeric not null check (y between 0 and 1),
  category public.feedback_category not null default 'etc',
  body text not null check (char_length(body) between 1 and 200),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_owner_idx on public.campaigns(owner_id);
create index campaigns_join_code_idx on public.campaigns(join_code);
create index feedback_pins_campaign_created_idx on public.feedback_pins(campaign_id, created_at desc);
create index feedback_pins_author_idx on public.feedback_pins(author_id);

-- 소유권 판정. private.course_owned() 와 같은 4점 세트를 지킨다.
create or replace function private.campaign_owned(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns
    where id = target_campaign_id and owner_id = (select auth.uid())
  );
$$;
revoke all on function private.campaign_owned(uuid) from public, anon, authenticated;
grant execute on function private.campaign_owned(uuid) to authenticated;

-- 핀 정책이 campaigns 를 직접 조회하면 campaigns 의 select 정책이 다시 평가된다. 참여자는
-- 첫 핀을 남기기 전에는 캠페인 행을 볼 수 없으므로, live 판정만 definer 로 빼서 끊어 준다.
create or replace function private.campaign_is_live(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns
    where id = target_campaign_id and status = 'live'
  );
$$;
revoke all on function private.campaign_is_live(uuid) from public, anon, authenticated;
grant execute on function private.campaign_is_live(uuid) to authenticated;

alter table public.campaigns enable row level security;
alter table public.feedback_pins enable row level security;

create policy "owners manage campaigns" on public.campaigns for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- 참여자는 자기가 의견을 남긴 캠페인만 본다. 캠페인을 종료해도 행이 사라지지 않아야
-- 참여자 화면이 "종료됨"으로 바뀌고 realtime 이벤트도 계속 전달된다.
create policy "participants view joined campaigns" on public.campaigns for select to authenticated
using (
  exists (
    select 1 from public.feedback_pins p
    where p.campaign_id = campaigns.id and p.author_id = (select auth.uid())
  )
);

-- 캠페인 개설은 구글 로그인 관리자만. permissive 정책 위에 restrictive 로 겹친다.
create policy "only admins create campaigns" on public.campaigns
as restrictive for insert to authenticated
with check ((select private.is_admin()));

-- 참여 코드를 아는 사람만 캠페인을 연다. 테이블 select 정책으로는 "코드를 아는가"를 표현할 수
-- 없어, 코드 대조를 definer 함수로 옮긴다. 이게 없으면 참여자가 프로젝트의 모든 live 캠페인을
-- 열거하고 public 버킷의 기준 이미지까지 전부 열어볼 수 있다.
-- 종료된 캠페인도 돌려준다. live 만 주면 참여자는 캠페인이 끝나는 순간 "찾을 수 없어요" 를 보고,
-- 남긴 의견을 다시 볼 방법이 사라진다. 제출 차단은 insert 정책이 맡는다.
create or replace function public.find_live_campaign(target_code text)
returns setof public.campaigns
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.campaigns
  where join_code = upper(target_code) and status in ('live', 'ended');
$$;
revoke all on function public.find_live_campaign(text) from public, anon, authenticated;
grant execute on function public.find_live_campaign(text) to authenticated;

create policy "owners view campaign feedback" on public.feedback_pins for select to authenticated
using ((select private.campaign_owned(campaign_id)));

create policy "owners update campaign feedback" on public.feedback_pins for update to authenticated
using ((select private.campaign_owned(campaign_id)))
with check ((select private.campaign_owned(campaign_id)));

-- insert 정책과 같은 기준이어야 한다. 여기만 is_participant() 로 좁히면 구글 로그인 사용자는
-- 의견을 남길 수는 있어도 자기가 남긴 것을 다시 읽지 못한다.
create policy "authors view own feedback" on public.feedback_pins for select to authenticated
using ((select auth.uid()) = author_id);

-- 역할을 따지지 않는다. QR 참여는 불특정 다수가 전제인데 is_participant() 로 좁히면
-- 구글 로그인 이력이 있는 사람(handle_new_user 가 admin 으로 만든다)은 남의 캠페인은 물론
-- 자기 캠페인에도 의견을 남길 수 없다. 관문은 참여 코드와 캠페인이 열려 있는지 두 가지다.
create policy "participants add live feedback" on public.feedback_pins for insert to authenticated
with check (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_is_live(campaign_id))
);

-- hidden = false 를 양쪽에 걸어 참여자가 숨김 처리까지 하지는 못하게 막는다.
-- 숨김·복원은 관리자 정책으로만 통과한다.
create policy "authors update own visible feedback" on public.feedback_pins for update to authenticated
using (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_is_live(campaign_id))
)
with check (
  (select auth.uid()) = author_id
  and hidden = false
  and (select private.campaign_is_live(campaign_id))
);

-- 이 프로젝트의 public 스키마에는 alter default privileges 가 걸려 있어, 새 테이블은 만들자마자
-- authenticated 에게 arwdDxtm(전 컬럼 UPDATE 포함)이 자동으로 붙는다. 그래서 먼저 회수하지 않으면
-- 아래 컬럼 단위 grant 가 아무것도 잠그지 못한다. questions 만 w 가 빠져 있는 이유도 이것이다.
revoke all on public.campaigns from anon, authenticated;
revoke all on public.feedback_pins from anon, authenticated;

grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert on public.feedback_pins to authenticated;

-- 어느 컬럼을 바꿨는지는 RLS 로 막을 수 없어 컬럼 권한으로 잠근다. 좌표(x,y)와 campaign_id,
-- created_at 을 빼는 것이 핵심이다 — 제출된 핀의 위치는 누구도 나중에 옮길 수 없어야 한다.
-- updated_at 은 자동 갱신 트리거가 없어 앱이 직접 보내므로 목록에 포함한다.
grant update (category, body, hidden, updated_at) on public.feedback_pins to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-images', 'campaign-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- 기존 restrictive 정책("only admins upload materials")은 bucket_id 가 course-materials·
-- lecture-slides 가 아니면 조건이 참이 되어 그냥 통과한다. 새 버킷은 자체 관리자 게이트가 필요하다.
create policy "owners upload campaign images" on storage.objects for insert to authenticated
with check (
  bucket_id = 'campaign-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_admin())
);

-- 업로드는 캠페인 행 insert 보다 먼저 일어난다. 뒤이어 insert 가 실패하면 객체만 남으므로
-- 지울 방법이 있어야 한다. public 버킷이라 경로를 아는 사람은 계속 볼 수 있다.
create policy "owners delete campaign images" on storage.objects for delete to authenticated
using (
  bucket_id = 'campaign-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_pins') then
    alter publication supabase_realtime add table public.feedback_pins;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campaigns') then
    alter publication supabase_realtime add table public.campaigns;
  end if;
end $$;
