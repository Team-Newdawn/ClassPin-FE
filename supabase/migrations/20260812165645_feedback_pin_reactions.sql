begin;

-- 기존 물방울 핀을 기본값으로 보존하고, 참여자가 핀마다 세 가지 이모지를 고를 수 있게 한다.
-- 공감 수는 반응 테이블에서 파생하지만 Realtime의 기존 feedback_pins 경로가 갱신을 받도록
-- 부모 행에도 원자적으로 유지한다.
alter table public.feedback_pins
  add column marker text not null default 'pin',
  add column reaction_count integer not null default 0,
  add constraint feedback_pins_marker_check
    check (marker in ('pin', 'question', 'smile', 'idea')),
  add constraint feedback_pins_reaction_count_check
    check (reaction_count >= 0);

create table public.feedback_pin_reactions (
  pin_id uuid not null references public.feedback_pins(id) on delete cascade,
  reactor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pin_id, reactor_id)
);

-- 복합 PK는 pin_id로 시작하므로 사용자 삭제 cascade를 위한 역방향 인덱스가 따로 필요하다.
create index feedback_pin_reactions_reactor_idx
  on public.feedback_pin_reactions(reactor_id);

alter table public.feedback_pin_reactions enable row level security;

-- 반응 행은 RPC로만 다룬다. RLS 정책도 만들지 않아 우회 가능한 직접 Data API를 열지 않는다.
revoke all on public.feedback_pin_reactions from public, anon, authenticated;

create function private.sync_feedback_pin_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.feedback_pins
    set reaction_count = reaction_count + 1
    where id = new.pin_id;
    return new;
  end if;

  update public.feedback_pins
  set reaction_count = greatest(reaction_count - 1, 0)
  where id = old.pin_id;
  return old;
end;
$$;

revoke all on function private.sync_feedback_pin_reaction_count()
from public, anon, authenticated;

create trigger feedback_pin_reactions_sync_count
after insert or delete on public.feedback_pin_reactions
for each row execute function private.sync_feedback_pin_reaction_count();

-- desired-state RPC라 재시도해도 중복 행이나 잘못된 count를 만들지 않는다. 핀을 잠가
-- 동시에 같은 사용자가 재시도해도 검증과 쓰기를 한 순서로 처리한다.
create function private.set_feedback_pin_reaction(target_pin_id uuid, target_reacted boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_campaign_id uuid;
  target_author_id uuid;
  target_hidden boolean;
  target_status public.campaign_status;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if target_reacted is null then
    raise exception using errcode = '22004', message = 'Reaction state is required';
  end if;

  select pin.campaign_id
  into target_campaign_id
  from public.feedback_pins as pin
  where pin.id = target_pin_id;

  if not found then
    raise exception using errcode = '42501', message = 'Feedback pin cannot be reacted to';
  end if;

  -- 캠페인→PIN 순으로 잠가 종료·삭제와 반응 쓰기 사이의 TOCTOU를 막는다.
  select campaign.status
  into target_status
  from public.campaigns as campaign
  where campaign.id = target_campaign_id
  for share;

  select pin.author_id, pin.hidden
  into target_author_id, target_hidden
  from public.feedback_pins as pin
  where pin.id = target_pin_id and pin.campaign_id = target_campaign_id
  for update;

  if not found or target_hidden or target_status is distinct from 'live'::public.campaign_status then
    raise exception using errcode = '42501', message = 'Feedback pin cannot be reacted to';
  end if;
  if target_author_id = actor_id then
    raise exception using errcode = '42501', message = 'Authors cannot react to their own feedback pin';
  end if;

  if target_reacted then
    insert into public.feedback_pin_reactions(pin_id, reactor_id)
    values (target_pin_id, actor_id)
    on conflict (pin_id, reactor_id) do nothing;
  else
    delete from public.feedback_pin_reactions
    where pin_id = target_pin_id and reactor_id = actor_id;
  end if;

  return target_reacted;
end;
$$;

revoke all on function private.set_feedback_pin_reaction(uuid, boolean)
from public, anon, authenticated;
grant execute on function private.set_feedback_pin_reaction(uuid, boolean) to authenticated;

create function public.set_feedback_pin_reaction(target_pin_id uuid, target_reacted boolean)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_feedback_pin_reaction(target_pin_id, target_reacted);
$$;

revoke all on function public.set_feedback_pin_reaction(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.set_feedback_pin_reaction(uuid, boolean) to authenticated;

-- reaction_count는 trigger만 쓸 수 있어야 하므로 기존 테이블 단위 INSERT 권한도 컬럼 단위로 좁힌다.
revoke insert, update on public.feedback_pins from authenticated;
grant insert (id, campaign_id, author_id, is_anonymous, page_index, x, y, category, body, marker, hidden)
on public.feedback_pins to authenticated;
grant update (category, body, marker, hidden, updated_at)
on public.feedback_pins to authenticated;

-- 공개 플레이어 결과에는 작성자 식별자를 계속 숨기되, 현재 RPC 호출자 기준 공감 상태를 싣는다.
create or replace function private.find_campaign_player(target_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', campaign.id,
      'title', campaign.title,
      'guide_text', campaign.guide_text,
      'join_code', campaign.join_code,
      'image_path', campaign.image_path,
      'image_width', campaign.image_width,
      'image_height', campaign.image_height,
      'status', campaign.status,
      'show_presentation_qr', campaign.show_presentation_qr,
      'presentation_qr_position', campaign.presentation_qr_position,
      'show_presentation_pin_status', campaign.show_presentation_pin_status,
      'presentation_pin_status_position', campaign.presentation_pin_status_position,
      'audience_groups', campaign.audience_groups,
      'feedback_categories', campaign.feedback_categories,
      'created_at', campaign.created_at
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'campaign_id', page.campaign_id,
        'page_index', page.page_index,
        'image_path', page.image_path,
        'image_width', page.image_width,
        'image_height', page.image_height,
        'audience_groups', page.audience_groups
      ) order by page.page_index)
      from public.campaign_pages as page
      where page.campaign_id = campaign.id
    ), '[]'::jsonb),
    'pins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pin.id,
        'campaign_id', pin.campaign_id,
        'author_id', null,
        'page_index', pin.page_index,
        'x', pin.x,
        'y', pin.y,
        'category', pin.category,
        'body', pin.body,
        'marker', pin.marker,
        'reaction_count', pin.reaction_count,
        'reacted_by_me', exists (
          select 1
          from public.feedback_pin_reactions as reaction
          where reaction.pin_id = pin.id
            and reaction.reactor_id = (select auth.uid())
        ),
        'hidden', false,
        'created_at', pin.created_at
      ) order by pin.created_at desc)
      from public.feedback_pins as pin
      where pin.campaign_id = campaign.id and pin.hidden = false
    ), '[]'::jsonb)
  )
  from public.campaigns as campaign
  where (select auth.uid()) is not null
    and campaign.id = target_campaign_id
    and campaign.status in ('live', 'ended');
$$;

revoke all on function private.find_campaign_player(uuid) from public, anon, authenticated;
grant execute on function private.find_campaign_player(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
