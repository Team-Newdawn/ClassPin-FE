# 계정 구조 적용 지침 — FE·BE·DB·비공개 자료·종료 리포트

- Artifact: `account-structure-implementation`
- Status: `approved` — 2026-10-18 사용자 요청으로 계정 구조 적용 지침을 분리하고, owner 전용 종료 리포트 생성·저장과 editor/viewer 조회, 이미지 비공개 전환 설계를 반영했다. 기능 구현·운영 전환 완료를 뜻하지 않는다.
- Source: `docs/product/pin_class_prd.md`, 기존 `lecture-roles-and-remote`의 LRR-001~009, 2026-10-18 사용자 결정
- Depends on: `class-frontend-architecture`, `ohpin-figma-ui-redesign`
- 기준: FE `feature-dev@c9cf887`, BE `ClassPin-BE/origin/main@05eadd8`. BE 로컬 작업본은 이 기준에 포함하지 않는다.
- 범위: 폴더·파일의 역할·초대, 간단한 종료 리포트 저장, 비공개 이미지 접근, FE/BE 작업 및 적용 순서. 발표 리모컨은 [별도 명세](../product/lecture-roles-and-remote.md)를 따른다.

이 문서는 적용할 목표 계약이다. 현재 코드에는 역할·초대·저장 종료 리포트와 비공개 이미지 경로가 아직 없다. 상세 AI 강의자 리포트의 A/B·수정·확정·Cloud Tasks 파이프라인은 별도 `ai-report-*` 문서의 범위이며 여기에 가져오지 않는다. 아래 API와 데이터 구성은 이 목표를 구현하기 위한 설계이고 현재 배포 API 목록이 아니다.

## 1. 계정과 자료 역할

- `ACI-001` Google 로그인 계정의 기존 `profiles.role = admin`과 익명 참여자의 `participant`를 유지한다. `editor`·`viewer`를 계정 enum이나 Spring의 전역 로그인 역할로 추가하지 않는다. 최상위 관리자와 조직·요금제 권한은 이번 범위에 넣지 않는다.
- `ACI-002` 자료 역할은 `owner | editor | viewer | null`이다. 자기 폴더·파일을 만든 계정은 owner이며, 공유받은 계정에는 폴더 또는 파일(course/ClassSession) 단위 역할을 부여한다. 폴더 역할은 그 안의 파일에 상속하고 파일 역할과 겹치면 높은 역할을 적용한다. `pending`·`declined` 초대는 자료 접근 권한이 아니다.

| 동작 | owner | editor | viewer |
| --- | --- | --- | --- |
| 자료·슬라이드·질문·저장된 종료 리포트 조회 | O | O | O |
| 업로드, 슬라이드 추가·삭제, 노트 조회·편집, 준비 설정, 답변·해결 | O | O | ✕ |
| 강의 시작·종료, 실시간 페이지 진행, 리모컨 발급·재발급 | O | ✕ | ✕ |
| 종료 리포트 생성·실패 재시도 | O, 종료 후 | ✕ | ✕ |
| 폴더·파일 삭제, 초대·역할 변경·회수 | O | ✕ | ✕ |

- `ACI-003` **editor와 viewer는 종료 리포트를 보기만 한다.** 기존 LRR-003의 editor 리포트 생성 허용을 이 결정으로 대체한다. viewer 응답에서는 발표자 노트를 제외하고, 편집 UI를 렌더링하지 않는다. 파일 역할만 부여받은 계정이 그 파일을 담은 폴더의 다른 파일·썸네일·질문·통계를 보게 해서는 안 된다.
- `ACI-004` editor/viewer가 강의 관리·발표 창에서 직접 슬라이드를 넘기면 그 창의 로컬 상태만 바뀐다. owner만 서버 `current_page`를 쓴다. 발표 Web Lock과 이탈 60분 자동 종료의 타이머·Web Lock도 owner만 운영한다. owner가 발급한 리모컨을 통한 단일 기기 위임은 기존 계약을 유지한다.
- `ACI-005` 공유는 원본 접근 권한이며 복사가 아니다. editor 업로드의 소유권·Storage 경로·용량은 대상 폴더 owner 기준이고 작업자는 `created_by`로 기록한다. 권한 회수로 자료를 삭제하지 않는다. 파일 이동 시 파일 초대는 파일 ID를 따라가고, 폴더 상속은 이동한 위치에서 다시 계산한다. 소유자 변경은 구현하지 않고 기존 `(folder_id, owner_id)` 복합 FK를 유지한다.
- `ACI-006` 기존 명세가 editor 권한으로 지정하지 않은 폴더 이름·목적 변경과 파일 이동은 현재 owner 전용 동작을 유지한다. 파일 viewer에게 폴더 관리 권한을 주지 않는다. 이 범위를 확장할 때는 권한표를 먼저 수정한다.

