# Pin Class 프런트엔드 아키텍처 명세

- Artifact: `class-frontend-architecture`
- Status: `approved` (2026-09-28 사용자 위임에 따른 Codex 리뷰·승인)
- Source: `doc/pin_class_prd.md`, `AGENTS.md`, `DESIGN.md`
- Depends on: 없음
- Decision boundary: Pin Class의 Model·View·Controller·Service 책임, 객체지향 적용 원칙, route/component CSS 소유권, 전역 상태의 점진 축소, 데이터 로딩·Realtime·성능 기준과 구조 리팩터링 검증

이 문서는 Pin Class의 기존 제품 동작을 유지하면서 코드를 React·Next.js에 맞는 MVC 구조로 재배치하는 결정을 소유한다. 별도 `/pin` 제품의 삭제 대상과 legacy 데이터 보존은 `pin-feedback-sunset`이 소유한다. AI 리포트 제품·근거·시스템 계약은 이 문서에서 재정의하지 않는다.

## 1. 목적, 범위와 비목표

- `CFA-001` 적용 범위는 Pin Class의 `/admin`, `/join`, 인증·변환 경로와 이들이 사용하는 공용 컴포넌트다. `/pin` 런타임 제거는 `pin-feedback-sunset`을 따른다.
- `CFA-002` 이번 변경은 파일 소유권, 의존 방향, 상태·데이터 접근 경계를 명확하게 만드는 구조 리팩터링이다. 사용자 흐름, RLS, 데이터 의미와 시각 결과를 임의로 변경하지 않는다.
- `CFA-003` React class component, entity 재수화 프레임워크, 범용 상태관리 패키지, CSS-in-JS, DI container, 단일 구현용 factory·추상 class를 추가하지 않는다.
- `CFA-004` 구조 변경 자체에는 DB schema, RPC, Storage lifecycle 변경을 포함하지 않는다. 성능 측정이 새 RPC 필요성을 입증하면 이 문서를 다시 승인하고 별도 migration context lock을 만든다.
- `CFA-005` 단순 redirect, 정적 페이지, 한 줄 변환을 위해 model·controller·service 파일을 의무적으로 만들지 않는다.

## 2. 계층과 의존 방향

- `CFA-010` 의존 방향은 `View -> Controller -> Service -> Infrastructure`로 고정한다. 업무 데이터는 REST 연결을, 인증·Storage·Realtime은 Supabase client를 사용한다. Model은 각 계층이 참조할 수 있지만 하위 계층이 View 또는 Controller를 import하지 않는다.
- `CFA-011` View는 렌더링, semantic HTML, 접근성 속성과 controller가 제공한 상태의 표현만 소유한다. Supabase·Storage 호출, 낙관적 갱신과 복잡한 상태 전이는 View에 두지 않는다.
- `CFA-012` Controller는 route의 UI 상태, 사용자 이벤트, service 호출, 중복 요청 병합, 최신 응답 우선, 오류 표현과 rollback을 캡슐화한 React hook이다.
- `CFA-013` Service는 도메인별 함수형 TypeScript 모듈이며 Infrastructure를 통해 REST 또는 Supabase와 통신한다. React 타입, DOM, 번역 함수와 UI 문구를 참조하지 않는다.
- `CFA-014` Supabase client·server client 생성, anonymous auth와 토큰 갱신 같은 연결 기반은 `app/_infrastructure/supabase`에 둔다. 도메인 조회·변환·mutation은 `app/_service`가 소유한다.
- `CFA-015` route 전용 view-model 또는 selector가 두 개 이상이거나 비자명한 변환을 가질 때만 route `model.ts`를 만든다. 재사용 도메인 모델과 순수 로직은 `app/_model`에 둔다.

의존 구조는 다음과 같다.

```text
View(app/(view)/**/page.tsx, component/)
  -> Controller(controller.ts)
    -> Service(app/_service)
      -> REST 연결(app/_infrastructure/rest)
      -> Supabase client(app/_infrastructure/supabase): 인증·Storage·Realtime
  -> Model(route model, app/_model)
```

## 3. 객체지향 적용 원칙

