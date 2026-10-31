begin;

select plan(4);

-- seed.sql drops the limit for local testing; production keeps it.
create trigger limit_participant_question_rate before insert on public.questions
for each row execute function private.limit_participant_question_rate();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rate-owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true),
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.courses (id, owner_id, title) values ('4f000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000001', 'Rate');
insert into public.lectures (id, course_id, title, join_code, status) values ('5f000000-0000-0000-0000-000000000001', '4f000000-0000-0000-0000-000000000001', 'Rate', 'RATE01', 'live');
insert into public.materials (id, course_id, lecture_id, type, file_name) values ('6f000000-0000-0000-0000-000000000001', '4f000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', 'pdf', 'rate.pdf');
insert into public.material_versions (id, material_id, source_path) values ('7f000000-0000-0000-0000-000000000001', '6f000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000001/rate.pdf');
insert into public.slides (id, material_version_id, page_index, source_page_index) values ('8f000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 0, 0);

-- Participant 3 already has 99 questions in this lecture, all older than a minute (written as postgres: no limit).
insert into public.questions (course_id, lecture_id, slide_id, author_id, category, raw_text, status, created_at)
select '4f000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000001', '8f000000-0000-0000-0000-000000000001',
  '1f000000-0000-0000-0000-000000000003', 'concept', 'old ' || n, 'unanswered', now() - interval '1 hour'
from generate_series(1, 99) as n;

create function pg_temp.ask() returns uuid language sql as $$
  select public.ohpin_submit_point_question(gen_random_uuid(), '5f000000-0000-0000-0000-000000000001',
    '8f000000-0000-0000-0000-000000000001', 0.5, 0.5, 'concept', 'question', 'rate')
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000002', true);

select lives_ok($$select pg_temp.ask() from generate_series(1, 10)$$, 'a participant can post 10 questions within a minute');
select throws_ok($$select pg_temp.ask()$$, 'PT429', 'QUESTION_RATE_LIMIT', 'the 11th question within a minute is rejected');

select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000003', true);
select lives_ok($$select pg_temp.ask()$$, 'a participant can post a 100th question in a lecture');
select throws_ok($$select pg_temp.ask()$$, 'PT429', 'QUESTION_RATE_LIMIT', 'the 101st question in one lecture is rejected');

reset role;
select * from finish();
rollback;