## 2. 초대와 FE/BE 응답 계약

- `ACI-010` owner가 대상 폴더/파일, Google 이메일, `editor | viewer`로 초대한다. 메일은 발송하지 않는다. 이메일은 대소문자를 구분하지 않는다. 초대받은 사람이 해당 Google 계정으로 로그인해 승인/거절한다. 승인 전에는 폴더/파일 이름·초대자·역할만 표시하고 파일 본문·표지·질문·리포트를 조회하지 않는다.
- `ACI-011` 승인 시 BE가 검증한 Supabase Auth의 Google 이메일과 호출자 UUID를 사용한다. body의 `grantee_id`·소유자·이메일이나 수정 가능한 `user_metadata`로 본인 여부를 판정하지 않는다. 승인된 관계는 호출자 UUID에 연결한다. 만료 없는 초대, 취소·거절 후 재초대, owner의 권한 회수를 지원한다.
- `ACI-012` `access_grants`에는 `resource_type(folder|course)`, `resource_id`, `grantee_email`, 승인 시의 `grantee_id`, `role`, `status(pending|accepted|declined)`, `invited_by`, 생성·응답 시각을 둔다. 대상+소문자 이메일의 중복을 막고 대상 존재·소유권·대상 삭제 시 정리를 검증한다. 취소·회수는 해당 관계 삭제로 처리한다. RLS를 활성화하고 기본 사용자 권한을 회수한 뒤 본인 초대·owner 목록 조회와 검증된 RPC만 연다. 일반 사용자의 직접 쓰기·TRUNCATE나 다른 리소스의 초대 이메일 조회를 허용하지 않는다.
- `ACI-013` 파일 목록·상세·상태에는 `resource_role`, `access_status(accepted)`를, 초대 목록에는 별도 초대 DTO를 반환한다. `profiles.role`과 자료 역할의 이름을 구분한다. 파일만 공유된 폴더는 `resource_role: null`, `access_scope: shared-files`로 표시하고 승인된 파일만 제공한다. 폴더 역할은 `access_scope: folder`와 함께 반환한다. FE가 소유자 이메일 비교로 역할을 추정하거나 누락된 역할을 owner로 간주해서는 안 된다.

| BE API 계약 | 동작 |
| --- | --- |
| 기존 `GET /api/instructor/folders`, `/courses`, `/lectures/{id}/state` | 소유/승인된 공유 자료와 유효 역할 반환. pending 자료 내용은 포함하지 않음 |
| `GET/POST /api/instructor/{folders|courses}/{id}/invitations` | owner의 초대 조회·생성 |
| `PATCH/DELETE /api/instructor/invitations/{id}` | owner의 역할 변경·취소·회수. 대상의 실제 owner 재검증 |
| `GET /api/instructor/invitations` | 본인에게 온 pending 초대의 최소 메타데이터 |
| `POST /api/instructor/invitations/{id}/accept`, `/decline` | 본인의 초대만 승인·거절 |
| `POST /api/instructor/uploads` | §5의 자료별 업로드 범위 발급 |
| §4의 종료 리포트 API | 생성과 조회 분리 |

기존 instructor 라우트의 강사 인증을 유지하고, 각 요청에서 현재 자료 권한을 추가 검사한다. 목록의 권한·표지·개수는 DB에서 일괄 조회하며 항목마다 별도 권한 API를 호출하지 않는다. 인증 없음은 401, 알려진 작업의 권한 부족은 403, 접근할 수 없는 개별 자료는 내용 없는 404로 일관되게 처리한다.

