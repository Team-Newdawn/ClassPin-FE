begin;
select plan(4);
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('17000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'labels-owner@test.local', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('17000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'labels-other@test.local', '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.courses (id, owner_id, title)
values ('47000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', 'Labels');
insert into public.lectures (id, course_id, title, join_code, status)
values ('57000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Labels', 'LABEL1', 'live');
select is((select show_question_labels from public.lectures where join_code='LABEL1'), false, 'PIN only is the default');
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
update public.lectures set show_question_labels=true where join_code='LABEL1';
select is((select show_question_labels from public.lectures where join_code='LABEL1'), true, 'owner saves PIN and question mode');
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
update public.lectures set show_question_labels=false where join_code='LABEL1';
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
select is((select show_question_labels from public.lectures where join_code='LABEL1'), true, 'other user cannot change the mode');
reset role;
update public.lectures set show_question_pins=false where join_code='LABEL1';
select is((select show_question_labels from public.lectures where join_code='LABEL1'), true, 'hiding PINs preserves their display mode');
select * from finish();
rollback;
