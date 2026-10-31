begin;

select plan(3);

-- Instructor A and B own separate courses; P is an anonymous participant.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-b@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.courses (id, owner_id, title) values
  ('4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'A course'),
  ('4b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000002', 'B course');

insert into public.lectures (id, course_id, title, join_code, status) values
  ('5a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', 'A live', 'XOWNA1', 'live'),
  ('5b000000-0000-0000-0000-000000000002', '4b000000-0000-0000-0000-000000000002', 'B live', 'XOWNB1', 'live');

insert into public.materials (id, course_id, lecture_id, type, file_name) values
  ('6a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'pdf', 'a.pdf');

insert into public.material_versions (id, material_id, source_path) values
  ('7a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001/direct/a.pdf');

-- B's private source deck: never attached to a live PDF material.
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('course-materials', '1b000000-0000-0000-0000-000000000002/direct/b.pptx', '1b000000-0000-0000-0000-000000000002', '{"mimetype":"application/vnd.openxmlformats-officedocument.presentationml.presentation"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Lead 1: the insight routes read source_path with the service role.
do $$ begin
  update public.material_versions
  set source_path = '1b000000-0000-0000-0000-000000000002/direct/b.pptx'
  where id = '7a000000-0000-0000-0000-000000000001';
exception when others then null;
end $$;

-- Lead 3: materials.lecture_id must belong to materials.course_id.
do $$ begin
  insert into public.materials (id, course_id, lecture_id, type, file_name)
  values ('6a000000-0000-0000-0000-000000000002', '4a000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000002', 'pdf', 'injected.pdf');
exception when others then null;
end $$;

reset role;

select isnt(
  (select source_path from public.material_versions where id = '7a000000-0000-0000-0000-000000000001'),
  '1b000000-0000-0000-0000-000000000002/direct/b.pptx',
  'an instructor cannot point a material version at another owner''s file'
);

select is(
  (select count(*)::integer from public.materials where id = '6a000000-0000-0000-0000-000000000002'),
  0,
  'an instructor cannot attach a material to another owner''s lecture'
);

-- Lead 2: even a forged row must not let the Storage policy serve B's file.
do $$ begin
  insert into public.material_versions (id, material_id, source_path)
  values ('7a000000-0000-0000-0000-000000000002', '6a000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000002/direct/b.pptx');
exception when others then null;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from storage.objects where name = '1b000000-0000-0000-0000-000000000002/direct/b.pptx'),
  0,
  'a participant cannot read another owner''s source file through a forged path'
);

reset role;
select * from finish();
rollback;
