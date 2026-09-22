begin;

select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '11000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'folder-purpose@test.local', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.session_folders (id, owner_id, name)
values ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000002', 'Default purpose');

insert into public.session_folders (id, owner_id, name, purpose)
values ('31000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000002', 'Education purpose', 'education');

select is(
  (select purpose from public.session_folders where id = '31000000-0000-0000-0000-000000000003'),
  'qa',
  'folder purpose defaults to Q&A'
);

select is(
  (select purpose from public.session_folders where id = '31000000-0000-0000-0000-000000000004'),
  'education',
  'selected folder purpose is persisted'
);

select throws_ok(
  $$insert into public.session_folders (owner_id, name, purpose) values ('11000000-0000-0000-0000-000000000002', 'Invalid purpose', 'campaign')$$,
  '23514',
  null,
  'unknown folder purposes are rejected'
);

insert into public.session_folders (id, owner_id, name, purpose, purpose_label)
values ('31000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000002', 'Other purpose', 'other', '사내 워크숍');

select is(
  (select purpose_label from public.session_folders where id = '31000000-0000-0000-0000-000000000005'),
  '사내 워크숍',
  'the typed category name is persisted for the other purpose'
);

select is(
  (select purpose_label from public.session_folders where id = '31000000-0000-0000-0000-000000000004'),
  null,
  'other purposes keep an empty category name'
);

select throws_ok(
  $$insert into public.session_folders (owner_id, name, purpose, purpose_label) values ('11000000-0000-0000-0000-000000000002', 'Labelled education', 'education', '사내 워크숍')$$,
  '23514',
  null,
  'a category name outside the other purpose is rejected'
);

select * from finish();

rollback;
