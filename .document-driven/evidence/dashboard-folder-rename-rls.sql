begin;

insert into auth.users (id, email, is_anonymous)
values ('11111111-1111-4111-8111-111111111111', 'folder-rename-check@example.test', false);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.session_folders (id, owner_id, name)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', '수정 전');

update public.session_folders
set name = '수정 후'
where id = '22222222-2222-4222-8222-222222222222'
  and owner_id = '11111111-1111-4111-8111-111111111111';

do $$
begin
  if (select name from public.session_folders where id = '22222222-2222-4222-8222-222222222222') <> '수정 후' then
    raise exception 'folder rename RLS check failed';
  end if;
end
$$;

rollback;
