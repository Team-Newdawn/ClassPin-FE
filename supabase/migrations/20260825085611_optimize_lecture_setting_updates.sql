-- The column-specific trigger validates inserts and question-category changes.
-- Keeping the equivalent CHECK made every unrelated lecture toggle re-parse JSON.
alter table public.lectures
  drop constraint if exists lectures_question_categories_valid;

revoke execute on function private.valid_question_category_settings(jsonb)
from authenticated;
