-- Pin Class와 Pin 캠페인은 동일한 강사 소유 폴더를 사용한다.
alter table public.session_folders
drop constraint session_folders_name_check;

alter table public.session_folders
add constraint session_folders_name_check
check (name = btrim(name) and char_length(name) between 1 and 80);

alter table public.courses add column folder_id uuid;

-- 폴더와 코스의 owner_id를 함께 참조해 다른 강사의 폴더로 이동할 수 없게 한다.
alter table public.courses
add constraint courses_folder_owner_fk
foreign key (folder_id, owner_id)
references public.session_folders(id, owner_id)
on delete set null (folder_id);

create index courses_folder_idx on public.courses(folder_id);

-- 기존 courses/session_folders RLS와 authenticated Data API 권한이 새 열에도 적용된다.
notify pgrst, 'reload schema';
