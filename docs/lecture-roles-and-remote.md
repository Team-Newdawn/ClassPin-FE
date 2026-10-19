# 발표 리모컨 명세

- Artifact: `lecture-roles-and-remote` — 기존 문서 ID와 경로는 리모컨 참조 호환을 위해 유지한다.
- Status: `approved` — LRR-020~027의 owner 전용 발급·단일 기기 조작을 유지한다.
- Source: `doc/pin_class_prd.md`, `AGENTS.md`
- Depends on: `class-frontend-architecture`, `ohpin-figma-ui-redesign`, `account-structure-implementation`
- Decision boundary: 로그인 없는 단일 기기 발표 리모컨의 발급·연결·표시 설정·질문 목록·해제·검증

계정 역할·초대(LRR-001~009), 저장 종료 리포트, 이미지 비공개 전환과 FE/BE 인계는 [계정 구조 적용 지침](account-structure-implementation.md)으로 분리했다. 이 문서는 발표 리모컨만 소유한다. 리모컨 발급은 owner 고유 권한이며 editor/viewer에게 발급 권한을 주지 않는다.

## 1. 발표 리모컨

- `LRR-020` owner가 강의 관리 페이지 상단의 리모컨 버튼으로 연 대화상자에서 발급한다. 대화상자에는 QR, 링크 복사, 연결 상태(대기/연결됨), 발급·재발급이 있고, 연결 상태는 열려 있는 동안 5초마다 조회한다. 링크는 `/remote#{token}`이다. 토큰은 서버 로그와 Referer에 남지 않도록 fragment에 둔다. 토큰 원문은 발급한 대화상자의 메모리에만 있으므로, 닫은 뒤 다시 보려면 재발급해야 한다. 프로젝터에 비치는 발표 화면에는 표시하지 않는다. 재발급하면 이전 링크와 연결된 기기가 모두 끊긴다. 데모 모드(Supabase 없음)에서는 버튼을 숨긴다.
- `LRR-021` 리모컨에는 로그인이 없다. 링크를 연 브라우저는 참여자와 같은 익명 Supabase 세션으로 리모컨을 차지한다. 이미 다른 익명 사용자가 차지했으면 '다른 기기에서 사용 중' 화면만 보인다. 같은 브라우저로 다시 열면 같은 세션이라 계속 쓸 수 있다. 링크가 발표자보다 먼저 다른 사람에게 열리면 owner가 연결 상태를 보고 재발급한다.
- `LRR-022` `/remote`는 이전/다음, `N / 전체`, 연결 상태와 함께 질문 표시 ON/OFF·`PIN만 / PIN+질문`, QR ON/OFF·네 모서리 위치 선택, 강의 전체 질문 개수·목록 버튼을 제공한다(2026-10-17 사용자 요청 및 대상 경로 정정). 노트, 시작·종료, 자동 넘김은 넣지 않는다. 한 번에 한 장(-1/+1)씩 서버가 이동하며 표시 설정도 기존 `lectures` UPDATE로 발표 화면에 반영한다. 보이는 동안 5초마다, 다시 보일 때 즉시 동기화한다. 표시 설정·이동은 LIVE에서만 가능하고 질문 표시 OFF이면 PIN 모드를, QR OFF이면 위치를 비활성화하며 기존 선택은 유지한다. 버튼에는 접근 가능한 이름·포커스 표시·44px 이상의 터치 영역을 둔다.
- `LRR-023` 강의가 LIVE를 벗어나면 리모컨이 해제된다. `lectures.status`가 `live`에서 다른 값으로 바뀌는 UPDATE 트리거가 리모컨 행을 지우므로 수동 종료, 자동 종료, BE 종료 API 모두에 적용된다. 시작 전에 발급한 리모컨은 시작 전 대기 화면을 보이다가 시작 후 그대로 쓴다.
- `LRR-024` 데이터. 직접 쓰기 경로는 열지 않는다. 구현은 FE forward-only 마이그레이션 `supabase/migrations/20261016090000_add_lecture_remote.sql`이다. `lecture_remotes`(강의당 1행, `token_hash = sha256(token)`, `holder_id`) 테이블에는 owner select 정책만 둔다. security definer RPC는 `ohpin_issue_lecture_remote(lecture_id)`(owner 확인 → 새 토큰 → 차지 초기화)와 `ohpin_remote_control(token, step -1|0|1)`(처음 호출한 익명 세션이 차지하고 이동하지 않는다. 다른 세션이면 `remote_in_use`, 토큰이 없으면 `remote_revoked`) 두 개다. 강의 상태가 `live`에서 다른 값으로 바뀌면 트리거가 리모컨 행을 지운다. CFA-097A처럼 Supabase 세션으로 직접 호출한다. 프로덕션 적용은 사용자 승인 후에 한다. `20261017090528_persist_question_label_mode.sql`과 `20261017134407_extend_remote_presentation_controls.sql`은 `show_question_labels`와 RPC의 `settings`·`include_questions` 기본 인자를 추가한다. RPC는 같은 토큰·차지 기기를 확인한 뒤 표시 설정 네 필드만 허용하고 각 타입·QR 위치를 검증한다. 차지하는 첫 호출은 이동·설정 변경을 하지 않으며, 쓰기 직전 lecture→remote 순서로 잠가 재발급·종료를 다시 검증한다. 질문 응답은 LIVE 강의의 id·본문·페이지 번호로 제한하고 노트·작성자 UUID·자료 경로는 포함하지 않는다.

- `LRR-025` 1단계 검증: 로컬 `npm run supabase:reset` 뒤 pgTAP `supabase/tests/lecture_remote.sql`로 발급 → 차지 → 다른 사용자 거절 → 범위 밖 거절 → 재발급 시 이전 토큰 거절 → LIVE 이탈 시 삭제를 확인한다. lint/build를 통과하고, 로컬에서 owner 관리 페이지 발급 → 다른 브라우저 리모컨 조작 → 발표 화면·참여자 페이지가 따라가는지 → 세 번째 브라우저가 거절되는지를 확인한다. 프로덕션 확인은 강의가 없는 시간에 사용자 승인을 받아 한다.

- `LRR-026` 질문 버튼에는 강의 전체 질문 수를 표시하고 누르면 화면 아래에서 바텀 시트가 올라온다. 목록은 시트를 연 동안만 조회하며 최신순으로 정렬한다. 로딩·질문 없음·실패를 구분하고 시트 내부를 스크롤할 수 있다. 닫기·Escape·배경 클릭과 포커스 제한·복귀, reduced-motion을 지원한다. 강의 관리 모바일 UI는 이번 변경 대상이 아니다. 기존 단일 기기 거절·재발급·LIVE 이탈·발표 화면 동기화와 새 설정 타입 거절·질문 데이터 최소화를 로컬 SQL 및 `/remote` 브라우저에서 검증한다.
- `LRR-027` `/remote`의 기본 조작부는 모바일 세로·가로 화면에서 페이지 스크롤 없이 표시한다(2026-10-18 사용자 요청). 이전·다음 버튼과 세로 여백은 화면 높이에 맞춰 줄이고, 낮은 가로 화면에서는 설정을 옆에 배치한다. 터치 영역은 44px 이상을 유지하며 질문 목록은 바텀 시트 내부에서 스크롤한다. 확대 시에도 내용을 잘라 숨기지 않는다.

## 2. 범위 밖

계정/초대 구현은 별도 계정 구조 지침을 따른다. 리모컨에는 로그인, 발표자 노트, 강의 시작·종료, 자동 넘김을 추가하지 않는다. 단일 기기 제한·재발급에 따른 해제·LIVE 이탈 시 해제를 유지한다.
