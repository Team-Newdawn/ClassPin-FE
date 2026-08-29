-- The lectures CHECK constraint evaluates this validator on every row update.
grant execute on function private.valid_question_category_settings(jsonb) to authenticated;
