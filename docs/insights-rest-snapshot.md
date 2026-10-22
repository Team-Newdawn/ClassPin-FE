# 백엔드 변경 없는 인사이트 구현

2026-10-21 사용자가 “백엔드 변경 없이 구현할 수 있는 방법으로 일단 우회하기”를 선택했다.

## 2026-10-21 대체됨

`insights-ai-foundation.md` 10절의 재설계로 snapshot 테이블·worker·lease·비용 견적은 제거됐다. 이 문서의 REST 소유 자료 읽기 계약(`insight-source.ts`)만 계속 쓴다.

## 원본과 분석 저장소

Spring 백엔드는 수정하지 않는다. 인증된 Next.js API가 기존 `/api/instructor/courses`를 호출하고, 선택한 자료의 최신 버전·슬라이드·질문·전체 답변을 서버에서 검증한다. 동일 선택을 연속 두 번 조회해 fingerprint가 같을 때만 두 번째 응답을 고정한다. 다르면 `SOURCE_CHANGED`로 중단한다. 이는 변경 중인 응답을 거르는 검사이며 원본 DB의 transaction snapshot이나 ABA 변경 방지를 보장하지 않는다.

원본의 조회 시각과 저장 시각을 구분하고 `consistency=rest_response`를 기록한다. 기존 AIR-SYS-020~025의 원본과 보고서 간 단일 transaction 조건은 이 방식으로 대체한다. 조회 완료 이후 변경은 기존 snapshot을 수정하지 않는다. Spring의 업무 테이블을 직접 읽거나 수정하지 않는다.

첫 저장 단계는 `ai_report_snapshots`에 검증된 응답을 불변 JSON으로 보관한다. 이 행은 분석 완료 보고서가 아니다. report/job/revision 연결 전까지 상태는 `captured`이고 AI 생성 가능 여부는 false다. snapshot 준비는 과금하지 않으며 외부 AI를 호출하지 않는다. 비용 quote는 실제 생성 요청에 적용한다.

서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로만 쓰고 읽는다. `anon`/`authenticated`의 직접 조회·쓰기를 금지하고 RLS를 켠다. API는 매번 실제 사용자와 admin 역할을 검증하고, owner는 요청 본문에서 받지 않는다. 원문·원본 경로·fingerprint는 브라우저로 반환하지 않는다. idempotency key를 재사용하면 같은 선택은 기존 snapshot을 돌려주고 다른 선택은 충돌로 처리한다. 사용자당 최대 20개, 개당 16MiB를 적용한다. 미연결 스냅샷은 24시간 만료하며, 보고서가 참조하는 스냅샷은 보고서와 함께 보존한다.

상세 조회는 기존 API로 자료 소유권/존재를 다시 확인한다. 원본 삭제·접근 상실이 확인되면 snapshot도 삭제한다. upstream 장애는 삭제로 간주하지 않는다. 소스가 바뀌면 `sourceChanged=true`이고 snapshot은 그대로 유지한다. 미연결 만료본은 조회를 거부하고 저장 시 또는 정리 worker가 청소한다. 백엔드 이벤트가 없으므로 삭제 직후 즉시 물리 삭제는 보장하지 않는다. 운영 활성화 전 만료/삭제 정리 작업을 연결해야 한다.

## 다음 연결 순서

### 플랫폼 연결 구현 결정 (2026-10-21)

사용자의 플랫폼 삽입·테스트 지시에 따라 기존 /admin/insights를 실제 분석 화면으로 연결한다. 종료된 강의의 종료 리포트에서 생성 화면에 진입하고, 파일 카드에는 저장된 ready/confirmed 결과가 있을 때만 인사이트 아이콘을 표시한다. 강의 시작은 계속 플레이어 열기이며 LIVE 전환은 플레이어에서 한다. 폴더 인사이트 탭은 복원하지 않는다.

