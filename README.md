# Pin Class MVP

강의 자료를 업로드하면 참여 링크/QR이 만들어지고, 수강생이 슬라이드의 위치에 질문을 남기며, 강사가 플레이어와 목록에서 실시간으로 처리하는 MVP입니다.

## 바로 실행

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 샘플 세션을 즉시 체험할 수 있습니다. 기본값은 `demo` 모드이며 데이터는 브라우저 `localStorage`와 `BroadcastChannel`에 저장되어 같은 브라우저의 탭 사이에서 실시간 동작합니다.

## Supabase 연결

1. `.env.example`을 `.env.local`로 복사합니다.
2. 제공된 프로젝트 URL과 프로젝트의 publishable key를 입력합니다.
3. Supabase Dashboard에서 Anonymous Sign-ins를 활성화합니다.
4. `supabase/migrations`의 마이그레이션을 적용합니다.
5. `NEXT_PUBLIC_DATA_MODE=supabase`로 변경합니다.

Secret/service-role key는 브라우저에 노출하지 않습니다. 현재 리포지토리는 Supabase 연결 클라이언트, 세션 조회/질문 등록/Realtime 어댑터, RLS 스키마까지 포함합니다. 자격 증명이 없는 로컬 실행은 demo 어댑터를 사용합니다.

## MVP 화면

- `/` — PDF/PPT/PPTX 업로드, 로컬 렌더링, 최근 세션
- `/admin/session/:id` — 강사용 실시간 플레이어, 핀↔질문 연결, 답변/해결, 질문 목록
- `/join/:code` — 모바일 수강생 화면, 핀 클릭 또는 질문 태그 드래그, 익명 질문 등록

## 설계 경계

```text
UI
 └─ Session store / repository boundary
     ├─ Demo adapter (localStorage + BroadcastChannel)
     └─ Supabase adapter (Auth + Postgres + Realtime + Storage)

Course → Lecture → Material → MaterialVersion → Slide
                                      └→ RegionAnchor → Question → Answer
Course → CourseBrainMemory (append-only, embedding은 후속 백필)
```

좌표는 0–1 정규화 값이며 `material_version_id`에 고정됩니다. `course_brain_memory`는 질문/답변을 append-only로 축적하므로 이후 GVCGE, 임베딩, Graph edge, RAG를 별도 백필로 추가할 수 있습니다.

## 업로드 변환

개발 서버의 `/api/convert`는 PDF를 `pdftoppm`으로, PPT/PPTX를 LibreOffice → PDF → 이미지 순서로 변환합니다. 배포 환경에서는 동일한 변환 코드를 Worker/Edge Job으로 옮기고 결과 이미지를 `lecture-slides` Storage에 저장하는 구성이 권장됩니다.

## 다음 구축 순서

1. 강의자 이메일/소셜 인증과 온보딩
2. 변환 작업을 비동기 Worker로 분리하고 진행률/재시도 추가
3. Supabase Broadcast 기반 대규모 Realtime 전환
4. 질문 공감, CSV export, 답변 알림
5. 위치 버킷 히트맵과 강의 개선 리포트