## 3. DB·RPC의 권한 경계

- `ACI-020` `private.course_owned()`의 의미를 넓히지 않는다. `private.course_role()`과 폴더 판정을 추가해 읽기(owner/editor/viewer), 편집(owner/editor), 운영·삭제·공유(owner)를 구분한다. 관계 변경은 새 요청부터 판정에 반영하며 JWT에 역할 목록을 고정하지 않는다.
- `ACI-021` `courses`, `lectures`, `materials`, `material_versions`, `slides`, `region_anchors`, `questions`, `answers`의 정책을 동작별로 나눈다. `slide_instructor_notes`는 owner/editor만 조회·수정한다. 기존 참여자의 LIVE gate·본인 질문·공감 정책은 유지한다. 공유 viewer를 익명 참여자로 취급하지 않는다.
- `ACI-022` editor의 준비 설정에는 기존 표시 설정과 `show_question_labels`를 포함하지만 `status`·`current_page`는 owner만 바꾼다. **RLS의 행 UPDATE 허용만으로 editor의 컬럼 변경 범위를 제한할 수는 없다.** 현재 owner의 직접 쓰기 경계는 유지하고 editor 쓰기는 입력 필드를 검증하는 좁은 RPC를 통과시킨다. `ohpin_update_lecture_settings`와 BE PATCH가 같은 검증을 사용하며, 누락 필드는 유지하고 명시적 잘못된 null은 거절한다. FE의 직접 labels UPDATE도 이 역할 검증 경로에 통합한다.
- `ACI-023` RPC가 권한 판정을 위해 privileged 실행을 필요로 하면 내부 구현을 비공개 schema에 두고 호출자·대상·필드를 함수 안에서 검증한다. 기본 PUBLIC EXECUTE를 회수하고 필요한 진입점만 연다. 기존 Gateway의 사용자 JWT를 전역 service-role로 바꾸지 않는다.
- `ACI-024` 권한 회수 후 새 자료 접근을 차단하고 editor→viewer 하향 시 쓰기·노트 접근을 차단한다. FE는 다음 refresh/403/404에서 현재 역할에 맞게 자료·노트·편집 상태를 정리하고 401/403/404를 네트워크 실패용 localStorage 캐시로 복구하지 않는다. 로그아웃·계정 전환 시 자료·리포트·이미지 메모리 캐시도 정리한다. 이미 내려받은 사본을 원격으로 회수한다는 보장은 하지 않는다.

## 4. 종료 리포트: owner 생성·저장, editor/viewer 조회

### 4.1 사용자 흐름과 저장 범위

- `ACI-030` owner가 강의 종료를 저장한 뒤 명시적으로 종료 리포트를 생성한다. 기존 `종료하고 리포트 보기` 동작은 종료 성공 → 생성 요청 → 리포트 표시 순서로 연결한다. 종료 저장 실패 시 생성하지 않고, 생성 실패 시 강의를 LIVE로 되돌리지 않는다. 자동 종료는 강의만 종료하며 AI 생성을 실행하지 않는다.
- `ACI-031` 리포트 페이지 mount, GET, 언어 변경, editor/viewer 접근으로 생성 API를 호출하지 않는다. editor/viewer에게는 생성·재시도·수정 UI와 API 권한이 없다. 결과가 없으면 `아직 생성된 종료 리포트가 없어요`를 표시한다. 생성 중은 상태만, 실패는 안전한 안내만 표시하고 owner에게만 실패 재시도를 제공한다.
- `ACI-032` 서버가 생성 시점의 질문 수·공감 합계·페이지별 분포·최다 질문 페이지·자료 제목·폴더 목적과 AI 근거를 snapshot으로 저장한다. 현재 구현과 같은 **해당 자료 전체 누적 질문을 생성 기준 시각(snapshot_at)에 고정한 범위**이며, 회차별 참여/질문 데이터가 없는데 `이번 회차`라고 표시하지 않는다. 종료와 생성 사이에 바뀐 데이터를 과거 종료 시점 상태로 복원했다고 주장하지 않는다. 진행 시간은 신뢰할 수 있는 DB 시각이 있을 때만 계산하고, 브라우저 heartbeat 근사치를 출석 인원으로 저장하지 않는다.
- `ACI-033` 현재 간단한 리포트의 네 AI 섹션과 공감순 상위 200개 제한을 유지한다. 동률은 고정된 기준으로 정렬한다. 작성자 UUID·토큰·발표자 노트를 근거에 넣지 않고 질문을 모델 명령으로 취급하지 않는다. 질문이 없으면 지표 0·AI 근거 없음 상태를 저장하고 모델을 호출하지 않는다.
- `ACI-034` 지표·그래프·AI 본문·생성 언어를 함께 저장하고 조회 화면/PDF가 모두 이 저장본을 사용한다. 저장 후 원본 질문·슬라이드·폴더 목적이 바뀌어도 리포트 내용은 바뀌지 않는다. 다른 언어로 조회해도 AI를 다시 호출하지 않는다. viewer의 PDF 내보내기는 저장본을 읽는 동작으로 허용한다.