- `CFA-020` Model은 직렬화 가능한 TypeScript DTO와 순수 검증·정규화·집계 함수로 구성한다. Supabase 응답, React state와 localStorage 사이에서 prototype이 필요한 entity class를 사용하지 않는다.
- `CFA-021` 객체지향성은 책임 캡슐화, 단방향 의존성, 작고 명시적인 public contract, Facade·Adapter·Strategy 패턴으로 적용한다.
- `CFA-022` 실제 구현이 Supabase mode와 demo mode 두 개인 데이터 경계에만 TypeScript interface를 둔다. 두 구현은 class 상속 대신 같은 contract를 만족하는 함수 또는 객체 모듈로 작성한다.
- `CFA-023` 연결 모드는 REST 업무 데이터와 Supabase 인증·Storage·Realtime을, demo 모드는 localStorage·BroadcastChannel을 캡슐화한다. 연결 모드의 업무 데이터는 항상 REST를 사용하며 View는 연결 방식을 알지 못한다.
- `CFA-024` 기존 `SessionStore`는 전환 중 application Facade로 유지한다. 각 route가 controller/service로 이전될 때마다 전역 선로딩, mutation과 public method를 축소한다.
- `CFA-025` 한 구현만 있는 service에 interface, factory, singleton class를 추가하지 않는다. 두 번째 구현이나 테스트 대역이 실제로 필요해질 때 가장 작은 contract를 도입한다.

기본 파일 구조는 다음과 같다.

```text
app/
  (view)/                  # URL에 포함되지 않는 Next route group
    admin/session/[id]/
      page.tsx             # View
      page.module.css
      controller.ts        # 해당 View 전용
      model.ts             # 필요한 경우만
      component/           # 해당 페이지 계열에서만 재사용
  component/               # 여러 페이지가 재사용하는 전역 UI
  _model/                  # 공유 DTO와 순수 도메인 로직
  _controller/             # 전역 provider와 공유 React controller
  _service/                # REST·Supabase 연결을 사용하는 도메인 service
  _infrastructure/
    supabase/              # Supabase client/server 연결 기반
    rest/                  # REST 요청·JWT 전달 기반
    server/                # 서버 전용 변환 기반
  api/                     # Next Route Handler
```

## 4. CSS 소유권과 경로별 배치

- `CFA-030` `app/globals.css`에는 font, primitive·semantic token, reset, element 기본값, selection, focus, reduced-motion과 전환 기간의 `.btn`, `.spinner`, `.sr-only`만 남긴다.
- `CFA-031` 페이지 shell·배치·페이지 전용 반응형 규칙은 `page.tsx` 옆 `page.module.css`가 소유한다.
- `CFA-032` 공유 컴포넌트의 내부 DOM, 상태 variant, keyframe과 반응형 규칙은 컴포넌트 옆 `<component>.module.css`가 소유한다. 페이지 CSS는 자식 컴포넌트의 내부 selector를 직접 수정하지 않는다.
- `CFA-032A` 한 페이지 계열에서만 사용하는 컴포넌트는 해당 route의 `component/`에 둔다. 둘 이상의 독립된 페이지 계열에서 재사용하는 컴포넌트만 `app/component`에 둔다.
- `CFA-033` 첫 전환에서는 CSS Module의 로컬 root 아래 기존 의미형 class를 `:global(...)`로 감싸 cascade를 보존한다. 공유 컴포넌트는 사용처가 이전될 때 `styles.*` hashed class로 전환한다.
- `CFA-034` 일반 `page.css` 전역 import는 사용하지 않는다. Root layout의 global import 한 곳과 각 View·컴포넌트의 CSS Module import만 허용한다.
- `CFA-035` 동적 상태, 카테고리, marker, QR 위치와 accent는 문자열 결합 대신 명시적 class map으로 변환한다. 알 수 없는 값은 안전한 기본 variant를 사용한다.
- `CFA-036` 공유 selector를 페이지별로 복제하지 않는다. `SlideCanvas`, 질문 marker, status badge, 검색과 업로드 진행률은 컴포넌트 module로 한 번만 이동한다.
- `CFA-037` 기존 semantic token과 `DESIGN.md`를 유지하며 새 직접 hex 값을 추가하지 않는다. CSS 이동 단계에서 시각값과 cascade 순서를 변경하지 않는다.
- `CFA-038` CSS 삭제는 모든 소비자가 새 module로 이전된 뒤 `app/globals.css` 단일 소유 패키지에서 수행한다. route 작업자가 동시에 global stylesheet를 편집하지 않는다.

## 5. 전역 상태의 점진 축소

- `CFA-040` 첫 단계에서 `SessionStore`의 public API를 호환 Facade로 유지해 기존 route를 깨지 않는다.
- `CFA-041` route controller가 service 조회와 route-local state를 소유하도록 한 route씩 이전한다. 이전된 route는 전역 `sessions` 배열에서 데이터를 찾지 않는다.
- `CFA-042` shared mutation은 service contract를 먼저 정하고 controller와 Facade가 같은 contract를 사용한다. route마다 mutation을 다시 구현하지 않는다.
- `CFA-043` Facade의 method와 전역 state는 마지막 소비자가 사라진 즉시 제거한다. 영구 compatibility wrapper와 사용되지 않는 re-export를 남기지 않는다.
- `CFA-044` 인증 provider, 언어 provider와 Pin Class data controller의 조합 순서는 유지한다. participant route를 admin guard 아래로 이동하지 않는다.

