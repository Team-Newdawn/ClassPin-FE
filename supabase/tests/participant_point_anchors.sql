begin;

select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'point-owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.courses (id, owner_id, title)
values ('42000000-0000-0000-0000-000000000004', '12000000-0000-0000-0000-000000000001', 'Point anchor fixture');

insert into public.lectures (id, course_id, title, join_code, status)
values ('52000000-0000-0000-0000-000000000005', '42000000-0000-0000-0000-000000000004', 'Point anchor fixture', 'POINT1', 'live');

insert into public.materials (id, course_id, lecture_id, type, file_name)
values ('62000000-0000-0000-0000-000000000006', '42000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005', 'pdf', 'fixture.pdf');

insert into public.material_versions (id, material_id, source_path)
values ('72000000-0000-0000-0000-000000000007', '62000000-0000-0000-0000-000000000006', 'fixture.pdf');

insert into public.slides (id, material_version_id, page_index, image_path)
values ('82000000-0000-0000-0000-000000000008', '72000000-0000-0000-0000-000000000007', 0, 'fixture.jpg');

insert into public.region_anchors (id, slide_id, material_version_id, kind, coords, created_by)
values (
  '92000000-0000-0000-0000-000000000009',
  '82000000-0000-0000-0000-000000000008',
  '72000000-0000-0000-0000-000000000007',
  'path',
  '{"x":0.1,"y":0.1,"points":[[0.1,0.1],[0.2,0.2]]}',
  'user'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.region_anchors (id, slide_id, material_version_id, kind, coords, created_by)
    values ('92000000-0000-0000-0000-000000000010', '82000000-0000-0000-0000-000000000008', '72000000-0000-0000-0000-000000000007', 'point', '{"x":0.4,"y":0.6}', 'user')$$,
  'participant can create a point anchor in a live lecture'
);

select throws_ok(
  $$insert into public.region_anchors (id, slide_id, material_version_id, kind, coords, created_by)
    values ('92000000-0000-0000-0000-000000000011', '82000000-0000-0000-0000-000000000008', '72000000-0000-0000-0000-000000000007', 'path', '{"x":0.3,"y":0.3,"points":[[0.3,0.3],[0.5,0.5]]}', 'user')$$,
  '42501',
  'new row violates row-level security policy for table "region_anchors"',
  'participant cannot create a path anchor'
);

reset role;

select ok(
  exists (select 1 from public.region_anchors where id = '92000000-0000-0000-0000-000000000009'),
  'historical path anchors remain stored'
);

select * from finish();

rollback;
