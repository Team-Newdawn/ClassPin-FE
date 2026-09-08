begin;

select plan(21);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ai-owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.session_folders (id, owner_id, name)
values ('32000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000001', 'AI report fixture');

insert into public.courses (id, owner_id, folder_id, title)
values ('42000000-0000-0000-0000-000000000004', '12000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000003', 'AI report fixture');

insert into public.lectures (id, course_id, title, join_code, status)
values ('52000000-0000-0000-0000-000000000005', '42000000-0000-0000-0000-000000000004', 'AI report fixture', 'AIREPT1', 'live');

insert into public.materials (id, course_id, lecture_id, type, file_name) values
  ('62000000-0000-0000-0000-000000000006', '42000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005', 'pdf', 'selected.pdf'),
  ('62000000-0000-0000-0000-000000000007', '42000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005', 'pdf', 'other.pdf');

insert into public.material_versions (id, material_id, version_no, source_path, checksum) values
  ('72000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000006', 1, 'owner/old.pdf', repeat('a', 64)),
  ('72000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000006', 2, 'owner/current.pdf', repeat('b', 64)),
  ('72000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000007', 1, 'owner/other.pdf', repeat('c', 64));

insert into public.slides (id, material_version_id, page_index, image_path, image_checksum) values
  ('82000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 0, 'owner/old.png', repeat('d', 64)),
  ('82000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 0, 'owner/current.png', repeat('e', 64)),
  ('82000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000003', 0, 'owner/other.png', repeat('f', 64));

insert into public.region_anchors (id, slide_id, material_version_id, kind, coords, created_by) values
  ('92000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'point', '{"x":0.25,"y":0.4}', 'user'),
  ('92000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'point', '{"x":0.5,"y":0.5}', 'user'),
  ('92000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000003', 'point', '{"x":0.7,"y":0.6}', 'user');

insert into public.questions (id, course_id, lecture_id, slide_id, region_id, author_id, category, marker, raw_text) values
  ('a2000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 'concept', 'pin', '선택된 최신 슬라이드 질문'),
  ('a2000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'concept', 'pin', '이전 버전 질문'),
  ('a2000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000004', '52000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000002', 'concept', 'pin', '다른 자료 질문');

create temporary table ai_report_test_inspection as
select public.inspect_ai_report_selection(
  '12000000-0000-0000-0000-000000000001', 'material', null,
  array['62000000-0000-0000-0000-000000000006'::uuid]
) as value;

select is((select (value ->> 'materialCount')::integer from ai_report_test_inspection), 1, 'inspection counts the selected material');
select is((select (value ->> 'slideCount')::integer from ai_report_test_inspection), 1, 'inspection uses only the latest material version');
select is((select (value ->> 'questionCount')::integer from ai_report_test_inspection), 1, 'inspection excludes old-version and sibling-material questions');
select matches((select value ->> 'sourceFingerprint' from ai_report_test_inspection), '^[0-9a-f]{64}$', 'inspection produces a SHA-256 fingerprint');

create temporary table ai_report_test_created as
select public.create_ai_report_snapshot(
  '12000000-0000-0000-0000-000000000001', 'material', null,
  array['62000000-0000-0000-0000-000000000006'::uuid],
  (select value ->> 'sourceFingerprint' from ai_report_test_inspection),
  'ai-report-test-create-0001', repeat('d', 64),
  'fake:local:fake-generation:fake/generation-v1:fake-critic:fake/critic-v1',
  'ai-report-prompts.v1', 'ai-report-canonical.v1', now(), 0.1, 1
) as value;

select is((select count(*)::integer from public.ai_report_materials where report_id = (select (value ->> 'reportId')::uuid from ai_report_test_created)), 1, 'snapshot stores exactly one material');
select is((select count(*)::integer from public.ai_report_slides where report_id = (select (value ->> 'reportId')::uuid from ai_report_test_created)), 1, 'snapshot stores exactly one latest-version slide');
select is((select source_checksum from public.ai_report_slides where report_id = (select (value ->> 'reportId')::uuid from ai_report_test_created)), repeat('e', 64), 'snapshot stores the rendered slide checksum');
select is(
  (select jsonb_array_length(question_snapshot -> 'questions') from public.ai_report_slides where report_id = (select (value ->> 'reportId')::uuid from ai_report_test_created)),
  1,
  'snapshot stores only questions belonging to the selected slide'
);

select is(
  (public.claim_ai_report_prepare(
    (select (value ->> 'jobId')::uuid from ai_report_test_created), 300
  ) ->> 'reportId')::uuid,
  (select (value ->> 'reportId')::uuid from ai_report_test_created),
  'worker atomically claims the prepare stage'
);

select is(
  public.reserve_ai_report_cost(
    (select (value ->> 'jobId')::uuid from ai_report_test_created),
    'ai-report-test-call-0001', 'slide_generation', 0.6, 1, 300
  ) ->> 'status',
  'reserved',
  'worker reserves worst-case provider cost before a call'
);

select throws_ok(
  format(
    $$select public.reserve_ai_report_cost(%L, 'ai-report-test-call-0002', 'slide_critic', 0.5, 1, 300)$$,
    (select value ->> 'jobId' from ai_report_test_created)
  ),
  '22003',
  'AI report hard cost cap would be exceeded',
  'concurrent reservations cannot cross the report hard cap'
);

select is(
  (public.settle_ai_report_cost('ai-report-test-call-0001', 0.4, 1) ->> 'withinCap')::boolean,
  true,
  'settled provider cost remains within the hard cap'
);

select is(
  jsonb_array_length(public.complete_ai_report_prepare(
    (select (value ->> 'jobId')::uuid from ai_report_test_created)
  ) -> 'slideAliases'),
  1,
  'prepare completion queues every snapshot slide'
);

select is(
  (public.claim_ai_report_slide(
    (select (value ->> 'jobId')::uuid from ai_report_test_created), 'S001', 300
  ) ->> 'slide_alias'),
  'S001',
  'worker atomically claims a slide unit'
);

select is(
  (public.complete_ai_report_slide(
    (select (value ->> 'jobId')::uuid from ai_report_test_created), 'S001', repeat('e', 64),
    '{}'::jsonb, 'owner/report/S001', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  ) ->> 'shouldSynthesize')::boolean,
  true,
  'last completed slide advances the job to synthesis'
);

select is(
  (public.claim_ai_report_synthesis(
    (select (value ->> 'jobId')::uuid from ai_report_test_created), 300
  ) ->> 'reportId')::uuid,
  (select (value ->> 'reportId')::uuid from ai_report_test_created),
  'worker atomically claims synthesis'
);

select is(
  (public.complete_ai_report(
    (select (value ->> 'jobId')::uuid from ai_report_test_created),
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0.4
  ) ->> 'reportId')::uuid,
  (select (value ->> 'reportId')::uuid from ai_report_test_created),
  'validated synthesis publishes a ready report atomically'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::integer from public.ai_reports), 1, 'admin owner can read the report through RLS');

select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.ai_reports), 0, 'participant cannot read an instructor report');
reset role;

update public.questions
set reaction_count = reaction_count + 1
where id = 'a2000000-0000-0000-0000-000000000001';

select isnt(
  (select value ->> 'sourceFingerprint' from ai_report_test_inspection),
  (public.inspect_ai_report_selection(
    '12000000-0000-0000-0000-000000000001', 'material', null,
    array['62000000-0000-0000-0000-000000000006'::uuid]
  ) ->> 'sourceFingerprint'),
  'fingerprint changes when PIN evidence changes'
);

select throws_ok(
  format(
    $$select public.create_ai_report_snapshot(
      '12000000-0000-0000-0000-000000000001', 'material', null,
      array['62000000-0000-0000-0000-000000000006'::uuid], %L,
      'ai-report-test-create-0002', %L,
      'fake:local:fake-generation:fake/generation-v1:fake-critic:fake/critic-v1',
      'ai-report-prompts.v1', 'ai-report-canonical.v1', now(), 0.1, 1
    )$$,
    (select value ->> 'sourceFingerprint' from ai_report_test_inspection),
    repeat('e', 64)
  ),
  '40001',
  'AI report source changed after preflight',
  'snapshot rejects a stale preflight fingerprint'
);

select * from finish();

rollback;
