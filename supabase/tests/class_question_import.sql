begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.campaigns (
  id, owner_id, title, join_code, status, feedback_categories, created_at
) values (
  '40000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'Import fixture',
  'FEED01',
  'ended',
  '{"praise":{"label":"좋았어요","enabled":true,"archived":false},"custom-speed":{"label":"진행 속도","enabled":true,"archived":false}}',
  '2026-08-01T00:00:00Z'
);

insert into public.campaign_pages (
  id, campaign_id, page_index, image_path, image_width, image_height, created_at
) values (
  '50000000-0000-0000-0000-000000000005',
  '40000000-0000-0000-0000-000000000004',
  0,
  '10000000-0000-0000-0000-000000000001/source.png',
  1280,
  720,
  '2026-08-01T00:00:00Z'
);

insert into public.feedback_pins (
  id, campaign_id, author_id, x, y, category, body, hidden, page_index, marker, created_at, updated_at
) values
  ('60000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 0.25, 0.75, 'custom-speed', '조금 빨라요', false, 0, 'idea', '2026-08-01T00:01:00Z', '2026-08-01T00:02:00Z'),
  ('60000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 0.5, 0.5, 'praise', '숨긴 피드백', true, 0, 'smile', '2026-08-01T00:03:00Z', '2026-08-01T00:03:00Z');

insert into public.feedback_pin_reactions (pin_id, reactor_id, created_at)
values ('60000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003', '2026-08-01T00:04:00Z');

-- Storage 파일 자체는 앱이 Storage API로 복사한다. DB 테스트에는 RPC가 확인하는
-- 대상 객체 메타데이터만 트랜잭션 안에 만들고 마지막에 함께 롤백한다.
insert into storage.objects (bucket_id, name, owner_id)
values (
  'lecture-slides',
  '10000000-0000-0000-0000-000000000001/80000000-0000-0000-0000-000000000008/pin-feedback/b0000000-0000-0000-0000-00000000000b.png',
  '10000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  imported_id uuid;
  repeated_id uuid;
  settings jsonb := '{"praise":{"label":"좋았어요","enabled":true,"archived":false},"custom-speed":{"label":"진행 속도","enabled":true,"archived":false}}';
  mappings jsonb := '[{"id":"b0000000-0000-0000-0000-00000000000b","source_page_id":"50000000-0000-0000-0000-000000000005","page_index":0,"image_path":"10000000-0000-0000-0000-000000000001/80000000-0000-0000-0000-000000000008/pin-feedback/b0000000-0000-0000-0000-00000000000b.png"}]';
begin
  imported_id := public.import_feedback_campaign(
    '40000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000007',
    '80000000-0000-0000-0000-000000000008',
    '90000000-0000-0000-0000-000000000009',
    'a0000000-0000-0000-0000-00000000000a',
    'IMPORT01',
    mappings,
    settings
  );
  assert imported_id = '80000000-0000-0000-0000-000000000008', 'import returned the wrong lecture';

  repeated_id := public.import_feedback_campaign(
    '40000000-0000-0000-0000-000000000004',
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    'IMPORT02', mappings, settings
  );
  assert repeated_id = imported_id, 'repeated import was not idempotent';

  assert (select count(*) from public.courses where id = '70000000-0000-0000-0000-000000000007') = 1, 'course was not imported';
  assert (select status = 'ended' from public.lectures where id = imported_id), 'imported lecture must start ended';
  assert (select count(*) from public.slides where material_version_id = 'a0000000-0000-0000-0000-00000000000a') = 1, 'slide was not imported';
  assert (select count(*) from public.questions where lecture_id = imported_id) = 1, 'hidden feedback must stay out of Class questions';
  assert (select category = 'custom-speed' and marker = 'idea' and reaction_count = 1 from public.questions where lecture_id = imported_id), 'feedback fields or reactions were not preserved';
  assert (select count(*) from public.feedback_pins where campaign_id = '40000000-0000-0000-0000-000000000004') = 2, 'source feedback was modified';
  assert exists (select 1 from public.campaign_pages where id = '50000000-0000-0000-0000-000000000005'), 'source page was removed';
  -- Restart follows this exact authenticated lecture status update path.
  update public.lectures set status = 'live' where id = imported_id;
  assert (select status = 'live' from public.lectures where id = imported_id), 'owner could not restart lecture';
  begin
    update public.lectures set question_categories = '{}'::jsonb where id = imported_id;
    raise exception 'invalid question categories unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$$;

reset role;
update public.lectures
set question_categories = '{"praise":{"label":"좋았어요","enabled":true,"archived":false},"custom-speed":{"label":"진행 속도","enabled":false,"archived":false}}'
where id = '80000000-0000-0000-0000-000000000008';

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);

do $$
begin
  begin
    insert into public.questions (
      id, course_id, lecture_id, slide_id, author_id, category, marker, raw_text
    ) values (
      'c0000000-0000-0000-0000-00000000000c',
      '70000000-0000-0000-0000-000000000007',
      '80000000-0000-0000-0000-000000000008',
      'b0000000-0000-0000-0000-00000000000b',
      '20000000-0000-0000-0000-000000000002',
      'custom-speed', 'smile', '비활성 카테고리'
    );
    raise exception 'disabled category insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.questions (
    id, course_id, lecture_id, slide_id, author_id, category, marker, raw_text
  ) values (
    'd0000000-0000-0000-0000-00000000000d',
    '70000000-0000-0000-0000-000000000007',
    '80000000-0000-0000-0000-000000000008',
    'b0000000-0000-0000-0000-00000000000b',
    '20000000-0000-0000-0000-000000000002',
    'praise', 'smile', '활성 카테고리'
  );

  assert (select marker = 'smile' from public.questions where id = 'd0000000-0000-0000-0000-00000000000d'), 'participant marker was not stored';
end;
$$;

rollback;
