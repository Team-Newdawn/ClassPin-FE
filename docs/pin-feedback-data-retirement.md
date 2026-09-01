# Pin Feedback 데이터 폐기 명세

- Artifact ID: `pin-feedback-data-retirement`
- 상태: `approved`
- 기준일: 2026-09-01
- 근거 문서: `doc/pin_class_prd.md`
- 선행 문서: `docs/pin-feedback-sunset.md`

## 1. 목적과 결정 경계

이 문서는 별도 Pin Feedback 런타임을 제거한 뒤 보존해 온 원본 Campaign 데이터 계층을 최종 폐기하는 절차를 정의한다. 선행 문서 `pin-feedback-sunset`의 보존 결정은 당시 런타임 제거 단계의 안전 경계였으며, 이 문서는 그 이력을 수정하지 않고 별도의 명시적 승인으로 다음 폐기 단계를 연다.

- **PFDR-001**: Supabase의 Pin Feedback 원본 DB·API·Realtime·Storage 계약과 그 데이터는 검증 가능한 백업을 만든 뒤 제거한다.
- **PFDR-002**: Pin Class로 이미 복제된 강의 그래프와 `lecture-slides` 객체는 독립된 제품 데이터로 간주하며 삭제하거나 다시 원본에 연결하지 않는다.
- **PFDR-003**: 과거 migration 파일은 감사 가능한 이력으로 그대로 둔다. 최종 스키마만 새 forward-only migration으로 폐기 상태에 도달시킨다.
- **PFDR-004**: `/pin` 런타임, Campaign import, 호환 RPC, 리다이렉트, 호환용 빈 테이블은 복원하거나 추가하지 않는다.
- **PFDR-005**: 명시된 폐기 대상 밖의 Class 테이블·Storage·인증 계정에는 연쇄 삭제를 허용하지 않는다. 대상이 불명확하거나 보존 데이터와 겹치면 삭제보다 보존을 선택한다.

## 2. 보존 계약

- **PFDR-010**: `material_versions.source_path LIKE 'pin-feedback/%'`인 버전에서 출발해 연결되는 Course → Lecture → Material → MaterialVersion → Slide → RegionAnchor → Question/Answer/QuestionReaction/CourseBrainMemory 행의 ID와 내용은 보존한다.
- **PFDR-011**: 해당 Slide가 참조하는 `lecture-slides` 객체의 경로, 바이트 크기, SHA-256은 보존한다. `campaign-images` 원본과 바이트가 같더라도 Class 복사본은 삭제 대상이 아니다.
- **PFDR-012**: import 뒤 Class에서 생성된 질문·답변·반응도 같은 강의 그래프의 제품 데이터로 보존한다. `occurred_in = 'post'`만으로 삭제 대상을 판정하지 않는다.
- **PFDR-013**: import provenance인 `material_versions.source_path = 'pin-feedback/<campaign-uuid>'`와 Material 파일명의 `(PinFeedback)` 표기는 활성 원본 FK나 API가 아니므로 그대로 둔다. `material_versions_pin_feedback_source_idx`만 향후 import가 없으므로 제거한다.
- **PFDR-014**: import 당시 옮겨 온 legacy 질문 category 문자열과 Class의 동적 category 표시·집계 동작을 보존한다.
- **PFDR-015**: `session_folders`와 현재 Folder-first `/admin` 흐름, `/join/[code]`, 강의 종료 설문, 노트·패널·슬라이드 탐색을 포함한 Class 계약을 변경하지 않는다.
- **PFDR-016**: 참여자 조회에서 `Slide.speakerNote`를 노출하지 않는 기존 신뢰 경계를 유지한다.

2026-09-01 원격 점검 기준으로 보존 집합은 Course/Lecture/Material/MaterialVersion 각 17개, Slide 36개, Question 906개(그중 import 시점 `post` 질문 902개와 이후 Class 질문 4개), Answer 1개, QuestionReaction 28개, CourseBrainMemory 906개, `lecture-slides` 객체 36개·15,780,426바이트다. 이 수치는 실행 계획의 고정 삭제 조건이 아니라 사전 점검의 비교 기준이다. 실제 실행 직전 `source_path`에서 ID 집합을 다시 계산하고, 변경이 있으면 새 집합을 보존 기준으로 삼는다.

## 3. 폐기 대상

### 3.1 DB와 Data API

