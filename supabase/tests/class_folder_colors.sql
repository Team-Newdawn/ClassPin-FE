begin;

select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '11000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'folder-color@test.local', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.session_folders (id, owner_id, name, color_index, created_at)
values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'First', 4, '2026-01-01T00:00:00Z'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'Second', 1, '2026-01-02T00:00:00Z');

reset role;

update public.session_folders
set created_at = case id
  when '31000000-0000-0000-0000-000000000001' then '2026-01-03T00:00:00Z'::timestamptz
  else '2026-01-01T00:00:00Z'::timestamptz
end
where owner_id = '11000000-0000-0000-0000-000000000001';

select is(
  (select color_index::integer from public.session_folders where id = '31000000-0000-0000-0000-000000000001'),
  4,
  'first folder color survives an order change'
);

select is(
  (select color_index::integer from public.session_folders where id = '31000000-0000-0000-0000-000000000002'),
  1,
  'second folder color survives an order change'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.session_folders'::regclass
      and conname = 'session_folders_color_index_check'
      and contype = 'c'
  ),
  'folder color range is protected by a check constraint'
);

select * from finish();

rollback;