### 4.2 저장 모델과 API

`ACI-035` 간단한 종료 리포트용 `lecture_end_reports` 한 테이블을 사용한다. 주요 필드는 `id`, `lecture_id`, `course_id`, `run_key`, `started_at`, `ended_at`, `snapshot_at`, `locale`, `status(generating|ready|failed)`, `generated_by`, `input_snapshot`, `report_body`, `generated_at`, 안전한 `error_code`, 내부 attempt 식별자·lease 만료 시각이다.

- `(lecture_id, run_key)`를 유일하게 해 중복 생성 비용을 막는다. `run_key`는 DB `started_at`으로 결정하고, 과거 시작 시각이 없는 자료는 고정 `legacy` 값을 쓴다. 클라이언트 시각이나 요청마다 새 UUID로 실행을 식별하지 않는다. 과거 시각을 지어내지 않는다.
- LIVE 재시작 후 다시 종료하면 새 키로 저장하고 이전 ready 결과를 유지한다. 이미 ready인 같은 실행의 재요청은 저장본을 반환한다. 성공본 수정·임의 재생성·revision 기능은 이번 범위에 넣지 않는다. 실패한 실행만 owner가 재시도한다.
- 현재 자료의 `course_role`로 읽기를 검사한다. 생성 당시 공유 대상 목록으로 고정하지 않는다. 자료 삭제 시 리포트도 정리하며, 미승인·회수된 사용자·익명 참여자는 결과를 읽지 못한다.
- 원본 테이블에서 일반 사용자의 기본 권한을 전부 회수한 뒤 공개 조회에 필요한 컬럼에만 SELECT를 부여한다. INSERT/UPDATE/DELETE/TRUNCATE를 열지 않는다. `security_invoker=true`인 `lecture_end_report_reads` view가 그 컬럼만 조회하며 원본 테이블의 역할별 RLS를 유지한다. 내부 snapshot·attempt/lease는 view와 응답에서 제외한다.

| 요청 | 권한·결과 |
| --- | --- |
| `GET /api/instructor/lectures/{id}/end-report` | owner/editor/viewer. `{report: 저장된 최신 ready 결과 또는 null, generation: 현재 실행 상태 또는 null}` 반환. 생성/변경 부작용 없음 |
| `POST /api/instructor/lectures/{id}/end-report` | owner + 현재 ended. 입력은 `locale`만. 생성 snapshot·owner·지표는 서버가 결정 |

POST는 새 생성 성공 201, 기존 ready 반환 200, 이미 생성 중 202, 종료되지 않은 강의 409로 구분한다. 공급자 미설정/실패는 503/502와 failed 상태를 기록하고 다음 GET으로 확인할 수 있게 한다. GET은 해당 실행의 저장된 최신 결과를 우선하고, 강의 재시작 등으로 현재 실행 결과가 없으면 직전 저장 결과를 그 종료 시각과 함께 반환한다. 레거시 메모리 요약을 저장본으로 가장하지 않는다.

### 4.3 BE 생성 책임과 중복·실패 처리