- **PFDR-020**: 다음 원본 테이블과 모든 행을 제거한다: `campaigns`, `campaign_pages`, `feedback_pins`, `feedback_pin_reactions`.
- **PFDR-021**: `campaign_status` enum, 위 네 테이블에 귀속된 index·constraint·RLS policy·grant·trigger, `campaigns`와 `feedback_pins`의 `supabase_realtime` publication 등록을 제거한다.
- **PFDR-022**: 다음 legacy 함수 계약을 public/private 양쪽에서 제거한다.
  - Campaign 검색·표시: `find_live_campaign`, `find_campaign_pages`, `find_campaign_player`, `find_campaign_by_code`, `find_campaign_pages_by_code`
  - Campaign 권한·검증: `campaign_owned`, `campaign_is_live`, `campaign_page_exists`, `campaign_accepts_feedback_category`, `feedback_categories_are_valid`, `valid_campaign_audience_groups`
  - 반응·설정: `set_feedback_pin_reaction`, `sync_feedback_pin_reaction_count`, `set_campaign_audience_groups`
  - import: public/private `import_feedback_campaign`
- **PFDR-023**: `platform_experience_responses`에서 `campaign_id IS NOT NULL`인 원본 설문 행을 백업 후 제거하고, `platform_experience_responses_campaign_idx`, Campaign FK, `platform_experience_response_source` constraint, `campaign_id` column을 제거한다. 남는 `lecture_id`는 `NOT NULL`이어야 한다.
- **PFDR-024**: 기존 `submit_platform_experience_response(text, text, text, text)`를 제거한다. Class 전용 `submit_lecture_experience_response(target_code text, target_experience text, target_improvement text)`를 동일한 인증·trim·1~1000자 검증과 `live|ended` lecture code 확인 규칙으로 제공한다. execute 권한은 `authenticated`에만 부여한다.
- **PFDR-025**: `platform_experience_responses`의 select policy는 `lecture_id`를 통한 Course owner 확인만 남기고 Campaign 분기를 제거한다.
- **PFDR-026**: 삭제 migration은 객체별 명시적 `DROP`을 사용한다. 예상 밖 종속 객체를 함께 지울 수 있는 광범위한 `CASCADE`는 사용하지 않으며, 발견된 추가 종속성은 실행을 중단하고 문서 범위를 재검토한다.

### 3.2 Storage

- **PFDR-030**: `campaign-images` bucket의 모든 객체와 bucket metadata를 제거한다.
- **PFDR-031**: `owners upload campaign images`, `owners delete campaign images` Storage policy를 제거한다. `lecture-slides`를 포함한 다른 bucket과 policy는 변경하지 않는다.
- **PFDR-032**: 객체 바이트 삭제는 Supabase Storage API 또는 CLI로 수행한다. `storage.objects` 행을 직접 SQL로 삭제하지 않는다.

2026-09-01 원격 점검 기준 원본은 Campaign 24개, CampaignPage 54개, FeedbackPin 1,001개, FeedbackPinReaction 93개, Campaign 설문 0개, `campaign-images` 객체 120개·44,720,115바이트다. 이 수치도 실행 직전 다시 산출한다.

## 4. 사전 점검과 30일 백업

- **PFDR-040**: 실행 직전에 원격 project ref와 migration 상태를 확인하고, 폐기 테이블 행 수와 canonical row fingerprint, Campaign 설문 수와 fingerprint, `campaign-images` 객체 이름·크기·해시, 보존 Class ID 그래프, `lecture-slides` 객체 이름·크기·해시를 한 시점의 baseline manifest로 봉인한다.
- **PFDR-041**: 원본 네 테이블, Campaign 설문 행, 관련 스키마 정의를 복구 가능한 PostgreSQL logical export로 저장한다. FK로 참조된 actor UUID는 보존하되 JWT, service-role key, refresh token 등 credential은 기록하지 않는다.
- **PFDR-042**: DB backup에는 Storage 객체 바이트가 포함되지 않으므로 `campaign-images` 전체를 별도 재귀 복사한다. 각 객체의 상대 경로, 바이트 크기, SHA-256과 전체 합계를 manifest에 기록한다.
- **PFDR-043**: 백업은 저장소 밖의 암호화된 운영자 전용 비공개 경로에 두고 디렉터리 mode를 `0700`으로 제한한다. 복호화 수단은 backup과 분리한다. 저장소 evidence에는 개인 UUID·객체명·응답 본문 없이 aggregate count, 검증 결과, backup manifest hash, 생성·만료·폐기 시각만 남긴다.
- **PFDR-044**: 삭제 전 격리된 PostgreSQL에서 logical export가 읽히고 restore 가능한지 확인하고, 복사한 모든 Storage 객체의 수·크기·SHA-256이 baseline과 일치하는지 확인한다. 하나라도 불일치하면 삭제를 시작하지 않는다.
- **PFDR-045**: 검증된 백업은 원격 폐기 완료 시점부터 30일간 보관한 뒤 복구 불가능하게 삭제한다. 만료 시각과 실제 폐기 증거를 남긴다. 법적 보존 요청이나 복구 진행 중이면 삭제를 멈추고 별도 승인을 받는다.

