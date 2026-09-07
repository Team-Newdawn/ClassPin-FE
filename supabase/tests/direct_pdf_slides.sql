begin;

select plan(7);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pdf-owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '23000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.courses (id, owner_id, title)
values ('43000000-0000-0000-0000-000000000004', '13000000-0000-0000-0000-000000000001', 'Direct PDF fixture');

insert into public.lectures (id, course_id, title, join_code, status)
values ('53000000-0000-0000-0000-000000000005', '43000000-0000-0000-0000-000000000004', 'Direct PDF fixture', 'PDF001', 'live');

insert into public.materials (id, course_id, lecture_id, type, file_name)
values ('63000000-0000-0000-0000-000000000006', '43000000-0000-0000-0000-000000000004', '53000000-0000-0000-0000-000000000005', 'pdf', 'fixture.pdf');

insert into public.material_versions (id, material_id, source_path)
values ('73000000-0000-0000-0000-000000000007', '63000000-0000-0000-0000-000000000006', '13000000-0000-0000-0000-000000000001/direct/source.pdf');

insert into public.slides (id, material_version_id, page_index, image_path, source_page_index)
values
  ('83000000-0000-0000-0000-000000000008', '73000000-0000-0000-0000-000000000007', 0, null, 0),
  ('83000000-0000-0000-0000-000000000010', '73000000-0000-0000-0000-000000000007', 1, null, 1);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('course-materials', '13000000-0000-0000-0000-000000000001/direct/source.pdf', '13000000-0000-0000-0000-000000000001', '{"mimetype":"application/pdf"}');

select ok(
  (select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'slides' and column_name = 'image_path'),
  'direct PDF slides do not require an image path'
);

select is(
  (select source_page_index from public.slides where id = '83000000-0000-0000-0000-000000000008'),
  0,
  'a slide keeps its original PDF page index'
);

select throws_ok(
  $$insert into public.slides (id, material_version_id, page_index, image_path, source_page_index)
    values ('83000000-0000-0000-0000-000000000009', '73000000-0000-0000-0000-000000000007', 2, 'fixture.jpg', 2)$$,
  '23514',
  'new row for relation "slides" violates check constraint "slides_exactly_one_source"',
  'a slide cannot reference both a PDF page and an image'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select deleted_image_path from public.delete_lecture_slide('83000000-0000-0000-0000-000000000008')),
  null::text,
  'deleting a PDF page does not request image storage cleanup'
);

reset role;
select is(
  (select source_page_index from public.slides where id = '83000000-0000-0000-0000-000000000010'),
  1,
  'deleting a PDF page keeps the remaining original page mapping'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'course-materials'),
  1,
  'a participant can read the source PDF while its lecture is live'
);

reset role;
update public.lectures set status = 'ended' where id = '53000000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'course-materials'),
  0,
  'a participant cannot read the source PDF after the lecture ends'
);

reset role;
select * from finish();
rollback;
