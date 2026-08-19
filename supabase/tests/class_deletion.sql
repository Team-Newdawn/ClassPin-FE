begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.session_folders (id, owner_id, name)
values ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Delete fixture');

insert into public.courses (id, owner_id, folder_id, title)
values ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Delete fixture');

insert into public.lectures (id, course_id, title, join_code, status)
values ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000004', 'Delete fixture', 'DELETE1', 'live');

insert into public.materials (id, course_id, lecture_id, type, file_name)
values ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005', 'pdf', 'fixture.pdf');

insert into public.material_versions (id, material_id, source_path)
values ('70000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000005/fixture.pdf');

insert into public.slides (id, material_version_id, page_index, image_path)
values ('80000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000007', 0, '10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000005/slide.jpg');

insert into public.questions (id, course_id, lecture_id, slide_id, author_id, category, marker, raw_text)
values ('90000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000002', 'concept', 'pin', '삭제 테스트 질문');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

delete from public.session_folders where id = '30000000-0000-0000-0000-000000000003';

do $$
begin
  assert (select folder_id is null from public.courses where id = '40000000-0000-0000-0000-000000000004'), 'folder deletion must move materials to Unfiled';
  assert exists (select 1 from public.lectures where id = '50000000-0000-0000-0000-000000000005'), 'folder deletion must preserve the lecture';
end;
$$;

reset role;
do $$
begin
  assert exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'owners delete source materials'
      and cmd = 'DELETE'
  ), 'source material delete policy is missing';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
delete from public.courses where id = '40000000-0000-0000-0000-000000000004';

reset role;
do $$
begin
  assert exists (select 1 from public.courses where id = '40000000-0000-0000-0000-000000000004'), 'participant deleted another owner''s material';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
delete from public.courses where id = '40000000-0000-0000-0000-000000000004';

reset role;
do $$
begin
  assert not exists (select 1 from public.courses where id = '40000000-0000-0000-0000-000000000004'), 'owner course deletion failed';
  assert not exists (select 1 from public.lectures where id = '50000000-0000-0000-0000-000000000005'), 'lecture did not cascade';
  assert not exists (select 1 from public.materials where id = '60000000-0000-0000-0000-000000000006'), 'material did not cascade';
  assert not exists (select 1 from public.slides where id = '80000000-0000-0000-0000-000000000008'), 'slide did not cascade';
  assert not exists (select 1 from public.questions where id = '90000000-0000-0000-0000-000000000009'), 'question did not cascade';
end;
$$;

rollback;