- `ACI-036` BE가 권한 판정·snapshot·Groq 생성·저장을 소유한다. FE Next의 기존 report 모드 프롬프트/JSON 검증을 BE로 이관해 단일 구현으로 두고, 기존 `/api/question-summary`의 report 모드가 editor/viewer의 우회 생성 경로로 남지 않게 제거한다. cluster 요약의 기존 동작과는 분리한다. 브라우저의 `items`를 저장 리포트 근거로 신뢰하지 않는다.
- `ACI-037` 짧은 DB transaction에서 owner·종료 상태 확인 → snapshot 고정 → generating 행과 attempt/lease 확보를 수행한다. DB 잠금을 잡은 채 AI를 호출하지 않는다. 현재 30초 AI timeout을 유지하며 이 작업에 별도 queue/worker 인프라를 추가하지 않는다.
- `ACI-038` 생성 중 재요청은 새 AI 호출을 시작하지 않는다. 프로세스 종료로 남은 generating은 만료된 lease를 owner가 재시도할 때 회수한다. 실패 재시도도 같은 snapshot을 사용한다. 완료는 자신의 attempt가 여전히 유효할 때만 저장해 오래된 응답이 새 결과를 덮지 못하게 한다. 강의가 다시 시작돼도 이미 고정한 종료 snapshot은 유지한다. 대상 삭제·소유권 불일치 시 결과 저장을 중단한다.
- `ACI-039` BE 전용 `GROQ_API_KEY`와 리포트 저장 전용 서버 경계를 배포에 추가한다. 저장 RPC는 server/`service_role`에만 EXECUTE를 부여하고 PUBLIC/anon/authenticated는 회수한다. 실제 호출자 UUID는 BE의 검증된 Caller에서 전달하고 DB에서도 소유자·snapshot 대상·attempt를 다시 검증한다. 서버 secret은 이 리포트 저장 Repository에만 사용하며 사용자 조회, 이미지/PDF, 다른 업무 Gateway에 적용하지 않는다. 조회는 항상 원래 호출자의 JWT를 사용한다. provider 원문 오류와 내부 lease는 클라이언트에 반환하지 않는다.

## 5. 이미지 슬라이드 비공개 전환

### 5.1 읽기 구조

- `ACI-040` 기존 `lecture-slides` 버킷을 **같은 객체 경로를 유지한 채 private으로 전환**한다. `course-materials`는 기존 private을 유지한다. 버킷 복제·전체 파일 재업로드를 기본 방안으로 삼지 않는다. `getPublicUrl`, BE `publicSlideUrl`, 오래된 `imageUrl` 캐시를 인증된 읽기에 사용하지 않는다.
- `ACI-041` 이미지 조회는 `GET /api/slide-image?path={image_path}`로 통일한다. 브라우저가 해당 화면의 instructor/audience JWT를 Authorization 헤더에 담아 fetch하고 Blob URL로 표시한다. 일반 `<img>`나 Next Image에 bearer token을 URL로 붙이지 않는다. 경로에 허용된 UUID·확장자·세그먼트만 받고 외부 URL·임의 bucket·경로 이동은 거절한다. MIME·크기는 기존 이미지 형식/버킷 제한으로 검증한다.
- `ACI-042` 기존 PDF의 JWT 구성·서버 디스크 캐시·동시 다운로드 병합을 재사용한다. 매 요청 **사용자 JWT로 Storage 메타데이터/RLS를 확인한 다음** 캐시 바이트를 반환한다. 캐시가 있어도 생략하지 않는다. 응답은 `Cache-Control: no-store`, `Vary: Authorization`을 사용한다. 이 경로에는 서비스 키·서명 URL·공개 URL fallback을 두지 않는다. PDF의 Range·작은 파일 최적화는 유지한다.
- `ACI-043` `storage.objects`의 SELECT는 객체의 `slides → material_versions → materials → course/lecture` 관계로 owner/승인된 editor/viewer 또는 기존 LIVE 익명 참여자를 판정한다. owner/editor/viewer는 종료 후에도 자료를 읽고, 참여자는 기존 LIVE gate를 따른다. 로그인 없는 발표 창과 `/join`은 기존 audience 세션 경계를 유지한다. `/remote`에 원본 파일 접근 권한을 추가하지 않는다.
- `ACI-044` 폴더 표지, grid/list 썸네일, 준비 화면, 플레이어, 발표 창, 참여 화면, 필름스트립·PIN 팝업 등 이미지 소비자를 모두 전환한다. 공유 이미지 로딩 코드를 재사용하고 화면별 fetch 구현을 복제하지 않는다. 기존 지연 로딩과 가시 영역 우선 로딩을 유지하고, 요청 병합은 같은 URL·인증 세션 안에서만 한다. 토큰을 로그·URL·localStorage 캐시 키에 남기지 않는다.
- `ACI-045` Blob URL은 교체·해제·로그아웃·계정 전환·접근 회수 때 정리한다. 새 조회와 역할 refresh는 현재 권한을 확인한다. 이미 받은 이미지, 열린 문서, 다운로드·출력한 사본은 회수할 수 없다. 서버가 다음 요청을 차단하는 범위와 기기에 남은 사본을 구분한다.

