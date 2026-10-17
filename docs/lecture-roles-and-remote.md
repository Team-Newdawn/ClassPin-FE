# 강의 역할(owner·editor·viewer)과 발표 리모컨 명세

- Artifact: `lecture-roles-and-remote`
- Status: `approved` — 2장 발표 리모컨(LRR-020~025)은 2026-10-16 세션에서 승인·구현했다. 1·3·4장 역할·초대는 2단계 착수 전에 다시 승인받는다.
- Source: `doc/pin_class_prd.md`, `AGENTS.md`
- Depends on: `class-frontend-architecture`, `ohpin-figma-ui-redesign`
- Decision boundary: 폴더·파일 단위 초대 역할과 권한, 플랫폼 내 초대 승인, 실시간 슬라이드 진행 권한, 로그인 없는 단일 기기 발표 리모컨, 역할 판정의 서버 강제 위치와 BE 인계 범위

관리자(폴더 소유자), 강의자, 발표자가 서로 다른 사람일 수 있다는 전제에서 누가 무엇을 보고 바꿀 수 있는지를 정한다. 구현은 두 단계다. 1단계 리모컨은 owner만 발급하므로 역할 기능 없이 FE 마이그레이션만으로 먼저 낸다. 2단계 역할·초대는 BE 소유 경계(Java 소유자 필터, 강의 RPC, Storage 정책)를 바꾸므로 4장의 인계를 BE가 배포한 뒤 FE를 붙인다.

## 1. 역할과 권한

- `LRR-001` Google로 로그인한 계정은 자기가 만든 폴더·파일의 owner다(기존 `profiles.role = admin` 유지). 최상위 관리자(itisnewdawn@gmail.com)는 할 일이 정해질 때까지 만들지 않는다.
- `LRR-002` editor·viewer는 계정 종류가 아니라 리소스와의 관계다. owner가 폴더 또는 파일(코드의 course/ClassSession) 단위로 부여한다. 폴더에 부여한 역할은 그 폴더의 모든 파일에 적용되고, 같은 파일에 파일 역할과 폴더 역할이 함께 있으면 높은 쪽(editor > viewer)을 쓴다. 폴더 viewer와 파일 viewer는 같은 역할이다.
- `LRR-003` 권한표.

| 동작 | owner | editor | viewer |
| --- | --- | --- | --- |
| 폴더·파일·슬라이드·질문 보기, 생성된 종료 리포트 보기 | O | O | O |
| 강의 관리 페이지에서 슬라이드 이동 → 발표 화면·참여자에 반영 | O | ✕ (그 창만 이동) | ✕ (그 창만 이동) |
| 강의 시작·종료 | O | ✕ | ✕ |
| 리모컨 발급·재발급 | O | ✕ | ✕ |
| 업로드, 슬라이드 추가·삭제, 노트 편집, 강의 준비 설정, 답변·해결, 리포트 생성 | O | O | ✕ |
| 발표자 노트 보기 | O | O | ✕ |
| 폴더·파일 삭제, 초대·역할 회수 | O | ✕ | ✕ |

- `LRR-004` 강의 시작·종료, 실시간 슬라이드 진행, 리모컨 발급, 삭제, 초대는 owner 고유 권한이다. editor·viewer의 강의 관리 페이지와 이들이 연 발표 화면은 기존 따라가기 창처럼 동작한다. 직접 넘기면 그 창에서만 바뀌고 '발표자 화면으로 돌아가기'로 복귀한다(`present/controller.ts`의 `localSlide` 재사용). 플레이어 이탈 60분 자동 종료(`use-live-auto-end.ts`)는 owner 탭에서만 돈다. 시작·종료 버튼과 종료 확인 대화상자는 owner에게만 보이고 LIVE 표시는 모두에게 보인다.
- `LRR-005` viewer는 강의 관리 페이지에서 결과(질문, 생성된 종료 리포트)만 본다. 쓰기 컨트롤은 렌더링하지 않고, 발표자 노트는 응답에서 빠진다(DB에서 제외, 화면 숨김으로 대신하지 않는다).
- `LRR-006` editor가 올린 파일도 권한상 owner는 폴더 owner다. Storage 경로·용량은 owner 기준이고 업로더는 `created_by`로 기록만 한다. editor 역할이 회수되어도 파일과 데이터는 그대로 남는다.
- `LRR-007` 공유는 복사가 아니다. 초대받은 사람의 대시보드에는 원본 폴더가 같은 ID로 역할 배지와 함께 보이고, 원본 변경이 그대로 보인다. 파일만 초대받으면 원본 폴더가 초대된 파일만 담은 상태로 보이며, owner가 파일을 다른 폴더로 옮기면 따라간다.
- `LRR-008` 초대 흐름. 메일은 보내지 않는다.
  - owner가 폴더·파일의 공유 메뉴에서 Google 이메일과 역할을 입력하면 `pending` 초대가 생긴다. owner는 같은 메뉴에서 초대·역할 목록을 보고 취소·회수한다.
  - 초대받은 사람이 그 이메일의 Google 계정으로 로그인하면 대시보드에 대기 중 폴더 카드가 보인다. 카드를 열면 폴더 페이지 상단에 승인/거절이 뜨고, 승인 전에는 폴더 이름·초대자·역할만 보이고 파일과 데이터는 보이지 않는다.
  - 매칭은 Supabase Auth의 Google 인증 이메일(대소문자 무시)로만 한다. 다른 계정으로 로그인하면 초대가 보이지 않는다.
  - 초대에는 만료가 없다. 거절·취소 뒤 재초대할 수 있고, 회수하면 다음 요청부터 권한이 사라진다.