## 5. 실행 순서와 실패 처리

- **PFDR-050**: 새 SQL 파일은 `supabase migration new`로 만들고 모든 DB/Data API/Realtime/Storage metadata 변경을 하나의 forward-only transaction에서 수행한다.
- **PFDR-051**: 검증된 backup 뒤 Storage API/CLI로 `campaign-images` 객체를 비우고, API listing과 `storage.objects` 조회가 모두 0개임을 확인한다.
- **PFDR-052**: migration은 먼저 두 Campaign Storage policy를 제거하고 `storage.objects`에 명시적 write-excluding lock을 잡은 뒤, `campaign-images` 객체가 0개라는 precondition을 다시 확인한다. 1개라도 있으면 명시적 예외로 전체 transaction을 rollback한다. 따라서 backup 뒤 새 upload가 발생해도 조용히 삭제하지 않는다. 잠금은 짧은 migration transaction 동안만 유지하며 다른 bucket을 변경하지 않는다.
- **PFDR-053**: migration은 네 legacy table에 write-excluding lock을 잡고, 검증된 backup에서 생성한 기대 행 수·canonical fingerprint와 현재 값을 비교한다. fresh local DB처럼 네 테이블과 Campaign 설문이 모두 비어 있는 상태는 명시적으로 허용하지만, 데이터가 하나라도 있는 환경에서는 전체 fingerprint가 정확히 일치해야 한다. drift가 있으면 전체 transaction을 rollback하고 backup부터 다시 만든다. DB와 Storage precondition을 모두 통과한 transaction만 bucket metadata, Realtime 등록, legacy 함수·설문 분기·테이블·enum을 dependency 순서대로 제거하고 lecture-only RPC와 policy를 설치한다. transaction 끝에서 PostgREST schema reload를 요청한다.
- **PFDR-054**: Storage 객체 삭제는 DB transaction 밖의 비가역 단계다. 객체를 비운 뒤 migration이 실패하면 backup을 유지한 채 원인을 고치고 migration을 재시도한다. 서비스 복구가 필요하면 검증된 backup에서 `campaign-images`를 복원하고 수·크기·해시를 재검증한다.
- **PFDR-055**: remote migration 성공 전에는 Auth 계정을 삭제하지 않는다. DB rollback과 Auth Admin 작업을 하나의 원자적 작업으로 가장하지 않는다.

## 6. Auth 계정 정리

- **PFDR-060**: source actor 집합은 migration 전에 FeedbackPin 작성자, FeedbackPinReaction 반응자, Campaign 설문 작성자의 UUID로 계산해 비공개 manifest에 봉인한다.
- **PFDR-061**: 삭제 후보는 source actor에서 모든 Class actor(질문 작성자, 질문 반응자, 답변 작성자, Lecture 설문 작성자), 모든 Course/Campaign owner·admin, 보존 DB 행 또는 `campaign-images` 밖의 Storage 객체가 참조하는 계정을 제외한 익명 participant 계정만이다. 즉 삭제 시점에 남는 DB·Storage에서 참조가 0개여야 한다. 어느 집합과도 겹침 여부가 불명확하면 보존한다.
- **PFDR-062**: 2026-09-01 점검값인 legacy participant 200명, Class와 중복 188명, legacy-only 12명은 참고치일 뿐이다. 삭제 직전에 봉인한 source actor 집합을 최신 Class/role 데이터와 다시 대조하며 숫자나 UUID를 코드에 고정하지 않는다.
- **PFDR-063**: 대상 계정은 Supabase Auth Admin API로 세션을 종료·회수한 뒤 삭제한다. service-role credential, token, 이메일, UUID를 로그나 저장소 evidence에 남기지 않는다.
- **PFDR-064**: 계정 삭제는 DB migration 성공을 rollback하지 않는다. 개별 실패는 미완료 대상으로 기록해 안전하게 재시도하고, 완료 전에는 전체 identity cleanup을 성공으로 표시하지 않는다.
- **PFDR-065**: 기존 JWT가 즉시 무효화된다고 가정하지 않는다. 세션 회수 결과를 확인하고 configured JWT 최대 수명이 지난 뒤 legacy token으로 제거된 API와 보존 Class 데이터에 접근할 수 없음을 재확인한다.

