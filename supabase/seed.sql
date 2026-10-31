-- Keep local reset reproducible. Add non-sensitive development fixtures here.
-- Local resets only (production never runs seed): no participant question rate limit while testing.
-- supabase/tests/participant_question_rate.sql re-creates the trigger inside its own transaction.
drop trigger if exists limit_participant_question_rate on public.questions;
