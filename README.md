# Pin Class MVP

강의 자료를 업로드하면 참여 링크/QR이 만들어지고, 수강생이 슬라이드의 위치에 질문을 남기며, 강사가 플레이어와 목록에서 실시간으로 처리하는 MVP입니다.

## 바로 실행

```bash
npm install
cp .env.example .env
npm run supabase:start
npm run supabase:status
# .env의 local publishable key와 Google OAuth 값을 채운 뒤
npm run dev
```

`npm run supabase:start`는 Docker에서 Postgres 17, Auth, Storage, Realtime,
Studio를 실행하고 모든 migration과 `supabase/seed.sql`을 적용합니다. 로컬 Studio는
`http://127.0.0.1:55323`입니다. Google Cloud OAuth Web client에는
`http://127.0.0.1:55321/auth/v1/callback`을 Authorized redirect URI로 등록하세요.

로컬 개발은 이 Docker 스택을 기준으로 하며 운영 Supabase를 개발용으로 사용하지
않습니다. migration 전체 재현 검증은 `npm run supabase:reset`, 종료는
`npm run supabase:stop`입니다. `supabase:reset`은 로컬 DB 데이터를 지웁니다.

## Supabase 연결

1. `.env.example`을 `.env`로 복사합니다.
2. 제공된 프로젝트 URL과 프로젝트의 publishable key를 입력합니다.
3. Supabase Dashboard에서 Anonymous Sign-ins를 활성화합니다. (수강생 익명 참여용)
4. Authentication → Providers에서 **Google**을 활성화합니다. Google Cloud Console에서 OAuth Client를 만들고, Authorized redirect URI에 `https://<project-ref>.supabase.co/auth/v1/callback`을 등록한 뒤 Client ID/Secret을 입력합니다.
5. Authentication → URL Configuration에서 Site URL에 배포 도메인을 넣고, Redirect URLs에 개발용 `http://localhost:3000/**`와 운영용 `https://<배포 도메인>/auth/callback`을 추가합니다. 허용 목록에 없으면 로그인 후 Site URL로 떨어집니다.
6. `supabase/migrations`의 마이그레이션을 적용합니다.
7. `NEXT_PUBLIC_DATA_MODE=rest`로 변경합니다. 기존 `supabase` 값도 같은 REST 업무 API 경로를 사용합니다.

Secret/service-role key는 브라우저에 노출하지 않습니다. 연결 모드에서는 프로필·폴더·강의·슬라이드 메타데이터·질문·답변·설문·상태를 REST API에서 읽고 씁니다. Supabase Google/anonymous 인증, Storage 업로드·PDF 서명 URL, Realtime은 유지합니다. 브라우저 `localStorage`는 강사 계정별 임시 캐시로만 사용하며 REST 응답이 항상 기준입니다. 자격 증명이 없는 로컬 실행은 demo 어댑터를 사용하고, 이때만 `localStorage`와 `BroadcastChannel`이 기준 데이터 역할을 합니다.

## REST API 연결

브라우저의 `/api/rest/*` 요청은 Next.js 서버가 `REST_API_URL`의 `/api/*`로 전달합니다. 배포 기본값은 `https://ohpinbe.newdawn.co.kr`이며 [Swagger](https://ohpinbe.newdawn.co.kr/swagger-ui/index.html)를 참고합니다. 서버 변수에는 origin만 지정하고 `/api`를 붙이지 않습니다. HTTPS 또는 localhost HTTP만 허용합니다.

프록시는 호출자 JWT와 Content-Type만 전달하고 브라우저 Origin·쿠키는 전달하지 않습니다. 사용자·역할 권한은 백엔드가 동일 Supabase 프로젝트의 JWT와 RLS로 검증합니다. REST 실패 시 프런트가 Supabase 업무 CRUD로 돌아가지 않습니다. 원본 변환은 `sourcePath`/`fileName`만 REST에 전송하며 NDJSON 진행률을 스트리밍합니다.

로컬 검증은 `.env.example`의 로컬 Supabase와 같은 프로젝트를 사용하는 로컬 BE를 실행한 뒤 `REST_API_URL=http://127.0.0.1:8080`으로 연결합니다. 배포할 때는 프런트 Supabase 설정과 REST 백엔드의 Supabase 프로젝트가 일치해야 합니다. API 대상만 바꿔 다른 프로젝트의 JWT를 보내면 인증이 실패합니다.

## 역할 (roles)

역할은 `admin`과 `participant` 두 개뿐입니다.

- **admin** — 구글 로그인으로 가입한 강사/운영자. 폴더·자료 업로드·답변·상태를 관리하며 로그인 후 `/admin/dashboard`로 이동합니다.
- **participant** — QR/링크로 들어온 수강생. 로그인 없이 익명 세션(`auth.signInAnonymously`)으로 질문을 남깁니다.

역할은 `public.profiles.role`에 저장되고 `auth.users` 트리거가 가입 경로에 따라 자동 부여합니다(익명 → participant, 구글 → admin). 코스 생성과 Storage 업로드는 RLS restrictive 정책으로 admin에게만 열려 있습니다.

## MVP 화면

- `/` — 로그인 화면으로 보내는 진입 경로
- `/login` — 강사 Google 로그인, 로그인 후 폴더 대시보드로 이동
- `/admin/dashboard` — 폴더 중심 대시보드와 미분류 자료 업로드
- `/admin/folders/:id` — 폴더 자료의 grid/list 보기와 폴더 범위 인사이트 탭
- `/admin/session/:id` — 강사용 실시간 플레이어, 핀↔질문 연결, 답변/해결, 질문 목록 (admin 전용)
- `/join/:code` — 모바일 수강생 화면, 핀 클릭 또는 질문 태그 드래그, 익명 질문 등록 (로그인 불필요)

## 설계 경계

```text
UI
 └─ Session store / repository boundary
     ├─ Demo adapter (localStorage + BroadcastChannel)
     └─ REST business API + Supabase Auth/Realtime/Storage

Course → Lecture → Material → MaterialVersion → Slide
                                      └→ RegionAnchor → Question → Answer
Course → CourseBrainMemory (append-only, embedding은 후속 백필)
```

좌표는 0–1 정규화 값이며 `material_version_id`에 고정됩니다. `course_brain_memory`는 질문/답변을 append-only로 축적하므로 이후 GVCGE, 임베딩, Graph edge, RAG를 별도 백필로 추가할 수 있습니다.

## 업로드 변환

연결 모드에서는 원본을 resumable Storage로 업로드합니다. PDF는 브라우저가 원본 페이지를 지연 렌더링하고, PPT/PPTX는 `/api/rest/convert`의 NDJSON 결과를 사용합니다. 자격 증명이 없는 demo mode만 기존 `/api/convert`의 로컬 변환을 사용합니다.

## 다음 구축 순서

1. 강의자 온보딩과 폴더 공유 정책
2. 변환 작업을 비동기 Worker로 분리하고 진행률/재시도 추가
3. Supabase Broadcast 기반 대규모 Realtime 전환
4. 질문 공감, CSV export, 답변 알림
5. 위치 버킷 히트맵과 강의 개선 리포트