## 7. 검증과 추적성

- **PFDR-070**: `npm run supabase:start` 뒤 `npm run supabase:reset`으로 전체 historical migration과 새 retirement migration을 깨끗한 DB에 재생한다.
- **PFDR-071**: 기존 Campaign import regression test는 retirement regression test로 교체한다. 이 테스트는 legacy table·enum·function·Realtime·bucket 부재, lecture-only 설문 schema/RPC/policy, `source_path` 기반 Class import 데이터 보존을 검증한다.
- **PFDR-072**: old RPC 호출과 legacy table Data API 접근은 존재하지 않는 계약으로 실패해야 하며, `campaign-images` listing/bucket 조회도 부재해야 한다. 새 lecture 설문 제출과 owner 조회는 성공해야 한다.
- **PFDR-073**: 원격 적용 전후 보존 Class ID 집합과 행별 canonical checksum, `lecture-slides` 객체별 크기·SHA-256을 비교한다. 불일치가 하나라도 있으면 완료로 간주하지 않고 복구 절차를 시작한다.
- **PFDR-074**: Supabase security/performance advisor를 확인하고, `npm run lint`와 `npm run build`를 통과시킨다. 새 비자명 순수 로직이 생기면 가장 작은 Node test를 추가한다.
- **PFDR-075**: 브라우저에서 login redirect, Folder 열기, grid/list, Insights, 보존된 import Material 열기, panel collapse/resize, note save, filmstrip scrollbar, 키보드 슬라이드 이동, `/join/[code]`, 강의 종료 설문을 점검한다.
- **PFDR-076**: 최종 diff에 `ponytail-review`를 적용해 안전한 범위의 불필요한 호환 코드·중복을 제거한 뒤 영향받은 검사를 다시 실행한다.

| Requirement | 구현 표면 | 필수 증거 |
| --- | --- | --- |
| PFDR-020~026 | forward-only SQL migration, Class 설문 service | clean reset, retirement SQL regression, old/new RPC 결과 |
| PFDR-030~032, 050~054 | Storage API/CLI runbook, migration precondition | 객체 전후 inventory, bucket 부재, rollback 시험 |
| PFDR-010~016, 073 | 보존 DB/Storage 비교 도구 | ID 집합·canonical row checksum·객체 SHA-256 일치 |
| PFDR-040~045 | private backup와 sanitized evidence | restore 시험, manifest hash, 30일 expiry/purge 기록 |
| PFDR-060~065 | Auth Admin cleanup runbook | 동적 집합 재계산, session 회수, 익명 aggregate 완료 기록 |
| PFDR-070~076 | 테스트·브라우저 검증 | reset/lint/build/advisor/browser/ponytail-review 결과 |

## 8. 완료 기준

- **PFDR-080**: Supabase 정리는 원격 DB/API/Realtime/Storage 계약 부재, 보존 Class 불변성, 동적 legacy-only Auth 대상 처리, 모든 필수 검증 통과가 확인되면 완료다.
- **PFDR-081**: 검증된 off-platform backup이 30일 보존 중이어도 서비스 내 원본 폐기는 완료로 표시할 수 있다. 다만 최종 privacy closure는 만료 후 backup과 비공개 identity manifest를 폐기하고 그 증거를 남긴 시점이다.
- **PFDR-082**: backup 복구, 추가 종속 객체 삭제, 보존 Class 데이터 변경, 30일 연장 중 하나라도 필요하면 이 문서 범위를 자동 확대하지 않고 별도 승인으로 처리한다.

## 9. 운영 근거

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups): Database backup은 Storage 객체 metadata만 포함하고 실제 객체 바이트는 복원하지 않으므로 PFDR-042의 별도 복사가 필요하다.
- [Empty a bucket](https://supabase.com/docs/reference/javascript/storage-emptybucket), [Delete a bucket](https://supabase.com/docs/reference/javascript/storage-deletebucket): bucket 삭제 전에 객체를 비워야 하며 객체 삭제는 Storage API 경계를 사용한다.
- [Delete a user](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser): Auth 계정 삭제는 service-role이 필요한 서버 전용 작업으로 취급한다.