- `LRR-009` 모든 역할 판정은 DB(RLS·RPC)와 BE에서 강제한다. 화면 숨김은 보조 수단이다.

## 2. 발표 리모컨 (1단계)

- `LRR-020` owner가 강의 관리 페이지 상단의 리모컨 버튼으로 연 대화상자에서 발급한다. 대화상자에는 QR, 링크 복사, 연결 상태(대기/연결됨), 발급·재발급이 있고, 연결 상태는 열려 있는 동안 5초마다 조회한다. 링크는 `/remote#{token}`이다. 토큰은 서버 로그와 Referer에 남지 않도록 fragment에 둔다. 토큰 원문은 발급한 대화상자의 메모리에만 있으므로, 닫은 뒤 다시 보려면 재발급해야 한다. 프로젝터에 비치는 발표 화면에는 표시하지 않는다. 재발급하면 이전 링크와 연결된 기기가 모두 끊긴다. 데모 모드(Supabase 없음)에서는 버튼을 숨긴다.
- `LRR-021` 리모컨에는 로그인이 없다. 링크를 연 브라우저는 참여자와 같은 익명 Supabase 세션으로 리모컨을 차지한다. 이미 다른 익명 사용자가 차지했으면 '다른 기기에서 사용 중' 화면만 보인다. 같은 브라우저로 다시 열면 같은 세션이라 계속 쓸 수 있다. 링크가 발표자보다 먼저 다른 사람에게 열리면 owner가 연결 상태를 보고 재발급한다.
- `LRR-022` 리모컨 화면은 이전/다음 버튼, `N / 전체`, 상태 안내(연결됨, 다른 기기에서 사용 중, 강의 시작 전, 종료됨)만 둔다. 노트, 질문, 시작·종료, 자동 넘김은 넣지 않는다. 화면 데이터는 RPC 응답(현재 페이지, 슬라이드 수, 상태, 제목)뿐이라 노트가 오가지 않는다. 버튼 한 번은 한 장(-1/+1)이고 서버가 현재 페이지에서 계산하므로, 리모컨 표시가 늦어도 엉뚱한 페이지로 건너뛰지 않는다. 화면이 보이는 동안 5초마다, 다시 보일 때 즉시 상태를 맞춘다. 이동은 RPC가 토큰 해시, 차지 기기, LIVE, 페이지 범위를 확인한 뒤 `current_page`만 바꾸고, 발표 화면과 참여자는 기존 `lectures` UPDATE 구독으로 따라간다. owner의 관리 페이지·발표 화면 자동 넘김과 동시에 조작하면 마지막 저장이 이긴다. 각 버튼의 접근 가능한 이름, 포커스 표시, 44px 이상의 터치 영역을 갖춘다.
- `LRR-023` 강의가 LIVE를 벗어나면 리모컨이 해제된다. `lectures.status`가 `live`에서 다른 값으로 바뀌는 UPDATE 트리거가 리모컨 행을 지우므로 수동 종료, 자동 종료, BE 종료 API 모두에 적용된다. 시작 전에 발급한 리모컨은 시작 전 대기 화면을 보이다가 시작 후 그대로 쓴다.
- `LRR-024` 데이터. 직접 쓰기 경로는 열지 않는다. 구현은 FE forward-only 마이그레이션 `supabase/migrations/20261016090000_add_lecture_remote.sql`이다. `lecture_remotes`(강의당 1행, `token_hash = sha256(token)`, `holder_id`) 테이블에는 owner select 정책만 둔다. security definer RPC는 `ohpin_issue_lecture_remote(lecture_id)`(owner 확인 → 새 토큰 → 차지 초기화)와 `ohpin_remote_control(token, step -1|0|1)`(처음 호출한 익명 세션이 차지하고 이동하지 않는다. 다른 세션이면 `remote_in_use`, 토큰이 없으면 `remote_revoked`) 두 개다. 강의 상태가 `live`에서 다른 값으로 바뀌면 트리거가 리모컨 행을 지운다. CFA-097A처럼 Supabase 세션으로 직접 호출한다. 프로덕션 적용은 사용자 승인 후에 한다.

