begin;

select plan(34);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'remote-owner@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'remote-other@test.local', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), false),
  ('00000000-0000-0000-0000-000000000000', '26000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true),
  ('00000000-0000-0000-0000-000000000000', '26000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), true);

insert into public.courses (id, owner_id, title)
values ('46000000-0000-0000-0000-000000000004', '16000000-0000-0000-0000-000000000001', 'Remote fixture');
insert into public.lectures (id, course_id, title, join_code, status)
values ('56000000-0000-0000-0000-000000000005', '46000000-0000-0000-0000-000000000004', 'Remote fixture', 'REMOTE1', 'live');
insert into public.materials (id, course_id, lecture_id, type, file_name)
values ('66000000-0000-0000-0000-000000000006', '46000000-0000-0000-0000-000000000004', '56000000-0000-0000-0000-000000000005', 'pdf', 'fixture.pdf');
insert into public.material_versions (id, material_id, source_path)
values ('76000000-0000-0000-0000-000000000007', '66000000-0000-0000-0000-000000000006', '16000000-0000-0000-0000-000000000001/direct/source.pdf');
insert into public.slides (material_version_id, page_index, image_path, source_page_index)
values ('76000000-0000-0000-0000-000000000007', 0, null, 0),
       ('76000000-0000-0000-0000-000000000007', 1, null, 1),
       ('76000000-0000-0000-0000-000000000007', 2, null, 2);

insert into public.questions (course_id, lecture_id, slide_id, author_id, raw_text)
select '46000000-0000-0000-0000-000000000004', '56000000-0000-0000-0000-000000000005', id,
  '26000000-0000-0000-0000-000000000001', 'Remote question'
from public.slides where material_version_id='76000000-0000-0000-0000-000000000007' and page_index=0;
insert into public.slide_instructor_notes (slide_id, body)
select id, 'PRIVATE REMOTE NOTE' from public.slides
where material_version_id='76000000-0000-0000-0000-000000000007' and page_index=0;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.ohpin_issue_lecture_remote('56000000-0000-0000-0000-000000000005')$$, '42501', null, 'non-owner cannot issue a remote');

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select set_config('test.old_token', public.ohpin_issue_lecture_remote('56000000-0000-0000-0000-000000000005'), true);

select set_config('request.jwt.claim.sub', '26000000-0000-0000-0000-000000000001', true);
select is(public.ohpin_remote_control(current_setting('test.old_token'), 1, '{"show_question_pins":false}')->>'current_page', '0', 'the claiming call does not move');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 1)->>'current_page', '1', 'holder moves forward');
select public.ohpin_remote_control(current_setting('test.old_token'), 1);
select is(public.ohpin_remote_control(current_setting('test.old_token'), 1)->>'current_page', '2', 'page stays inside the slides');
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), 5)$$, '22023', null, 'only one step at a time');
select is((select count(*) from public.lecture_remotes)::int, 0, 'remote rows are hidden from non-owners');


select is(public.ohpin_remote_control(current_setting('test.old_token'), 0)->>'show_question_pins', 'true', 'claiming did not change settings');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_question_pins":false}')->>'show_question_pins', 'false', 'holder hides PINs');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_question_labels":true}')->>'show_question_labels', 'true', 'holder selects PIN and question');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_question_pins":true}')->>'show_question_labels', 'true', 'PIN mode survives visibility changes');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_presentation_qr":false}')->>'show_presentation_qr', 'false', 'holder hides QR');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"presentation_qr_position":"top-left"}')->>'presentation_qr_position', 'top-left', 'holder moves QR');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_presentation_qr":true}')->>'presentation_qr_position', 'top-left', 'QR location survives hide/show');
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"status":"ended"}')$$, '22023', null, 'remote cannot change lifecycle');
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_question_pins":"false"}')$$, '22023', null, 'boolean types are validated');
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"presentation_qr_position":"center"}')$$, '22023', null, 'QR locations are validated');
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_question_labels":null}')$$, '22023', null, 'null settings are rejected');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0)->>'question_count', '1', 'poll includes question count');
select is(public.ohpin_remote_control(current_setting('test.old_token'), 0)->'questions', 'null'::jsonb, 'closed sheet does not fetch question text');
select set_config('test.question_snapshot', public.ohpin_remote_control(current_setting('test.old_token'), 0, '{}', true)::text, true);
select is(current_setting('test.question_snapshot')::jsonb->'questions'->0->>'text', 'Remote question', 'sheet gets question text');
select is(current_setting('test.question_snapshot')::jsonb->'questions'->0->>'slide_index', '0', 'sheet gets the slide number');
select is((select string_agg(key, ',' order by key) from jsonb_object_keys(current_setting('test.question_snapshot')::jsonb->'questions'->0) as key), 'id,slide_index,text', 'question fields exclude author identifiers');
select ok(position('PRIVATE REMOTE NOTE' in current_setting('test.question_snapshot'))=0, 'speaker note never enters remote payload');
select ok(not has_function_privilege('anon', 'public.ohpin_remote_control(text,integer,jsonb,boolean)', 'EXECUTE'), 'unsigned callers cannot execute remote RPC');

select set_config('request.jwt.claim.sub', '26000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), -1)$$, '42501', 'remote_in_use', 'second device is refused');
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), 0, '{"show_presentation_qr":false}', true)$$, '42501', 'remote_in_use', 'second device cannot change settings or read questions');

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select is((select holder_id from public.lecture_remotes), '26000000-0000-0000-0000-000000000001'::uuid, 'owner sees the connected device');
select set_config('test.new_token', public.ohpin_issue_lecture_remote('56000000-0000-0000-0000-000000000005'), true);

select set_config('request.jwt.claim.sub', '26000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.ohpin_remote_control(current_setting('test.old_token'), -1)$$, 'P0002', 'remote_revoked', 'reissue revokes the old link');

select set_config('request.jwt.claim.sub', '26000000-0000-0000-0000-000000000002', true);
select public.ohpin_remote_control(current_setting('test.new_token'), 0);
select is(public.ohpin_remote_control(current_setting('test.new_token'), -1)->>'current_page', '1', 'new holder moves back');
select lives_ok($$update public.lectures set current_page = 0$$, 'direct update runs');
select is((select current_page from public.lectures where id = '56000000-0000-0000-0000-000000000005'), 1, 'direct update does not reach the lecture');

reset role;
update public.lectures set status = 'ended' where id = '56000000-0000-0000-0000-000000000005';
select is((select count(*) from public.lecture_remotes)::int, 0, 'leaving LIVE releases the remote');


set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
select set_config('test.waiting_token', public.ohpin_issue_lecture_remote('56000000-0000-0000-0000-000000000005'), true);
select set_config('request.jwt.claim.sub', '26000000-0000-0000-0000-000000000001', true);
select public.ohpin_remote_control(current_setting('test.waiting_token'), 0);
select is(public.ohpin_remote_control(current_setting('test.waiting_token'), 0, '{"show_question_pins":false}')->>'show_question_pins', 'true', 'remote settings do not write outside LIVE');
select is(public.ohpin_remote_control(current_setting('test.waiting_token'), 0, '{}', true)->>'question_count', '0', 'outside LIVE question history is not returned');

select * from finish();
rollback;
