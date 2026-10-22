# 인사이트 생성에 필요한 백엔드 연결

2026-10-21 확인. FE 작업에서 ClassPin-BE 소스는 읽기만 했으며 수정하지 않았다.

> 후속 결정: 사용자가 백엔드 변경 없는 구현을 선택했다. 현재 구현은 [REST 응답 스냅샷](insights-rest-snapshot.md)을 따른다. 아래 백엔드 변경안은 향후 원자적 캡처가 필요할 때의 참고안이며 현재 선행 조건이 아니다.

## 현재 확인한 계약

- 배포 Swagger `https://ohpinbe.newdawn.co.kr/v3/api-docs`에는 강사 자료 그래프·질문 조회가 있으며 AI snapshot/report 생성 endpoint는 없다.
- `SupabaseLectureRepository.ownedGraph`는 호출자 ID로 `courses.owner_id`를 필터링하고 자료 버전·슬라이드·PIN·답변을 조회한다. FE `inspectInsightSource`는 이 응답을 검증하고 전체 답변 이력을 보존한다.
- `POST /api/admin/ai-reports/source`는 강사 인증과 admin 역할 확인 후 이 그래프를 읽어 수량만 반환한다. 저장 snapshot, 가격 quote, 생성 작업을 만들지 않는다.

## 필요한 원자적 생성 계약

BE의 인증된 강사 경로에 report 생성 transaction을 연결해야 한다. 경로는 FE 공개 `POST /api/admin/ai-reports`와 구분하여 `/api/instructor/ai-reports`로 제안한다. FE가 업무 테이블을 직접 읽어 우회하지 않는다.

입력은 선택 material IDs 또는 folder ID, 서버에서 검증한 quote fingerprint, idempotency key, locale이다. owner는 JWT에서 결정한다. 클라이언트가 보낸 원문·집계·좌표·owner·Storage URL은 받지 않는다. quote 검증을 위한 서버 간 인증과 서명은 배포 전에 계약을 고정해야 한다.

하나의 DB transaction에서 다음을 수행한다.

1. 호출자가 admin이며 선택한 모든 material/course 소유자인지 검사한다. 일부만 권한이 있으면 전체 요청을 거부한다.
2. 자료 20개·슬라이드 300장·질문 5,000개·슬라이드당 질문 100개 제한을 검사한다. 중복 material, 누락/삭제 slide, 이전 version 질문, 잘못된 anchor를 조용히 제외하지 않는다.
3. 동일한 읽기 snapshot에서 cutoff, 최신 material version, source page/image path와 checksum, 정렬된 전체 질문·답변·상태·공감을 복사한다. source 변경과의 일관성을 위해 REPEATABLE READ 등 명시적 격리 수준을 사용한다.
4. `ai_reports`, `ai_report_materials`, `ai_report_slides`, `ai_report_jobs`를 함께 저장한다. 같은 owner/idempotency key의 동일 요청은 기존 report를 반환하고 다른 요청은 409다.
5. 내부 원본 ID mapping과 외부 모델용 alias를 분리한다. speaker note, 수강생 ID, 이메일, 토큰은 모델 입력에 포함하지 않는다. 외부 호출은 transaction 밖에서 실행한다.
6. commit 후 enqueue한다. enqueue 실패 시 저장된 job을 reconcile이 복구한다. 응답은 report ID와 queued 상태만 반환한다.

완료 조건: 타 소유자/익명 차단, 전체 답변 보존, 동시 source 변경·삭제 시 일관성, 멱등성 충돌, source 삭제와 cleanup outbox의 원자 처리. 관련 여섯 테이블·권한·lease·확정은 `ai-instructor-report-system.md`를 따른다. 이 문서는 구현·배포 완료 증거가 아니다.

## worker 활성화 조건

- 고정된 내부 OCR와 한글/영문 데이터, 이미지/PDF 렌더링 및 가림 테스트.
- Groq Qwen 이미지 분석과 GPT-OSS 텍스트 검토. 두 모델 실호출은 합성 이미지로 확인했으며 실자료 정확도나 비식별화 검증을 대신하지 않는다.
- Groq 조직 데이터 보존 설정, 비용 quote·hard cap, 영속 job·lease·재시도·중복 과금 제어.
- 공개되지 않은 worker 인증과 실행 환경. 현재 FE EC2를 Cloud Run으로 이전한다고 가정하지 않는다.
- `criticScope: text_only`, `visualVerification: instructor_required`를 보존하고 강사 확인 후 확정한다.