## 6. 데이터 로딩, Realtime과 성능

- `CFA-050` 각 route controller는 화면에 필요한 최소 DTO만 service에 요청한다. Root Provider에서 모든 강의, 슬라이드와 질문을 선로딩하지 않는다.
- `CFA-051` 대시보드는 폴더·자료 요약만 조회하며 슬라이드 본문, 질문 원문과 발표 메모를 가져오지 않는다. 초기 네트워크 왕복은 최대 2회다.
- `CFA-052` 폴더 화면은 선택한 폴더의 자료 요약만 조회한다. 인사이트 상세는 해당 탭을 열 때 요청하며 초기 왕복은 최대 2회다.
- `CFA-053` 관리자·참여자 세션 snapshot은 기본 정보, 슬라이드와 질문을 최대 3회 안에 조회한다. participant 응답에는 `speakerNote`를 포함하지 않는다.
- `CFA-054` Realtime은 현재 활성 세션에 채널 하나만 연결한다. 페이지 이탈·세션 변경 시 기존 채널을 해제하고 전체 소유 강의 구독을 제거한다.
- `CFA-055` row마다 추가 요청하는 N+1 패턴을 금지한다. ID lookup과 group aggregation은 `Map`을 사용해 반환 데이터 크기에 선형인 O(n)으로 처리한다.
- `CFA-056` 목록 반환을 O(1)이라고 표현하지 않는다. 요청 횟수는 entity 수와 무관한 상수로 제한하고 CPU·payload는 실제 반환량에 선형 비례하도록 한다.
- `CFA-057` 첫 유효 화면 3초와 질문 제출 API p95 2초를 검증한다. 기준 데이터 크기, 브라우저, Supabase 환경과 측정 방법을 evidence에 기록한다.
- `CFA-058` 위 구조로 목표를 충족하지 못한 안정된 조회만 단일 RPC 후보로 승격한다. 이번 리팩터링에서 새 RPC를 추측으로 추가하지 않는다.
- `CFA-059` controller는 같은 key의 동시 요청을 병합하고 stale response가 최신 화면을 덮지 못하게 한다. 범용 캐시 dependency는 추가하지 않는다.

## 7. 데이터 권위, 보안과 실패 경계

- `CFA-060` Supabase mode에서는 Postgres가 권위 원본이고 localStorage는 계정별 실패 캐시만 담당한다. demo mode에서만 localStorage와 BroadcastChannel을 권위 원본으로 사용한다.
- `CFA-061` owner client와 anonymous audience client를 분리하고 기존 RLS를 우회하지 않는다. admin guard는 Supabase 설정 시 fail closed를 유지한다.
- `CFA-062` 폴더 owner 복합 FK, 질문 작성자 권한, 답변·해결 권한과 slide lifecycle의 DB 원자성을 service 이동 중 유지한다.
- `CFA-063` 발표 메모는 owner-only service와 DTO에만 존재한다. participant 조회, Realtime payload, local failure cache와 AI evidence에 노출하지 않는다.
- `CFA-064` 낙관적 mutation 실패 시 controller는 직전 화면 state로 rollback하고 재시도 가능한 오류를 제공한다. 삭제·Storage 정리 오류를 성공으로 표시하지 않는다.
- `CFA-065` 로그아웃·anonymous 전환 시 이전 owner의 메모리 state와 account-scoped cache를 다른 사용자에게 노출하지 않는다.

## 8. 구현 패키지와 롤백

- `CFA-070` 구현 전 현재 selector 소비자, route별 요청 수, payload, Realtime 채널, 필수 browser journey의 기준 evidence를 기록한다.
- `CFA-071` 공유 contract package는 `app/_model`, `app/_service`, `app/_infrastructure`와 `app/_controller/session-store.tsx` Facade를 한 소유자가 담당한다. 이 경로를 여러 작업자가 동시에 편집하지 않는다.
- `CFA-072` 공유 컴포넌트 package와 route package는 contract가 잠긴 뒤 비중첩 경로로 병렬 실행할 수 있다. route package는 dashboard·folder, session·present, join·auth 경계로 나눈다.
- `CFA-073` `app/globals.css`는 모든 route/component module 이전 후 하나의 integration package만 편집한다. `/pin` 전용 selector 제거도 같은 package가 담당한다.
- `CFA-074` 임시 호환 import는 같은 run 안에서 제거한다. 새 dependency와 migration은 추가하지 않는다. REST 전환은 CFA-092에 따른 서버 환경변수와 Route Handler 설정만 허용한다.
- `CFA-075` 이 구조 변경의 rollback은 package별 Git revert다. DB·Storage 변경이 없으므로 데이터 rollback 절차는 필요하지 않다.
- `CFA-076` 삭제나 이동 중 승인 문서와 충돌하거나 participant data 경계가 불명확해지면 구현을 중단하고 문서를 다시 승인한다.

