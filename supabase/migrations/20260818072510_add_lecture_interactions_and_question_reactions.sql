begin;

-- 강의자는 발표 화면을 강의자료 전용 또는 상호작용 모드로 전환할 수 있다.
alter table public.lectures
  add column presentation_interactions boolean not null default true;

-- 공감 수는 Realtime이 이미 구독하는 questions 행에 유지한다. 실제 사용자별 상태는
-- 별도 테이블이 권위 원본이며, trigger 외에는 reaction_count를 쓸 수 없다.
alter table public.questions
  add column reaction_count integer not null default 0,
  add constraint questions_reaction_count_check check (reaction_count >= 0);

create table public.question_reactions (
  question_id uuid not null references public.questions(id) on delete cascade,
  reactor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, reactor_id)
);

create index question_reactions_reactor_idx
  on public.question_reactions(reactor_id);

alter table public.question_reactions enable row level security;
revoke all on public.question_reactions from public, anon, authenticated;

create function private.sync_question_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.questions
    set reaction_count = reaction_count + 1
    where id = new.question_id;
    return new;
  end if;

  update public.questions
  set reaction_count = greatest(reaction_count - 1, 0)
  where id = old.question_id;
  return old;
end;
$$;

revoke all on function private.sync_question_reaction_count()
from public, anon, authenticated;

create trigger question_reactions_sync_count
after insert or delete on public.question_reactions
for each row execute function private.sync_question_reaction_count();

-- desired-state RPC라 네트워크 재시도에도 중복 공감이 생기지 않는다. 강의와 질문을
-- 같은 순서로 잠가 종료·삭제·반응 사이의 TOCTOU도 막는다.
create function private.set_question_reaction(target_question_id uuid, target_reacted boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_lecture_id uuid;
  target_author_id uuid;
  target_lecture_status public.lecture_status;
  target_question_status public.question_status;
begin
  if actor_id is null or not (select private.is_participant()) then
    raise exception using errcode = '42501', message = 'Participant authentication required';
  end if;
  if target_reacted is null then
    raise exception using errcode = '22004', message = 'Reaction state is required';
  end if;

  select question.lecture_id
  into target_lecture_id
  from public.questions as question
  where question.id = target_question_id;

  if not found then
    raise exception using errcode = '42501', message = 'Question cannot be reacted to';
  end if;

  select lecture.status
  into target_lecture_status
  from public.lectures as lecture
  where lecture.id = target_lecture_id
  for share;

  select question.author_id, question.status
  into target_author_id, target_question_status
  from public.questions as question
  where question.id = target_question_id
    and question.lecture_id = target_lecture_id
  for update;

  if not found
    or target_lecture_status is distinct from 'live'::public.lecture_status
    or target_question_status = 'archived'::public.question_status then
    raise exception using errcode = '42501', message = 'Question cannot be reacted to';
  end if;
  if target_author_id = actor_id then
    raise exception using errcode = '42501', message = 'Authors cannot react to their own question';
  end if;

  if target_reacted then
    insert into public.question_reactions(question_id, reactor_id)
    values (target_question_id, actor_id)
    on conflict (question_id, reactor_id) do nothing;
  else
    delete from public.question_reactions
    where question_id = target_question_id and reactor_id = actor_id;
  end if;

  return target_reacted;
end;
$$;

revoke all on function private.set_question_reaction(uuid, boolean)
from public, anon, authenticated;
grant execute on function private.set_question_reaction(uuid, boolean) to authenticated;

create function public.set_question_reaction(target_question_id uuid, target_reacted boolean)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_question_reaction(target_question_id, target_reacted);
$$;

revoke all on function public.set_question_reaction(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.set_question_reaction(uuid, boolean) to authenticated;

-- reaction_count는 trigger 전용이다. 기존 테이블 단위 권한을 필요한 쓰기 컬럼으로 좁힌다.
revoke insert, update on public.questions from authenticated;
grant insert (
  id, course_id, lecture_id, slide_id, region_id, author_id,
  is_anonymous, category, raw_text, status, occurred_in
) on public.questions to authenticated;
grant update (category, raw_text, status, updated_at)
on public.questions to authenticated;

-- 참여자가 라이브 강의의 질문 전체를 볼 때 작성자 식별자는 내보내지 않는다.
-- is_mine과 reacted_by_me만 현재 익명 세션 기준으로 계산하고, 강사 비공개 답변은 제외한다.
create function private.find_lecture_questions(target_lecture_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', question.id,
    'lecture_id', question.lecture_id,
    'slide_id', question.slide_id,
    'category', question.category,
    'raw_text', question.raw_text,
    'status', question.status,
    'reaction_count', question.reaction_count,
    'reacted_by_me', exists (
      select 1
      from public.question_reactions as reaction
      where reaction.question_id = question.id
        and reaction.reactor_id = (select auth.uid())
    ),
    'is_mine', question.author_id = (select auth.uid()),
    'created_at', question.created_at,
    'region_anchors', case when anchor.id is null then null else jsonb_build_object(
      'kind', anchor.kind,
      'coords', anchor.coords
    ) end,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'body', answer.body,
        'created_at', answer.created_at
      ) order by answer.created_at)
      from public.answers as answer
      where answer.question_id = question.id
        and answer.visibility in ('participants', 'public')
    ), '[]'::jsonb)
  ) order by question.created_at desc), '[]'::jsonb)
  from public.questions as question
  left join public.region_anchors as anchor on anchor.id = question.region_id
  where (select auth.uid()) is not null
    and (select private.is_participant())
    and question.lecture_id = target_lecture_id
    and question.status <> 'archived'::public.question_status
    and exists (
      select 1
      from public.lectures as lecture
      where lecture.id = question.lecture_id
        and lecture.status = 'live'::public.lecture_status
    );
$$;

revoke all on function private.find_lecture_questions(uuid)
from public, anon, authenticated;
grant execute on function private.find_lecture_questions(uuid) to authenticated;

create function public.find_lecture_questions(target_lecture_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.find_lecture_questions(target_lecture_id);
$$;

revoke all on function public.find_lecture_questions(uuid)
from public, anon, authenticated;
grant execute on function public.find_lecture_questions(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
