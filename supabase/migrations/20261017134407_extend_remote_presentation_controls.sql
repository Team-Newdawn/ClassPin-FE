-- LRR-026: 같은 단일 기기 토큰으로 발표 표시 설정과 질문 목록을 제어한다.
-- 기본 인자 덕분에 기존의 token/step 호출도 계속 동작한다.
drop function public.ohpin_remote_control(text, integer);
create function public.ohpin_remote_control(
  remote_token text, step integer default 0,
  settings jsonb default '{}'::jsonb, include_questions boolean default false
)
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
  version_id uuid;
  slide_count integer;
  question_count integer := 0;
  questions jsonb;
  lecture public.lectures;
begin
  if uid is null or step is null or step not in (-1, 0, 1)
    or settings is null or jsonb_typeof(settings) <> 'object' or include_questions is null then
    raise exception 'Invalid remote request' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(settings) as key
    where key not in ('show_question_pins', 'show_question_labels', 'show_presentation_qr', 'presentation_qr_position'))
    or (settings ? 'show_question_pins' and jsonb_typeof(settings->'show_question_pins') <> 'boolean')
    or (settings ? 'show_question_labels' and jsonb_typeof(settings->'show_question_labels') <> 'boolean')
    or (settings ? 'show_presentation_qr' and jsonb_typeof(settings->'show_presentation_qr') <> 'boolean')
    or (settings ? 'presentation_qr_position' and (
      jsonb_typeof(settings->'presentation_qr_position') <> 'string'
      or settings->>'presentation_qr_position' not in ('top-left', 'top-right', 'bottom-left', 'bottom-right')
    )) then
    raise exception 'Invalid remote settings' using errcode = '22023';
  end if;

  -- 차지하는 호출에서는 강의 행을 변경하지 않는다. 종료 트리거와 잠금 순서를 유지한다.
  update public.lecture_remotes set holder_id = uid where token_hash = hash and holder_id is null;
  if found then
    step := 0;
    settings := '{}'::jsonb;
  end if;
  select remote.lecture_id, remote.holder_id into target, holder
  from public.lecture_remotes as remote where remote.token_hash = hash;
  if not found then raise exception 'remote_revoked' using errcode = 'P0002'; end if;
  if holder <> uid then raise exception 'remote_in_use' using errcode = '42501'; end if;

  select version.id into version_id
  from public.materials as material
  join public.material_versions as version on version.material_id = material.id
  where material.lecture_id = target
  order by material.created_at, version.version_no desc limit 1;
  select count(*) into slide_count from public.slides where material_version_id = version_id;

  if step <> 0 or settings <> '{}'::jsonb then
    -- 종료와 같은 lecture -> remote 순서로 잠근 뒤 재발급·연결 해제를 다시 확인한다.
    perform 1 from public.lectures where id = target for update;
    select remote.holder_id into holder from public.lecture_remotes as remote
    where remote.lecture_id = target and remote.token_hash = hash for update;
    if not found then raise exception 'remote_revoked' using errcode = 'P0002'; end if;
    if holder <> uid then raise exception 'remote_in_use' using errcode = '42501'; end if;
    update public.lectures
    set current_page = case when step <> 0 and slide_count > 0
          then least(greatest(current_page + step, 0), slide_count - 1) else current_page end,
        show_question_pins = coalesce((settings->>'show_question_pins')::boolean, show_question_pins),
        show_question_labels = coalesce((settings->>'show_question_labels')::boolean, show_question_labels),
        show_presentation_qr = coalesce((settings->>'show_presentation_qr')::boolean, show_presentation_qr),
        presentation_qr_position = coalesce(settings->>'presentation_qr_position', presentation_qr_position)
    where id = target and status = 'live';
  end if;

  select * into lecture from public.lectures where id = target;
  if lecture.status = 'live' then
    select count(*) into question_count from public.questions where lecture_id = target;
    if include_questions then
      -- 필요한 질문 본문과 페이지 번호만 반환한다. 노트·작성자 식별자는 읽지 않는다.
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', question.id, 'text', question.raw_text, 'slide_index', slide.page_index
      ) order by question.created_at desc, question.id), '[]'::jsonb) into questions
      from public.questions as question
      left join public.slides as slide on slide.id = question.slide_id
      where question.lecture_id = target;
    end if;
  end if;
  return jsonb_build_object(
    'current_page', lecture.current_page, 'slide_count', slide_count,
    'status', lecture.status, 'title', lecture.title,
    'show_question_pins', lecture.show_question_pins,
    'show_question_labels', lecture.show_question_labels,
    'show_presentation_qr', lecture.show_presentation_qr,
    'presentation_qr_position', lecture.presentation_qr_position,
    'question_count', question_count, 'questions', questions
  );
end;
$$;
revoke all on function public.ohpin_remote_control(text, integer, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ohpin_remote_control(text, integer, jsonb, boolean) to authenticated;
