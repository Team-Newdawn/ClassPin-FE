-- 강의 자료 삭제 뒤 비공개 원본 파일도 소유 강사가 회수할 수 있게 한다.
-- 렌더 이미지(lecture-slides)는 슬라이드 추가 마이그레이션에서 같은 정책을 이미 가진다.
create policy "owners delete source materials"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'course-materials'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_admin())
);
