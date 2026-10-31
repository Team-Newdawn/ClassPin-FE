begin;

select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '1d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'question-owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '1e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

-- Two live lectures of one owner; the participant writes into lecture A.
insert into public.courses (id, owner_id, title) values
  ('4d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', 'Question A'),
  ('4d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000001', 'Question B');
insert into public.lectures (id, course_id, title, join_code, status) values
  ('5d000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', 'A', 'QSLDA1', 'live'),
  ('5d000000-0000-0000-0000-000000000002', '4d000000-0000-0000-0000-000000000002', 'B', 'QSLDB1', 'live');
insert into public.materials (id, course_id, lecture_id, type, file_name) values
  ('6d000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'pdf', 'a.pdf'),
  ('6d000000-0000-0000-0000-000000000002', '4d000000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000002', 'pdf', 'b.pdf');
insert into public.material_versions (id, material_id, source_path) values
  ('7d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001/a.pdf'),
  ('7d000000-0000-0000-0000-000000000002', '6d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000001/b.pdf');
insert into public.slides (id, material_version_id, page_index, source_page_index) values
  ('8d000000-0000-0000-0000-000000000001', '7d000000-0000-0000-0000-000000000001', 0, 0),
  ('8d000000-0000-0000-0000-000000000002', '7d000000-0000-0000-0000-000000000002', 0, 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.ohpin_submit_point_question('9d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001',
    '8d000000-0000-0000-0000-000000000001', 0.5, 0.5, 'concept', 'question', 'valid')$$,
  'the participant question RPC still stores a question on its own lecture slide'
);

select throws_ok(
  $$insert into public.questions (id, course_id, lecture_id, slide_id, author_id, category, raw_text, status)
    values ('9d000000-0000-0000-0000-000000000002', '4d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001',
      null, '1e000000-0000-0000-0000-000000000002', 'concept', 'no slide', 'unanswered')$$,
  '42501', null,
  'a participant cannot store a question without a slide'
);

select throws_ok(
  $$insert into public.questions (id, course_id, lecture_id, slide_id, author_id, category, raw_text, status)
    values ('9d000000-0000-0000-0000-000000000003', '4d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001',
      '8d000000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000002', 'concept', 'foreign slide', 'unanswered')$$,
  '42501', null,
  'a participant cannot store a question on another lecture''s slide'
);

reset role;
select * from finish();
rollback;