REST 스냅샷에 연결한 서버 전용 report 행이 작업 상태·lease·비용·canonical·revision·대화의 권위 원본이다. 로컬 worker 명령은 DB의 queued 작업을 claim하며 같은 processor를 private worker에서 호출할 수 있다. 원본 이미지/PDF는 캡처 시 검증한 소유 경로만 읽고, 가림 사본만 비공개 분석 bucket에 저장한다. PDF는 Poppler로 지정된 원본 페이지를 렌더한다. 원본 다운로드·준비 실패는 부분 성공으로 처리하지 않는다.

전체 요약은 검증된 claim의 선택·정렬로 구성한다. 숫자는 코드 집계로 표시한다. 대화·수정도 canonical 근거를 참조하고 검증 실패 시 이전 결과를 유지한다. 확정 후 수정하지 않으며 동일 확정 결과를 MD/PDF/DOCX/PPTX로 변환한다. 공개 공유는 제공하지 않는다. 운영 Cloud Tasks/OIDC 연결과 release 평가 전에는 로컬 검증과 운영 완료를 구분한다.

1. 로컬 OCR와 민감정보 가림 → 별칭 기반 외부 전송 payload.
2. Qwen 분석 → 코드 근거 검증 → GPT-OSS 텍스트 검토 → canonical 결과 저장.
3. 영속 job·비용·재시도·정리 worker.
4. 같은 canonical을 사용하는 인사이트 화면·대화·revision·확정·4종 내보내기.

저장 API/DB 검사와 AI end-to-end/브라우저/운영 검증은 각각 구분해 기록한다. 준비 단계만 완료한 상태에서 인사이트 구현 전체 완료로 표시하지 않는다.

## 구현·검증 기록

- API: `POST /api/admin/ai-reports/snapshots` (본문 materialIds, UUID Idempotency-Key), `GET /api/admin/ai-reports/snapshots/{id}`. 응답은 counts/시각/상태만 포함하며 원문·경로·fingerprint는 제외한다.
- `insight-request.ts`가 source 준비 검사와 snapshot API의 인증·선택 검증·제한된 원본 읽기를 공유한다. 기존 준비 검사 API의 동작도 유지한다.
- migration `20261021061741_insight_captured_snapshots.sql`: private-by-grant + RLS, service-role 전용 캡처 RPC, 사용자별 잠금·멱등성·용량 제한. service role도 UPDATE 권한이 없다.
- `insight-redaction.ts`: Tesseract 5 + eng/kor 로컬 OCR, 민감 문자열이 있는 줄 가림, 사본 checksum·엔진·규칙·가림 영역 기록. 원본 bytes/EXIF를 외부 입력으로 재사용하지 않는다. 실패 시 원문 fallback 없이 중단한다.
- `insight-slide-input.ts`: snapshot 순서의 M/S/Q 별칭, 비식별 질문·전체 답변·코드 metric, 가림 후 전체 이미지/원래 형태의 PIN overlay/crop. 좌표 없는 질문과 질문 없는 슬라이드도 보존한다. Qwen 단위당 이미지 최대 3개.
- `sharp@0.35.3`은 기존 설치 버전을 직접 의존성으로 선언했다. Tesseract 바이너리와 eng/kor 데이터는 worker runtime에 별도로 설치해야 한다.
- `20261021064039_insight_reports.sql`: 영속 분석 상태·lease·재시도·owner별 동시 작업 제한·비용 예약·확정 불변성·이미지 삭제 outbox. 대화도 최초 승인 상한 안에서만 실행한다. `spent_usd`는 실제 청구 금액이 아니라 보수적으로 예약한 상한 누계다.
- 플랫폼: `/admin/insights?material=…`, 전체 요약/슬라이드별/질문/AI 대화·요약, PIN 선택과 원본 근거 이동, 강사 이미지 확인 후 확정. 파일 카드와 종료 리포트에서 진입한다. 생성 완료 카드에는 요청한 Figma 인사이트 아이콘을 추가했다.
- 네 가지 export API는 확정된 canonical과 마지막 요약 revision을 공통 입력으로 쓴다. PDF는 NanumGothic 정적 글꼴 전체를 포함한다. 가변 글꼴 및 subset 조합의 한글 누락을 실제 렌더로 발견해 교체했다. DOCX/PPTX 이미지 비율도 유지한다.
- 별도 로컬 합성 계정에서 실제 Spring REST → 소유권 검증 → snapshot → Groq Qwen/GPT-OSS → canonical → 대화/요약 → 확정 → 4종 다운로드를 확인했다. 개발 서버의 export 모듈이 이전 버전을 유지해 최종 PDF는 새 production build의 로컬 API에서 재검증했다.
- 브라우저: 폴더 grid/list와 리포트 링크, 자료 관리/플레이어 진입, 노트 저장, 폴더 패널 접기, 질문 패널 키보드 resize, 인사이트 탭/질문/PIN/대화/확정 확인. Orca 입력 명령 일부가 페이지에 반영되지 않아 해당 검증은 DOM 이벤트로 수행했다. 실제 viewport 1291×838에서 페이지 가로 넘침 없음. 모바일 실기기 및 다중 슬라이드 실자료 회귀는 별도다.
- 최종 검사: Node 14개 테스트(생략 없음), lint/build, 두 SQL 테스트, DB lint 통과. 미인증 조회 401, 다른 강사 조회·다운로드 404, 확정 후 수정 409를 로컬 API에서 확인했다.
- 테스트 명령: `INSIGHT_OCR_SMOKE=1 INSIGHT_EXPORT_SMOKE=1 node --experimental-strip-types --test app/_model/insight-evidence.test.ts app/_service/insight-*.test.ts app/api/admin/ai-reports/source/route.test.ts app/api/admin/ai-reports/snapshots/route.test.ts`. PDF 텍스트와 페이지 경계 검사는 Poppler, Office 파일 검사는 unzip을 사용한다.
- 격리 `insight_snapshot_check`의 전체 FE migration reset 및 두 SQL 테스트(`insight_snapshots.sql`, `insight_reports.sql`) 통과. 로컬 앱 스택에는 두 신규 migration과 테스트 계정/자료만 추가했다. 운영 DB 및 Spring 코드는 수정하지 않았다.