### 5.2 editor 업로드 범위

- `ACI-046` 메타데이터 생성 전에는 Storage에 자료 관계가 없으므로 owner 접두사만으로 editor 업로드를 허용하지 않는다. BE가 `POST /api/instructor/uploads`에서 대상 폴더 또는 기존 자료, 확장자, 현재 편집 권한을 확인하고 짧게 유지되는 `material_uploads` 범위를 만든다. 최소 필드는 upload ID, 실제 owner, actor, 대상 폴더/자료, 허용 형식, 만료·사용 완료 시각이다. 이 테이블도 RLS와 명시적 권한을 적용하고 발급·확정은 검증된 BE/RPC에서만 수행한다. 기본 유효 기간은 기존 대용량 재개 업로드를 수용하는 24시간으로 두고, 만료 후에는 같은 범위를 무제한 연장하지 않는다.
- 서버가 확정한 `{owner}/{uploadId}/source.{pdf|ppt|pptx}`, `{owner}/{uploadId}/{slideId}.{jpg|jpeg|png|webp}` 형식을 유지한다. 현재 PDF 경로 검증식도 유지할 수 있다. 미분류 신규 업로드의 owner는 actor 자신이다. 다른 사용자 UUID를 body에 넣어 소유자를 지정할 수 없다.
- Storage INSERT/UPDATE/SELECT/실패 정리는 해당 actor·범위·현재 편집 권한으로 제한한다. 만료·회수 후 새 접근과 metadata 확정을 거절하고 진행 중 TUS 요청도 중단한다. 이미 접수된 전송의 즉시 중단을 RLS만으로 보장한다고 가정하지 않으며, 남은 바이트는 등록 전 임시 자료로 정리한다.
- 변환·자료 확정 시 owner/actor·현재 역할·경로·범위를 다시 검사한다. `ohpin_create_material`, 슬라이드 append와 실패 정리도 같은 소유권을 사용한다. `courses`·`materials`에 `created_by`를 두고 기존 `owner_id`·복합 FK를 유지한다. editor가 슬라이드를 지워도 실제 owner 경로의 정리 작업이 누락되지 않게 cleanup trigger/서비스를 수정한다. 다른 자료가 참조하는 객체는 삭제하지 않는다.

## 6. 저장소별 수정 위치

### FE — feature-dev

| 위치 | 구현할 내용 |
| --- | --- |
| `app/_model/types.ts`, `_service/class-session-service.ts` | 자료 역할·초대·저장 리포트 DTO, 역할 포함 목록/상태 매핑, 이미지 path 기반 모델, 설정 쓰기 통합 |
| `_controller/session-store.tsx` | 공유 자료·초대 상태, 권한 변경 반영, 인증 실패 시 실패 캐시 복원 금지, 계정별 캐시 정리 |
| `(view)/admin/dashboard`, `folders/[id]` | 공유/대기 카드·역할 배지·승인/거절, owner 공유 메뉴, 승인 전 표지 로딩 금지 |
| `(view)/admin/session/[id]`, `present/controller.ts`, `_controller/use-live-auto-end.ts` | 역할별 UI·키보드/자동 저장 차단, 로컬 페이지 이동, owner만 발표/이탈 Web Lock·타이머 사용 |
| `_service/convert.ts`, `_controller/use-slide-upload.ts`, `component/material-upload-dialog.tsx` | 업로드 범위 발급 후 TUS/변환/생성에 동일한 owner·upload ID 전달 |
| `component/slide-canvas.tsx` 및 이미지 썸네일, 신규 `/api/slide-image` | JWT fetch/Blob 표시·정리, 이미지 권한 재검사. 기존 `/api/pdf` 성능·RLS 유지 |
| `component/session-end-report.tsx`, `_service/question-summary-service.ts`, `/api/question-summary` | mount 생성 제거, 저장본 GET, owner의 명시적 POST·실패 재시도, report 모드 우회 제거, 저장 지표/PDF 사용 |

