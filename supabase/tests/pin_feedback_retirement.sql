begin;

select plan(1);

do $$
begin
  assert to_regclass('public.campaigns') is null, 'campaigns is not retired';
  assert to_regclass('public.campaign_pages') is null, 'campaign_pages is not retired';
  assert to_regclass('public.feedback_pins') is null, 'feedback_pins is not retired';
  assert to_regclass('public.feedback_pin_reactions') is null, 'feedback_pin_reactions is not retired';
  assert not exists (
    select 1
    from pg_type as type
    join pg_namespace as namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public' and type.typname = 'campaign_status'
  ), 'campaign_status is not retired';

  assert not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.proname in (
        'campaign_accepts_feedback_category',
        'campaign_is_live',
        'campaign_owned',
        'campaign_page_exists',
        'feedback_categories_are_valid',
        'find_campaign_by_code',
        'find_campaign_pages',
        'find_campaign_pages_by_code',
        'find_campaign_player',
        'find_live_campaign',
        'import_feedback_campaign',
        'set_campaign_audience_groups',
        'set_feedback_pin_reaction',
        'sync_feedback_pin_reaction_count',
        'valid_campaign_audience_groups'
      )
  ), 'legacy Campaign functions are not retired';

  assert (
    select count(*)::integer
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('campaigns', 'feedback_pins')
  ) = 0, 'legacy tables remain in Realtime';

  assert not exists (
    select 1 from storage.objects where bucket_id = 'campaign-images'
  ), 'campaign-images object precondition is not empty';

  assert not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in ('owners upload campaign images', 'owners delete campaign images')
  ), 'campaign-images policies are not retired';

  assert not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'platform_experience_responses'
      and column_name = 'campaign_id'
  ), 'Campaign survey column is not retired';

  assert exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'platform_experience_responses'
      and column_name = 'lecture_id'
      and is_nullable = 'NO'
  ), 'lecture survey source is nullable';

  assert to_regprocedure('public.submit_platform_experience_response(text,text,text,text)') is null,
    'generic survey RPC is not retired';
  assert to_regprocedure('public.submit_lecture_experience_response(text,text,text)') is not null,
    'lecture-only survey RPC is missing';

  assert (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'platform_experience_responses'
      and policyname = 'owners view platform experience responses'
      and cmd = 'SELECT'
      and qual like '%course_owned%'
      and qual not like '%campaign%'
  ) = 1, 'survey owner policy is not lecture-only';
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.courses (id, owner_id, title)
values ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Preserved import');

insert into public.lectures (id, course_id, title, join_code, status, question_categories)
values (
  '40000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000003',
  'Preserved import',
  'IMPORT01',
  'ended',
  '{"custom-speed":{"label":"진행 속도","enabled":true,"archived":false}}'
);

insert into public.materials (id, course_id, lecture_id, type, file_name)
values (
  '50000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000004',
  'slide_deck',
  'Preserved import (PinFeedback)'
);

insert into public.material_versions (id, material_id, source_path)
values (
  '60000000-0000-0000-0000-000000000006',
  '50000000-0000-0000-0000-000000000005',
  'pin-feedback/70000000-0000-0000-0000-000000000007'
);

insert into public.slides (id, material_version_id, page_index, image_path)
values (
  '80000000-0000-0000-0000-000000000008',
  '60000000-0000-0000-0000-000000000006',
  0,
  '10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000004/pin-feedback/slide.png'
);

insert into public.questions (
  id, course_id, lecture_id, slide_id, author_id, category, marker, raw_text, occurred_in
) values (
  '90000000-0000-0000-0000-000000000009',
  '30000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000004',
  '80000000-0000-0000-0000-000000000008',
  '20000000-0000-0000-0000-000000000002',
  'custom-speed',
  'idea',
  '보존된 질문',
  'post'
);

do $$
begin
  assert exists (
    select 1
    from public.material_versions
    where id = '60000000-0000-0000-0000-000000000006'
      and source_path = 'pin-feedback/70000000-0000-0000-0000-000000000007'
  ), 'Pin Feedback provenance was not preserved';

  assert exists (
    select 1
    from public.questions
    where id = '90000000-0000-0000-0000-000000000009'
      and category = 'custom-speed'
      and marker = 'idea'
      and occurred_in = 'post'
  ), 'legacy question category or Class fields were not preserved';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.submit_lecture_experience_response('IMPORT01', '좋았어요', '더 천천히');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  assert (
    select count(*)::integer
    from public.platform_experience_responses
    where lecture_id = '40000000-0000-0000-0000-000000000004'
  ) = 1, 'course owner cannot read the submitted lecture survey';
end;
$$;

select pass('Pin Feedback retirement contract is enforced');
select * from finish();

rollback;
