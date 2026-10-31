begin;

select plan(10);

-- Only service_role reads or writes reports and audience records; signed-in and anonymous clients get nothing.
select is(has_table_privilege('anon', 'public.instructor_reports', 'select'), false, 'anon cannot select instructor_reports');
select is(has_table_privilege('anon', 'public.instructor_reports', 'insert'), false, 'anon cannot insert instructor_reports');
select is(has_table_privilege('authenticated', 'public.instructor_reports', 'select'), false, 'authenticated cannot select instructor_reports');
select is(has_table_privilege('authenticated', 'public.instructor_reports', 'insert'), false, 'authenticated cannot insert instructor_reports');
select is(has_table_privilege('anon', 'public.lecture_audience_records', 'select'), false, 'anon cannot select lecture_audience_records');
select is(has_table_privilege('anon', 'public.lecture_audience_records', 'insert'), false, 'anon cannot insert lecture_audience_records');
select is(has_table_privilege('authenticated', 'public.lecture_audience_records', 'select'), false, 'authenticated cannot select lecture_audience_records');
select col_default_is('public', 'lecture_audience_records', 'samples', '[]'::jsonb, 'samples default to an empty list');
select col_default_is('public', 'lecture_audience_records', 'slide_changes', '[]'::jsonb, 'slide changes default to an empty list');

set local role authenticated;
select throws_ok('select * from public.instructor_reports', '42501', null, 'an authenticated query on instructor_reports is denied');
reset role;

select * from finish();
rollback;