## 9. 검증과 추적성

- `CFA-080` non-trivial selector, normalization, grouping과 stale-response 로직에는 가장 작은 Node test를 둔다.
- `CFA-081` Supabase CLI stack을 시작하고 clean `npm run supabase:reset`, `npm run lint`, `npm run build`를 순서대로 통과한다.
- `CFA-082` 로그인 redirect, 폴더 열기, grid/list, Insights, 자료 열기, panel collapse·resize, note save, filmstrip scrollbar와 keyboard slide navigation을 실제 브라우저에서 검증한다.
- `CFA-083` 1440px, 900px, 600px, 낮은 가로 화면, 200% 확대, focus-visible, reduced-motion과 SPA 이동 순서를 검증한다.
- `CFA-084` demo mode의 localStorage·BroadcastChannel과 Supabase mode의 account cache·Realtime cleanup을 각각 검증한다.
- `CFA-085` dashboard·folder 요청 최대 2회, session snapshot 최대 3회, 탭당 활성 Realtime 채널 최대 1개와 N+1 부재를 evidence로 남긴다.
- `CFA-086` participant payload와 API 응답에 `speakerNote`가 없고 owner·anonymous 권한 부정 경로가 실패하는지 확인한다.
- `CFA-087` 최종 diff에 `ponytail-review`를 적용해 안전한 중복·추상화·dependency를 제거한 뒤 관련 검증을 반복한다.
- `CFA-088` 모든 구현과 test가 승인 문서의 관련 `CFA-*` 요구사항을 만족하는지 최종 diff에서 확인한다. generated context lock, hook 또는 document-driven harness는 요구하지 않는다.

## 10. 완료 조건

이 artifact는 다음 조건을 모두 만족할 때 구현 완료로 판정한다.

1. Pin Class의 stateful route가 View·Controller·Service 경계를 따르고 View에 직접 Supabase 호출이 없다.
2. `app/globals.css`가 foundation과 승인된 임시 primitive만 포함하고 route/component 스타일이 소유 파일에 있다.
3. 전역 `SessionStore`가 route data source가 아니라 필요한 최소 호환 Facade로 축소됐다.
4. 요청 수, Realtime, p95, 접근성, RLS와 speaker note 비공개 기준을 evidence로 검증했다.
5. `/pin` 제거와 공유 로직 이동은 승인된 `pin-feedback-sunset`과 모순 없이 통합됐다.
6. Supabase reset, lint, build, targeted tests, browser journey와 Ponytail review가 모두 통과했다.


## 11. REST 업무 API 전환 (2026-09-28)