- `LRR-025` 1단계 검증: 로컬 `npm run supabase:reset` 뒤 pgTAP `supabase/tests/lecture_remote.sql`로 발급 → 차지 → 다른 사용자 거절 → 범위 밖 거절 → 재발급 시 이전 토큰 거절 → LIVE 이탈 시 삭제를 확인한다. lint/build를 통과하고, 로컬에서 owner 관리 페이지 발급 → 다른 브라우저 리모컨 조작 → 발표 화면·참여자 페이지가 따라가는지 → 세 번째 브라우저가 거절되는지를 확인한다. 프로덕션 확인은 강의가 없는 시간에 사용자 승인을 받아 한다.

## 3. 2단계 FE 작업 경계

| 요구사항 | 예상 코드 경계 |
| --- | --- |
| LRR-007, LRR-008 | 대시보드의 공유·대기 폴더 카드, 폴더 페이지의 승인/거절과 owner 공유 메뉴, `session-store`의 역할 필드 |
| LRR-003 ~ LRR-005 | `admin/session/[id]` 역할별 컨트롤 렌더링과 `localSlide`, `present/controller.ts`의 `canControl` owner 조건, `use-live-auto-end` owner 조건 |
| LRR-009 | 역할은 BE DTO에서만 받는다. FE에서 이메일·소유자를 비교해 권한을 추정하지 않는다 |

## 4. BE 인계 (2단계 선행 조건)

- `access_grants(id, resource_type folder|course, resource_id, grantee_email, grantee_id null, role editor|viewer, status pending|accepted|declined, invited_by, created_at, responded_at)`. `unique(resource_type, resource_id, lower(grantee_email))`.
- `private.course_role(course_id)`는 `owner | editor | viewer | null`을 돌려준다. 판정 기준은 `owner_id = auth.uid()`, 그리고 이 파일 또는 상위 폴더에 대한 `accepted` 부여 중 높은 역할이다. 기존 `private.course_owned()` 사용처를 동작별로 바꾼다. 읽기는 모든 역할, 내용 변경은 owner·editor, 삭제·초대는 owner만 허용한다.
- `ohpin_update_lecture_settings`는 `status`·`current_page` 변경을 owner에게만 허용하고, 나머지 설정은 editor도 바꿀 수 있게 한다. 시작·종료 lifecycle API도 owner 확인을 유지한다.
- 발표자 노트 컬럼은 owner·editor만 읽는다. 질문·리포트 읽기는 모든 역할, 답변·해결·리포트 생성은 owner·editor다. `questions` Realtime과 `/api/pdf` 읽기는 RLS를 따르므로 역할 보유자도 허용되어야 한다.
- Storage: editor 업로드도 owner 경로(`{owner uid}/...`)에 쓰도록 업로드·`/api/convert` 경로 규칙과 정책을 바꾼다. courses·materials에는 `created_by`를 추가한다.
- Java: `SupabaseLectureRepository`·`SupabaseFolderRepository`의 `owner_id=eq.{호출자}` 필터를 역할 판정으로 바꾼다. 폴더 목록은 소유 폴더, 승인한 공유 폴더, 대기 중 초대를 `role`·`status`와 함께 돌려준다. 새 API는 초대(owner), 공유 목록·취소·회수(owner), 승인·거절(초대받은 사람, 인증 이메일 일치)이다.

## 5. 비목표

초대 메일 발송, 최상위 관리자 권한, 리모컨 로그인, 리모컨의 노트·질문·시작·종료, 리모컨 여러 대 동시 사용, 업로더 전용 추가 권한, editor의 실시간 진행 권한은 이번 범위에서 제외한다.