## 실행과 남은 출시 조건

- 로컬 API: `.env.local`의 기존 Groq 키와 로컬 Supabase를 사용한다. 추가 서버 변수는 `SUPABASE_SERVICE_ROLE_KEY`, 임의의 충분히 긴 `INSIGHT_QUOTE_SECRET`, `INSIGHT_AI_ENABLED=true`다.
- 실제 사용자 데이터는 Groq 조직의 ZDR 설정을 확인한 뒤 `INSIGHT_GROQ_ZDR_CONFIRMED=true`로 활성화한다. 확인 전에는 로컬 Supabase에 한해서 `INSIGHT_TEST_OWNER_ID`로 지정한 합성 계정만 분석할 수 있다. 테스트용 값은 운영에서 사용하지 않는다.
- worker: Node 22.18+, Tesseract 5 + eng/kor, Poppler 설치 후 `npm run insights:worker`. 환경변수를 주입한 별도 런타임은 `node --experimental-strip-types scripts/insight-worker.ts`. 웹 서버와 별도 프로세스로 계속 실행해야 한다. 창을 닫아도 DB 작업은 유지되고, worker 재시작 시 lease 만료 작업을 재개한다.
- 정리 worker는 만료된 미연결 snapshot과 삭제 outbox를 처리한다. report 삭제 뒤 15분 유예하여 아직 종료 중인 worker의 이미지 업로드와 충돌하지 않게 한다. 원본 삭제 알림이 없는 REST 우회이므로 원본 삭제 후 즉시 정리는 보장하지 않는다.
- 운영 migration 적용, private worker 상시 실행/인증된 배포 구성, 조직 ZDR 확인, 합의된 출시용 실제 자료 평가가 남아 있다. 로컬 합성 성공은 운영 검증이 아니다. DOCX/PPTX는 다운로드와 ZIP/XML/내용 보존을 검사했으며 실제 Office 시각 검수는 미실시다.

참고: [Supabase 권한/RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Tesseract TSV](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html), [sharp composite](https://sharp.pixelplumbing.com/api-composite/).