### BE — ClassPin-BE/main

| 위치 | 구현할 내용 |
| --- | --- |
| `shared/security/Caller`, `SupabaseAuthenticationFilter` | Google 본인 이메일 근거 전달. 로그인 역할은 유지하고 자료 역할은 요청마다 판정 |
| `folder/*`, `lecture/*` | owner 고정 목록 필터를 공유 조회로 변경, 최소 초대 메타데이터·role 반환, owner 전용 작업 유지 |
| `material/*`, `question/*` | owner/editor 편집, viewer 노트 미조회·쓰기 거절, 역할별 자료 조회 |
| `SourcePath`, `ConversionService`, `MaterialService`, `StorageCleanupService` | actor=owner 가정 제거, 발급된 업로드 범위·실제 owner 검증, 공개 image URL 반환 제거 |
| 신규 초대 API/Repository | owner 초대 관리, 검증된 본인 승인·거절, 일괄 유효 역할 조회 |
| 신규 종료 리포트 API/Service/Repository | 종료 후 owner 생성, DB snapshot·중복 억제·Groq·서버 전용 저장, caller JWT 조회 |
| `supabase/migrations`, tests, 서버 배포 환경 | grants·역할별 RLS/RPC·업로드 범위·리포트·private 전환, 서버 전용 AI/저장 credential 주입 |

BE 저장소는 이 FE 작업에서 직접 수정하지 않는다. 이 지침을 BE 인계 계약으로 사용한다. API 추가·변경은 구현한 main 및 배포 OpenAPI에 반영하고 FE는 해당 응답 계약과 맞춘다.

## 7. 적용 순서와 전환 조건

1. **기준 확인:** 실제 운영 schema·정책·Storage 객체 수/크기·마이그레이션 이력을 읽기 전용으로 대조한다. BE/main에는 FE의 리모컨·`show_question_labels` 마이그레이션이 없고 FE에는 BE lifecycle migration이 없다. 어느 저장소든 처음부터 운영에 재생하지 않는다. 공유 DB 변경의 배포 원본과 이력을 한 번만 기록한다.
2. **DB·BE 먼저:** 역할/초대·업로드 범위·리포트 저장을 additive migration으로 넣고 owner 기존 동작을 유지한다. caller JWT 읽기·직접 API 거절·서버 전용 쓰기를 검증한다. 신규 생성 리포트만 저장하며 과거 메모리 응답을 복원했다고 표시하지 않는다.
3. **인증된 이미지 경로와 FE 배포:** 버킷을 아직 public으로 둔 상태에서 owner/LIVE 참여자의 인증 읽기 정책·이미지 proxy를 준비하고 모든 FE/BE 이미지 경로를 전환한다. 구형 URL 캐시를 폐기한다. 역할 UI/저장 리포트는 새 BE 계약에 연결하며 미지원 서버에서 권한을 owner로 추측하지 않는다.
4. **private 전환:** 승인된 운영 작업 시간에 구형 클라이언트 종료/새로고침을 안내하고 새 migration으로 `lecture-slides.public=false`를 적용한다. 객체 경로·내용은 유지한다. LIVE 강의가 있거나 인증 이미지 검증이 실패하면 전환을 중단한다.
5. **이전 공개 경로 검증:** 알려진 기존 `/object/public/lecture-slides/...` 및 공개 이미지 변환 URL을 무인증·새 브라우저·기존 CDN 캐시 조건에서 검사한다. bucket flag 변경만으로 모든 edge/브라우저의 과거 사본이 즉시 사라진다고 주장하지 않는다. 현 플랜의 캐시 전파를 확인하고 기존 공개 요청 차단이 확인돼야 완료 처리한다.
6. **장애 대응:** 준비 단계 실패는 기존 배포를 유지한다. private 전환 후에는 인증 경로가 있는 직전 FE/BE로만 되돌리고 버킷을 자동으로 public으로 재개방하지 않는다. 정합성 문제 시 해당 기능을 중단하고 수정한다. 데이터·Auth UUID·Storage 객체 삭제나 전체 DB reset을 롤백으로 사용하지 않는다.

