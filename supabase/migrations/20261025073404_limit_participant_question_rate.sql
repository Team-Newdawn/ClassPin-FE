-- One participant identity may post at most 10 questions a minute and 100 per lecture (production peak: 4/min, 11/lecture).
-- Without it, one script floods the presenter's PIN jumps and pushes a material past the insight 5,000-question cap.
-- PT429 makes PostgREST answer 429, which the backend already passes through as "Too many requests".
set local lock_timeout = '5s';

create index questions_author_lecture_created_idx on public.questions(author_id, lecture_id, created_at desc);

create or replace function private.limit_participant_question_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_participant()) then return new; end if;
  -- Serialize one author's inserts so parallel requests cannot all pass the count.
  perform pg_advisory_xact_lock(hashtextextended(new.author_id::text, 0));
  if (select count(*) from public.questions where author_id = new.author_id and created_at > now() - interval '1 minute') >= 10
    or (select count(*) from public.questions where author_id = new.author_id and lecture_id = new.lecture_id) >= 100 then
    raise exception 'QUESTION_RATE_LIMIT' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_participant_question_rate() from public, anon, authenticated;

create trigger limit_participant_question_rate
before insert on public.questions
for each row execute function private.limit_participant_question_rate();