- `CFA-090` 기준은 원격 `origin/feature-dev`다. 기존 UI·모델·controller 공개 함수는 유지하고 현재 service의 업무 데이터 조회·mutation을 OhPin REST API에 연결한다. 전용 API가 없는 기능은 임의로 제거하지 않는다.
- `CFA-091` Supabase Google OAuth, 강사 세션, 별도 anonymous participant 세션, Storage 원본/슬라이드 업로드·서명 URL, Realtime 구독·반응 broadcast는 유지한다. 프로필 조회만 `/api/me`를 사용하며 Supabase 관리 API와 service-role 키를 브라우저에 추가하지 않는다.
- `CFA-092` 서버 설정 `REST_API_URL` 하나로 대상 origin을 선택하며 배포 기본값은 `https://ohpinbe.newdawn.co.kr`다. Next.js Route Handler는 고정 `/api/rest/:path*`를 대상의 `/api/:path*`에 연결하며 JWT·Content-Type만 전달하고 브라우저 Origin·쿠키는 전달하지 않는다. 본문과 NDJSON 응답은 스트리밍하고 upstream 장애는 502로 반환한다. 브라우저는 고정된 동일 출처 경로만 사용한다. Supabase 설정 시 모든 업무 CRUD는 REST를 사용하고 자격 증명 없는 demo mode만 기존 localStorage 흐름을 유지한다. REST 오류 시 Supabase 업무 CRUD로 fallback하지 않는다.
- `CFA-093` 배포 대상은 `https://ohpinbe.newdawn.co.kr`이며 Swagger JSON은 `https://ohpinbe.newdawn.co.kr/v3/api-docs`다. Swagger의 generated HTTP URL을 HTTPS 페이지에서 그대로 사용하지 않는다. 로컬 개발·write 검증은 같은 로컬 Supabase에 연결된 로컬 BE 또는 mock HTTP 서버에서 수행한다. 운영 API에는 승인 없이 검증용 데이터를 쓰지 않는다.
- `CFA-094` 요청마다 실제 호출자의 현재 Supabase access token을 `Authorization: Bearer`로 전달한다. 강사 API에는 강사 client만, participant API에는 anonymous audience client만 사용한다. JWT 없이 요청하지 않으며 anonymous 토큰으로 강사 API를 호출하지 않는다. 고정 service-role 토큰이나 사용자 입력 upstream URL을 사용하지 않는다.
- `CFA-095` 폴더 목록·생성·이름변경·삭제, course 목록·이동·삭제, 자료 생성, 강사/participant 슬라이드 조회, 슬라이드 생성(자료 생성 DTO)·삭제·메모, live join/lecture/state, 질문 목록·제출·수정·공감·답변·해결, 참여 경험 응답, source-path 변환·Storage cleanup을 현재 Swagger endpoint에 매핑한다. 요청은 camelCase DTO, 응답은 실제 BE의 snake_case projection을 기존 UI 모델로 변환한다. `purpose`/`purposeLabel`과 `presentation_autoplay`를 보존한다.
- `CFA-096` `JsonNode` 응답은 Swagger 이름만으로 추정하지 않고 실제 BE controller/repository와 확인한다. 빈 204 응답, 404, 401/403, JSON·텍스트 오류를 처리한다. 낙관적 mutation 실패는 기존 rollback·오류 표시를 유지한다. 자동 mutation 재시도를 추가하지 않는다.
- `CFA-097` audience 데이터에는 발표 메모·작성자 UUID를 추가하지 않는다. `is_mine`과 공감 desired-state를 기존 contract로 유지한다. 위치·카테고리·작성자 수정권한, owner 접근제어와 강사 전용 메모 경계를 훼손하지 않는다. Realtime 이후 재조회도 같은 REST 경계를 사용한다.
- `CFA-098` 원본 업로드는 기존 resumable Storage 경로를 유지하고 변환에는 `sourcePath`/`fileName`만 전송한다. 기존 스트리밍 진행률·실패 처리·원본 정리를 보존한다. 삭제 후 Storage cleanup 계약을 실제 BE 응답으로 확인한다.
- `CFA-099` 구현 완료 조건은 로컬 Supabase 시작·clean migration replay, lint/build, token 분리·요청 DTO·204/오류 처리·participant 메모 비노출에 대한 작은 runnable check, 로컬 BE 또는 mock을 통한 proxy/변환 스트림 검증, 기존 핵심 브라우저 흐름과 최종 Ponytail review다. 운영 로그인·실데이터 검증이 없으면 production-ready라고 주장하지 않는다.

### 구현·검증 경계

| 요구사항 | 예상 코드 경계 | 검증 |
| --- | --- | --- |
| CFA-090, CFA-095, CFA-097 | `app/_service/class-session-service.ts`, 기존 session store/model | folder/session/question endpoint·DTO, participant projection |
| CFA-091, CFA-094 | `app/_infrastructure/rest`, `app/_infrastructure/supabase/client.ts`, auth/experience service | owner/anonymous token 분리, profile·experience 호출 |
| CFA-092, CFA-093, CFA-096 | `app/api/rest/[...path]/route.ts`, REST 요청 기반, README/env 예시 | local upstream proxy, 204·401/403·404·텍스트 오류 |
| CFA-098 | `app/_service/convert.ts`, 기존 Storage 업로드 경계 | sourcePath-only 요청, stream·cleanup |
| CFA-099 | 기존 model tests, REST targeted check, 로컬 runtime | migration replay, lint/build, browser, Ponytail review |

2026-09-28 사전 확인: FE `origin/feature-dev`와 현재 HEAD는 `e00739a`, BE `main`은 `86b65be858d1892d11da0f9d300240b6d25e2e71`다. 배포 OpenAPI는 29 operation을 제공하며 폴더 목적 DTO를 포함한다. BE source는 폴더 목적 projection과 자동재생 projection/PATCH를 포함한다. 배포 API의 무인증 강사·participant 요청은 각각 401이고 localhost 직접 preflight는 403이다. 이 결과는 인증된 end-to-end 검증을 대신하지 않는다.