## 8. 구현 완료 검증

| 검증 | 통과 기준 |
| --- | --- |
| 역할/상속 | owner/editor/viewer와 미승인·거절·회수 계정을 분리. 폴더/파일 중 높은 역할, 파일만 공유된 폴더의 다른 자료 차단 |
| 위조·직접 호출 | 다른 사람 초대 승인, owner/actor 위조, 다른 경로 업로드, viewer 쓰기, editor status/current_page 변경을 BE와 직접 Supabase 호출 모두에서 거절 |
| 노트/라이브 | viewer/참여자 payload에 노트 없음. 비소유자의 이동·키보드·자동 넘김·Web Lock·이탈로 owner/참여자 진행이 바뀌지 않음 |
| 리포트 | owner 종료 후 생성·저장, GET/조회자/언어 변경에 AI 호출 0회. editor/viewer 생성·재시도 거절. 새로고침·재로그인·다른 기기에서 같은 저장본 표시 |
| 리포트 실패/중복 | 종료 실패 시 생성 안 함. 생성 실패에도 ended 유지. 동시 POST 한 번만 실행, timeout/lease 회수, 늦은 완료 차단, 재시작 시 이전 보고서 보존 |
| 이미지 | PDF/PPT/PPTX, 표지·목록·플레이어·발표·참여 화면 모두 표시. RLS 거절은 서버 캐시가 따뜻해도 차단. 종료된 참여자·회수 사용자·무인증 공개 URL의 새 요청 거절 |
| 업로드/정리 | 1 GiB/TUS 계약 유지, editor 업로드가 owner 소유로 저장. 권한 회수·변환 실패·슬라이드 삭제 후 임시/미참조 파일 정리, 참조 파일 보존 |
| 회귀/성능 | 로그인 redirect, 폴더 grid/list, 패널·노트·스크롤바·키보드·리모컨 유지. 이미지 지연 로딩·동시 요청 병합·PDF 성능 및 권한 조회 N+1 부재 확인 |

기능 구현 때 FE lint/build·관련 Node 테스트, BE 테스트/빌드, 추가 migration의 로컬 replay와 SQL 권한 테스트를 실행한다. 운영 강의/실제 기기 확인은 별도 승인된 시간에 자동 중단 조건과 함께 실행한다. 문서 작성만으로 이 검증이 완료됐다고 표시하지 않는다.

## 9. 관련 문서와 근거

- 기존 LRR-001~009의 역할·초대·소유권 결정은 이 문서 §1~3으로 옮겼다. 리포트 생성 권한은 ACI-003·030~039가 우선한다.
- [발표 리모컨 명세](../product/lecture-roles-and-remote.md), [간단한 종료 리포트 UI](../design/ohpin-figma-ui-redesign.md#38-간단한-종료-리포트), [프런트엔드 경계](class-frontend-architecture.md).
- [Supabase private/public 버킷](https://supabase.com/docs/guides/storage/buckets/fundamentals), [JWT 다운로드와 서명 URL](https://supabase.com/docs/guides/storage/serving/downloads), [TUS 재개 업로드](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [Smart CDN·과거 캐시](https://supabase.com/docs/guides/storage/cdn/smart-cdn), [서버 전용 API key](https://supabase.com/docs/guides/getting-started/api-keys). 2026-10-18 확인. 서명 URL은 현재 권한 회수를 매 요청 반영하는 경로로 사용하지 않는다.
