begin;

select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'autoplay-owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '24000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.courses (id, owner_id, title)
values ('44000000-0000-0000-0000-000000000004', '14000000-0000-0000-0000-000000000001', 'Autoplay fixture');

insert into public.lectures (id, course_id, title, join_code, status)
values ('54000000-0000-0000-0000-000000000005', '44000000-0000-0000-0000-000000000004', 'Autoplay fixture', 'AUTO01', 'live');

select is(
  (select presentation_autoplay from public.lectures where id = '54000000-0000-0000-0000-000000000005'),
  false,
  'lecture autoplay defaults to off'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.lectures
set presentation_autoplay = true
where id = '54000000-0000-0000-0000-000000000005';

select is(
  (select presentation_autoplay from public.lectures where id = '54000000-0000-0000-0000-000000000005'),
  true,
  'owner can enable lecture autoplay'
);

select set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000002', true);

update public.lectures
set presentation_autoplay = false
where id = '54000000-0000-0000-0000-000000000005';

select is(
  (select presentation_autoplay from public.lectures where id = '54000000-0000-0000-0000-000000000005'),
  true,
  'participant cannot change lecture autoplay'
);

select * from finish();

rollback;
