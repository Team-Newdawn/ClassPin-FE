# AI 강의자 리포트 시스템 명세

- Artifact: `ai-report-system`
- Status: `reviewed`
- Source: `doc/pin_class_prd.md`
- Depends on: `ai-report-product`, `ai-report-evidence`
- Decision boundary: 리포트 영속성, 소유자 권한, API, 비동기 실행, AI 제공자 경계, 개인정보 보호, 재시도·멱등성, 관측 가능성, 비용 통제와 운영 배포

이 문서는 승인된 제품 흐름과 근거 의미를 구현하는 시스템 경계를 정의한다. 화면 구성과 근거 판정 규칙은 각각 `ai-report-product`, `ai-report-evidence`를 따르며 이 문서에서 재정의하지 않는다.

## 1. 시스템 원칙과 구성

- `AIR-SYS-001` Supabase Postgres를 리포트 상태, snapshot, canonical 분석, revision, 검증 결과와 비용 기록의 권위 원본으로 사용한다.
- `AIR-SYS-002` 기존 공개 `pin-class` Cloud Run 서비스는 소유자 API와 UI를 제공하고, OCR·이미지 가림·AI 호출은 별도의 비공개 `pin-class-ai-worker` Cloud Run 서비스에서 실행한다.
- `AIR-SYS-003` 운영 비동기 실행은 Cloud Tasks 한 queue를 사용한다. 브라우저 요청, Supabase Realtime 이벤트 또는 Cloud Run 메모리를 작업 권위 원본으로 사용하지 않는다.
- `AIR-SYS-004` 외부 AI의 첫 adapter는 OpenRouter로 고정하되, snapshot·검증·영속성 계층은 제공자 응답 형식에 직접 의존하지 않는다.
- `AIR-SYS-005` 첫 버전에는 별도 Vector DB, Graph DB, Redis, 공개 리포트 서비스, 이메일 전송, Course Brain/RAG, 자동 모델 선택과 다중 제공자 fallback을 추가하지 않는다.
- `AIR-SYS-006` 외부 AI 호출은 DB transaction 밖에서 실행한다. DB transaction은 snapshot 생성, 작업 claim, 상태 전이와 확정처럼 짧은 원자 작업에만 사용한다.

운영 흐름은 다음과 같다.

```text
소유자 UI
  -> 인증된 Next.js API
  -> Postgres에 snapshot/report/job 기록
  -> Cloud Tasks
  -> 비공개 AI worker
       -> 원본 이미지 checksum 확인
       -> 로컬 OCR·가림·crop
       -> OpenRouter 생성 모델
       -> 코드 검증
       -> OpenRouter 비평 모델
       -> Postgres 결과 기록
  -> UI가 상태 API polling으로 결과 조회
  -> 확정본만 서버에서 PDF를 일시 생성해 응답
```

## 2. 영속 모델과 불변성

- `AIR-SYS-010` 한 `ai_reports` 행은 하나의 고정된 근거 snapshot을 사용하는 리포트 버전이다. 새 데이터로 다시 생성하면 새 행을 만들고 `supersedes_report_id`로 이전 버전을 연결한다.
- `AIR-SYS-011` 관계형 행은 리포트·자료·슬라이드의 소유권, 정렬, 상태와 source mapping을 보존하고, 각 슬라이드의 PIN·질문·답변·반응 snapshot은 version이 명시된 JSONB 객체로 저장한다.
- `AIR-SYS-012` canonical 분석과 revision 표현도 version이 명시된 JSONB로 저장하며 애플리케이션의 strict JSON Schema 검증을 통과한 값만 기록한다. 첫 버전에는 JSON 내부 검색이 없으므로 GIN index를 만들지 않는다.
- `AIR-SYS-013` snapshot에는 외부 전송용 material·slide·question alias와 서버 내부 source mapping을 함께 보존한다. adapter에는 alias만 전달한다.
- `AIR-SYS-014` 성공한 slide 분석과 revision은 append-only로 취급한다. 확정 transaction은 준비 완료 revision을 잠그고 `confirmed_revision_id`를 한 번만 설정한다.
- `AIR-SYS-015` 확정 후에는 새 job·revision·canonical 변경을 DB 상태 전이 함수와 constraint/trigger가 거부한다. 같은 revision의 중복 확정은 성공으로 처리하고 다른 revision으로의 재확정은 충돌로 처리한다.

첫 버전의 최소 테이블은 다음 여섯 개다.

| 테이블 | 책임 |
| --- | --- |
| `ai_reports` | owner, 선택 종류, folder snapshot, 이전 버전, cutoff, 상태·진행률, source 수, 비용, model/prompt/schema fingerprint, canonical 결과, 현재·확정 revision |
| `ai_report_materials` | 선택된 material와 material version, snapshot alias·순서·제목·checksum·source fingerprint |
| `ai_report_slides` | source slide mapping, 순서·checksum, 불변 질문 snapshot JSONB, 비식별화 객체 경로, 처리 상태, slide 분석·코드 검증·비평 결과·사용량 |
| `ai_report_revisions` | revision 번호, 종류, 대상 범위, 수정 지시, 이전 revision, 표시 결과, 검증·비평 결과, 비용·사용량 |
| `ai_report_jobs` | 생성·재시도·revision 작업, idempotency key, 단계, attempt, 기대·완료 unit 수, 안전한 오류 코드와 lease |
| `ai_report_storage_cleanup` | 삭제된 report의 결정론적 비공개 Storage prefix를 외부 객체 삭제 완료까지 보존하는 내부 cleanup outbox |

- `AIR-SYS-016` 식별자는 기존 스키마와 같이 UUID, 시각은 `timestamptz`, 비용은 부동소수점이 아닌 `numeric`, 상태는 명시적 CHECK가 있는 `text`를 사용한다.
- `AIR-SYS-017` 모든 FK 열에 index를 두고, 리포트 목록은 `(owner_id, created_at desc, id desc)`, slide unit은 `(report_id, ordinal)`, 미완료 unit은 `(report_id, processing_status)` partial index를 사용한다.
- `AIR-SYS-018` revision은 `(report_id, revision_no)`, 생성 idempotency는 `(owner_id, idempotency_key)`로 unique하게 만든다. 한 report에 실행 중인 job이 하나만 존재하도록 active 상태 partial unique index를 둔다.
- `AIR-SYS-019` 목록 API는 offset이 아니라 `(created_at, id)` keyset cursor를 사용한다. 목록·상태 조회는 큰 JSONB 열을 select하지 않고 필요한 projection만 읽는다.

## 3. snapshot과 새 데이터 판정

- `AIR-SYS-020` 생성 API는 소유권을 재검증한 뒤 하나의 DB transaction에서 cutoff 시각을 정하고 선택 material version, slide, PIN 좌표, 질문 원문·카테고리·상태, 시간순 답변, 공감 수를 batch snapshot으로 복사한다.
- `AIR-SYS-021` snapshot transaction은 중복 material을 제거하고 정렬된 alias, code metric, 전체 snapshot hash를 계산한다. 네트워크·Storage·AI 호출은 이 transaction에 포함하지 않는다.
- `AIR-SYS-022` 기존 업로드의 렌더 JPEG를 재사용하므로 재업로드나 원본 PPT/PDF text 추출을 요구하지 않는다. worker는 저장된 source checksum과 실제 다운로드 bytes가 다르면 전체 생성을 실패시킨다.
- `AIR-SYS-023` snapshot은 선택 material version, 정렬된 slide id·checksum, 질문·답변·반응의 값과 folder 전체 선택 당시의 material membership으로 결정론적 source fingerprint를 만든다.
- `AIR-SYS-024` `새 데이터 있음`은 report 상세 진입·새로고침·탭 재활성화 시 현재 source fingerprint를 하나의 batched query로 다시 계산해 비교한다. 모든 live write마다 공통 material/folder 행을 갱신하는 hot counter는 만들지 않으며, polling 상태 조회마다 fingerprint를 재계산하지 않는다. material 삭제는 새 데이터 표시가 아니라 report 삭제 경계를 따른다.
- `AIR-SYS-025` snapshot 이후 source가 변경돼도 기존 report와 revision은 변경하지 않는다. 새 데이터 생성은 같은 선택 범위와 새 idempotency key로 새 `ai_reports` 행을 만든다.

## 4. 인증, 권한과 RLS

- `AIR-SYS-030` 모든 브라우저 API는 Bearer access token을 받고 Supabase `auth.getUser()`로 서버에서 검증한다. 익명 user, profile이 `admin`이 아닌 user와 만료 token을 거부한다.
- `AIR-SYS-031` request body의 owner id를 신뢰하거나 받지 않는다. snapshot 선택, report 조회·revision·확정·PDF·삭제마다 인증 user와 source/report owner가 같은지 서버와 DB에서 확인한다.
- `AIR-SYS-032` 모든 report public table에 RLS를 활성화한다. owner-facing table의 select policy는 `(select private.is_admin())`과 `(select auth.uid()) = owner_id`를 모두 요구하고 RLS 열에는 index를 둔다. 내부 job·cleanup table은 service role 외의 policy를 만들지 않는다.
- `AIR-SYS-033` `anon`에는 어떤 report table·function·Storage 객체 권한도 주지 않는다. `authenticated`에는 owner-facing report·revision SELECT만 명시적으로 GRANT하고 INSERT·UPDATE·DELETE는 주지 않는다. 새 테이블의 Data API 노출을 default privilege에 의존하지 않는다.
- `AIR-SYS-034` 쓰기는 인증·소유권·상태를 검증하는 Next.js API와 private worker만 수행한다. 원자 snapshot·claim·complete·confirm 함수는 `service_role`에만 EXECUTE를 부여하고 `PUBLIC`, `anon`, `authenticated`에서 revoke하며 고정된 빈 `search_path`를 사용한다.
- `AIR-SYS-035` Supabase secret/service key는 브라우저 코드, `NEXT_PUBLIC_*`, Cloud Tasks payload와 log에 넣지 않는다. Secret Manager에서 public app의 서버 runtime과 private worker에만 주입한다.
- `AIR-SYS-036` service role은 RLS를 우회하므로 privileged 경로는 report owner와 허용 상태를 명시적으로 비교하고 DB constraint/trigger를 함께 적용한다.
- `AIR-SYS-037` owner용 상세 API는 snapshot의 participant 식별자·source mapping·내부 prompt·내부 오류를 제거한 DTO만 반환한다.

## 5. 소유자 API 계약

모든 mutation은 JSON body 크기 제한, UUID 형식, 중복 선택, 문자열 길이와 허용 상태를 서버에서 검사한다.

| API | 계약 |
| --- | --- |
| `POST /api/admin/ai-reports/preflight` | 선택 소유권, 지원 한도, source 수·fingerprint와 최신 model 가격을 계산하고 10분 만료 HMAC quote를 반환 |
| `POST /api/admin/ai-reports` | quote와 client idempotency key를 재검증하고 snapshot/report/job을 만들며 `202` 반환 |
| `GET /api/admin/ai-reports` | owner 목록을 keyset pagination으로 반환 |
| `GET /api/admin/ai-reports/{id}` | 상태, progress, 현재 결과, revision 목록과 안전한 오류를 반환; 상세 진입 시 `freshness=1`로 new-data fingerprint를 함께 검사 |
| `POST /api/admin/ai-reports/{id}/retry` | 실패한 report에 새 job attempt를 만들되 같은 snapshot/report를 재사용 |
| `POST /api/admin/ai-reports/{id}/revisions/preflight` | 수정 대상과 지시 길이, 예상 비용과 실행 가능 상태를 확인 |
| `POST /api/admin/ai-reports/{id}/revisions` | quote를 검증하고 성공한 canonical claim 집합을 사용하는 revision job을 생성 |
| `POST /api/admin/ai-reports/{id}/confirm` | 준비 완료 revision을 원자적으로 확정; active job이 있으면 거부 |
| `GET /api/admin/ai-reports/{id}/pdf?view=A|B` | 확정 revision을 같은 renderer로 일시 PDF 생성·stream하고 저장하지 않음 |
| `DELETE /api/admin/ai-reports/{id}` | report DB 행을 삭제하고 private Storage cleanup outbox를 기록 |

- `AIR-SYS-040` preflight HMAC quote에는 owner, selection hash, source fingerprint, 수량, 가격 snapshot, 비용 범위, 만료 시각과 operation 종류를 포함한다. create 시 값이 달라졌거나 만료됐으면 새 preflight를 요구한다.
- `AIR-SYS-041` idempotency key 재사용 시 같은 request이면 기존 report/job을 반환하고 다른 payload이면 `409`를 반환한다.
- `AIR-SYS-042` 사용자 오류 응답은 안정된 code와 재시도 가능 여부만 제공한다. provider 이름, prompt, stack, database 오류와 secret은 응답하지 않는다.
- `AIR-SYS-043` active 상태는 2초 간격으로 polling하고 탭이 숨겨지면 10초로 낮추며 terminal 상태에서 중단한다. 상태 API는 ETag/조건부 요청을 지원한다. 첫 버전에 report Realtime publication을 추가하지 않는다.
- `AIR-SYS-044` 페이지 재진입은 항상 DB 상태를 다시 읽으며 브라우저 localStorage를 report 권위 원본이나 완료 신호로 사용하지 않는다.

## 6. 비동기 단계와 상태 전이

- `AIR-SYS-050` 최초 report 상태는 `queued -> preparing -> analyzing -> synthesizing -> criticizing -> ready`이며 terminal은 `ready`, `failed`, `confirmed`, `deleting`이다. UI는 내부 단계를 승인된 제품 상태인 `분석 중`으로 묶어 표시한다.
- `AIR-SYS-051` coordinator가 각 slide에 안정된 ordinal과 alias를 부여하고 slide unit task를 fan-out한다. Cloud Tasks payload에는 job id, stage와 unit alias만 넣고 강의 내용·이미지·질문을 넣지 않는다.
- `AIR-SYS-052` slide unit은 source checksum 확인, 로컬 OCR·가림, overlay·crop 생성, 생성 모델의 strict structured 분석, 결정론적 검증, 별도 비평 모델 검증 순서로 처리한다.
- `AIR-SYS-053` 모든 slide unit이 정확히 한 번 성공 상태가 된 후에만 global synthesis를 시작한다. synthesis는 검증된 slide 결과와 code metric만 입력받고, 코드 검증 후 별도 global critic을 통과해야 한다.
- `AIR-SYS-054` global critic이 통과하면 canonical 결과와 최초 revision을 한 transaction으로 기록하고 report를 `ready`로 전환한다. 하나의 slide라도 최종 실패하면 부분 결과를 노출하지 않고 report 전체를 `failed`로 전환한다.
- `AIR-SYS-055` revision job은 원본 이미지를 다시 분석하지 않고 확정 전 canonical claim과 선택 revision만 사용한다. 허용 범위 결정론 검증과 별도 critic을 통과한 경우에만 새 revision을 append한다.
- `AIR-SYS-056` revision 생성 중에도 `ai_reports`의 현재 ready revision을 유지한다. 실패·거부된 revision job은 현재 revision과 canonical을 변경하지 않는다.
- `AIR-SYS-057` worker는 외부 호출 전후에 긴 row lock을 유지하지 않고 `where status = expected_status and lease_expires_at < now()` 조건부 update로 unit/job을 claim한다.

## 7. Cloud Tasks 멱등성, 재시도와 복구

- `AIR-SYS-060` Cloud Tasks task name은 `job id + stage + unit alias`의 결정론적 hash로 만든다. task 생성 중복은 성공과 동일하게 처리하지만 worker는 중복 전달을 전제로 설계한다.
- `AIR-SYS-061` handler는 원자 claim에 실패했거나 unit이 이미 성공·terminal이면 외부 AI를 호출하지 않고 `2xx`를 반환한다.
- `AIR-SYS-062` timeout, network, `429`, provider `5xx`와 유효한 structured output을 만들지 못한 경우만 최대 3회 지수 backoff로 재시도한다. 인증·소유권·source checksum·privacy·hard cost·policy 위반은 재시도하지 않는다.
- `AIR-SYS-063` 실패한 수동 재시도는 새 `ai_report_jobs` 행과 새 task namespace를 만들지만 같은 snapshot/report를 사용한다. 성공한 slide unit은 checksum과 model/prompt/schema fingerprint가 같을 때 재사용한다.
- `AIR-SYS-064` provider가 일반 생성 요청의 idempotency를 보장하지 않으므로 응답 수신 후 DB 기록 전에 process가 중단되는 좁은 구간에는 중복 과금 가능성이 남는다. preflight 상한은 최대 attempt 비용을 포함하고 hard cost cap을 넘는 재호출은 금지한다.
- `AIR-SYS-065` 5분 간격의 비공개 reconcile endpoint는 lease가 만료된 job, DB 기록 후 enqueue되지 않은 job과 cleanup outbox를 복구한다. Cloud Scheduler는 전용 service account의 OIDC로 이 endpoint만 호출한다.

## 8. AI 제공자 adapter와 고정 설정

- `AIR-SYS-070` adapter의 최소 계약은 `generateStructured(input, config)` 하나와 표준화된 `content`, `model`, `provider`, `usage`, `cost`, `requestId`, `latency` 결과다. 생성·비평 역할은 서로 다른 고정 config로 같은 계약을 사용한다.
- `AIR-SYS-071` OpenRouter adapter는 Node 내장 `fetch`를 사용한다. 별도 AI orchestration SDK, agent framework, tool calling, browsing과 코드 실행을 추가하지 않는다.
- `AIR-SYS-072` production config는 `latest`, `auto`, model 배열이 아닌 정확한 model id와 provider allowlist를 지정한다. 생성 모델과 비평 모델은 서로 다른 model family여야 한다.
- `AIR-SYS-073` 모든 요청은 `provider.zdr=true`, `provider.data_collection="deny"`, `provider.allow_fallbacks=false`, `provider.only=[고정 provider]`, `provider.require_parameters=true`를 명시하고 OpenRouter response cache를 명시적으로 끈다.
- `AIR-SYS-074` OpenRouter 계정의 input/output logging과 prompt 저장 opt-in은 비활성화하고 release checklist와 key 회전 절차에서 사람이 확인한다. startup/preflight는 server config와 model endpoint 지원을 검사하며 필수 request 정책을 구성할 수 없으면 생성하지 않는다.
- `AIR-SYS-075` JSON Schema structured output, 비스트리밍 응답, 명시적 timeout과 출력 token 상한을 사용한다. 응답 schema나 provider routing이 요구 조건을 만족하지 않으면 임의 모델이나 덜 엄격한 privacy 경로로 fallback하지 않는다.
- `AIR-SYS-076` model id, provider, prompt version, schema version과 config fingerprint 변경은 이후 report에만 적용한다. 변경 조합은 `AIR-EVID-090`~`099` 평가를 다시 통과하기 전 production에 배포하지 않는다.
- `AIR-SYS-077` slide 이미지·질문·revision 지시는 신뢰하지 않는 데이터로 구분해 prompt에 넣는다. model이 그 안의 명령을 따르거나 외부 URL·tool을 호출할 수 없게 하고 strict output과 source 검증을 신뢰 경계로 삼는다.

## 9. 개인정보, Storage와 삭제

- `AIR-SYS-080` worker가 외부 AI에 보내는 데이터는 비식별화된 slide 이미지·overlay·crop, alias 질문·답변, 좌표, 상태·카테고리, code metric과 필요한 revision 지시뿐이다.
- `AIR-SYS-081` participant·author UUID, 이메일, 세션·인증 정보, 원본 alias mapping, speaker note, access token, Storage signed URL과 내부 오류는 외부 AI에 보내지 않는다.
- `AIR-SYS-082` 자료명·질문·답변·revision 지시는 결정론적 text redaction을 거친다. slide는 worker container 안의 Tesseract OCR과 고정된 탐지 규칙으로 검사·가림하며 외부 OCR을 사용하지 않는다.
- `AIR-SYS-083` OCR engine과 한국어·영어 language data는 worker image에 version을 고정한다. OCR·가림 실패 시 원본 전송, slide 제외 또는 부분 report로 우회하지 않는다.
- `AIR-SYS-084` 파생 자료는 `ai-report-evidence` 비공개 bucket의 `{owner_id}/{report_id}/{slide_alias}/...` prefix에 저장한다. `anon`·`authenticated` Storage policy를 만들지 않고 worker service role만 쓰고 지운다.
- `AIR-SYS-085` owner 증거 화면은 report 소유권 확인 후 서버가 발급한 최대 5분 signed URL만 사용한다. 외부 AI에는 signed URL 대신 worker가 읽은 비식별화 bytes를 request에 직접 포함한다.
- `AIR-SYS-086` report가 존재하는 동안 구조화 결과, revision, 검증·비용 메타데이터와 비식별화된 증거 사본을 보존한다. PDF는 ephemeral disk/memory에서 생성하고 응답 뒤 삭제하며 Storage에 저장하지 않는다.
- `AIR-SYS-087` report, source material 또는 owner account 삭제 시 report DB 행을 삭제하고 cleanup outbox에 private prefix를 남긴다. material 삭제 trigger는 해당 material을 snapshot한 report를 먼저 삭제하며 folder 삭제만으로는 source material이 남아 있는 report를 삭제하지 않는다.
- `AIR-SYS-088` cleanup worker는 prefix의 모든 객체 삭제를 멱등하게 재시도한 뒤 outbox를 지운다. cleanup이 지연되는 동안 bucket은 비공개이고 report API는 삭제된 객체에 URL을 발급하지 않는다.
- `AIR-SYS-089` 확정 report도 source material과 독립적으로 보관하지 않으며 별도 복구·법적 보존·공개 archive 기능은 첫 버전에 두지 않는다.

## 10. 비용, 입력 한도와 과부하 통제

- `AIR-SYS-090` preflight는 선택 자료·slide·질문·crop 수와 생성·slide critic·global synthesis·global critic의 model 가격 snapshot으로 예상 비용의 하한과 상한을 계산한다. 상한에는 최대 재시도 비용을 포함한다.
- `AIR-SYS-091` 가격 정보가 없거나 24시간보다 오래됐으면 생성하지 않는다. report에는 가격 기준 시각, 단가, 예상 범위, 실제 token·image usage와 실제 비용을 저장한다.
- `AIR-SYS-092` 첫 운영 기본값은 추가 확인 임계값 USD 1.00, 사용자 확인으로도 넘을 수 없는 report/revision별 hard cap USD 25.00이다. 값은 server-only 배포 설정으로 조정하고 UI preflight에 현재 값을 표시한다.
- `AIR-SYS-093` OpenRouter API key에도 별도 월간 spend limit을 설정한다. 각 외부 호출 전 누적 실제 비용과 남은 최대 attempt 비용을 비교하고 hard cap을 넘을 수 있으면 호출하지 않는다.
- `AIR-SYS-094` 첫 운영 입력 한도는 material 20개, slide 300장, 전체 질문 5,000개, slide당 질문 100개, revision 20개, revision 지시 2,000자다. 초과 시 정확한 항목과 한도를 preflight에서 알리고 임의 제외·요약·truncation을 하지 않는다.
- `AIR-SYS-095` owner당 active report/revision job은 최대 2개다. queue의 첫 운영값은 초당 dispatch 2, 동시 dispatch 4이며 worker는 4GiB, 2 vCPU, instance concurrency 1, 최대 instance 4로 시작하고 측정 뒤 조정한다.

## 11. 관측 가능성과 성능 경계

- `AIR-SYS-100` 구조화 log와 metric에는 비식별 operation id, stage, status, attempt, queue delay, 처리시간, model/provider id, token·image usage, 비용과 제한된 오류 code만 기록한다.
- `AIR-SYS-101` prompt, completion, 질문·답변 원문, revision 지시, 이미지, OCR 인식 문자열, 이메일·전화번호, access token, service key와 signed URL을 log·trace·error monitoring에 기록하지 않는다.
- `AIR-SYS-102` dashboard는 API p50/p95/p99, queue delay, OCR·slide 생성·비평·합성 latency, 성공률, retry율, validation·privacy 실패율, estimate 대비 actual cost와 cleanup 지연을 분리해 보여준다.
- `AIR-SYS-103` status 단건 조회는 PK index로 O(1), 목록의 다음 page는 keyset index로 page 크기에 비례하게 유지한다. snapshot·source fingerprint·report 생성은 모든 선택 slide와 질문을 읽어야 하므로 O(slides + questions)이며 O(1)로 축소할 수 있다고 가정하지 않는다.
- `AIR-SYS-104` snapshot과 evidence 로드는 array/범위 query와 batch insert로 처리하고 material·slide별 N+1 query를 금지한다. 외부 호출은 bounded queue concurrency로 병렬화하되 최종 정렬은 snapshot ordinal로 결정한다.
- `AIR-SYS-105` release 전 1·10·50·300 slide와 질문 0·1·10·100/slide를 조합하되 전체·slide별 입력 한도 안에 있는 fixture에서 preflight, snapshot, fingerprint, status, queue, slide 단계, 전체 생성과 PDF의 throughput·latency를 측정해 기준선을 기록한다. DB 경로는 `EXPLAIN (ANALYZE, BUFFERS)`로 index scan과 RLS 비용을 확인한다.
- `AIR-SYS-106` 운영 alert는 7일 기준선 대비 queue p95 또는 stage p95가 2배를 넘거나, 실패율 5%, cleanup 지연 30분, estimate 대비 actual cost 125%를 넘을 때 발생시킨다.

## 12. 배포, 비밀과 운영 중단

- `AIR-SYS-110` public app, worker, Cloud Tasks, Cloud Scheduler는 기존 서비스와 같은 `asia-northeast1`에 둔다. worker에는 unauthenticated invocation을 허용하지 않는다.
- `AIR-SYS-111` Cloud Tasks 전용 user-managed service account에 worker의 `roles/run.invoker`만 부여하고 Google-signed OIDC token의 audience를 worker 기본 service URL로 고정한다.
- `AIR-SYS-112` public app runtime과 worker runtime은 별도 service account를 사용한다. app에는 queue enqueue와 필요한 secret 접근, worker에는 queue enqueue와 해당 Supabase/OpenRouter secret 접근만 부여한다.
- `AIR-SYS-113` Supabase secret key, OpenRouter API key와 quote HMAC key는 Secret Manager version으로 주입하고 이미지·소스·`.env`·build arg에 넣지 않는다. 회전 시 새 version 배포 후 이전 version을 폐기한다.
- `AIR-SYS-114` production OpenRouter key와 Supabase project를 로컬 개발에서 사용하지 않는다. 로컬은 CLI Supabase와 별도 test key 또는 deterministic fake provider를 사용하고, 동일 job processor를 실행하는 local worker command로 Cloud Tasks를 대체한다.
- `AIR-SYS-115` emergency stop은 `AI_REPORT_ENABLED=false`, Cloud Tasks queue pause와 worker scale-to-zero 순서로 새 외부 호출을 막는다. 기존 ready/confirmed report 조회와 PDF는 계속 허용한다.
- `AIR-SYS-116` model/provider 장애 때 privacy 조건을 낮추거나 다른 model로 자동 전환하지 않는다. 상태를 실패로 남기고 기존 revision을 보존한 뒤 운영자가 같은 고정 config로 재시도하거나 새 config를 평가·배포한다.

## 13. migration, rollback과 삭제 일관성

- `AIR-SYS-120` forward-only migration은 여섯 report table, source 삭제 trigger, FK·CHECK·index, RLS·명시적 GRANT, private bucket과 제한된 DB 함수를 생성한다.
- `AIR-SYS-121` 기존 report 데이터가 없으므로 report backfill이나 기존 업로드 재처리는 하지 않는다. 기존 material·slide·질문 스키마에는 fingerprint 전용 열이나 write trigger를 추가하지 않는다.
- `AIR-SYS-122` schema migration을 먼저 배포하고 `AI_REPORT_ENABLED=false` 상태에서 worker·app을 배포한 뒤 release fixture와 canary를 통과하면 기능을 활성화한다.
- `AIR-SYS-123` 애플리케이션 rollback은 기능 flag와 queue pause로 수행하고 table·column을 되돌리거나 생성된 report를 삭제하지 않는다. 이전 app version은 새 table을 참조하지 않아야 한다.
- `AIR-SYS-124` source 삭제와 report 삭제는 DB transaction으로 report 행과 cleanup outbox를 함께 기록한다. Storage 삭제 실패는 source 삭제를 되돌리지 않으며 private orphan은 cleanup worker가 제거한다.

## 14. 출시 차단 검증

- `AIR-SYS-130` clean local Supabase reset에서 migration 전체를 재생하고 FK, CHECK, partial unique index, source 삭제 trigger와 cleanup outbox를 검증한다.
- `AIR-SYS-131` 같은 owner, 다른 admin, anonymous participant, 만료 token과 service role 경로로 목록·상세·snapshot·revision·확정·PDF·Storage 접근을 각각 검사한다. 다른 owner나 participant 접근 성공은 출시 차단 실패다.
- `AIR-SYS-132` 중복 create, Cloud Tasks 중복 전달, worker crash, lease 만료, enqueue 누락, `429`·timeout·`5xx`, validation 실패와 수동 retry에서 결과 중복·부분 노출·현재 revision 손실이 없는지 검사한다.
- `AIR-SYS-133` source가 snapshot 중·처리 중·ready 이후 변경 또는 삭제되는 경쟁 조건과 owner account 삭제를 검사하고 snapshot 불변성, new-data 표시, report 삭제와 private 객체 cleanup을 확인한다.
- `AIR-SYS-134` OpenRouter 요청 capture test로 고정 model/provider, ZDR, data collection deny, fallback/cache off, structured output, timeout과 금지 필드 부재를 100% 확인한다.
- `AIR-SYS-135` 비용 quote 만료·source 변경·threshold 확인·hard cap·재시도 상한·monthly key limit을 검사하고 확인되지 않은 비용 상한을 넘는 호출이 한 건도 없어야 한다.
- `AIR-SYS-136` evidence 문서 `AIR-EVID-090`~`109` 전체와 제품 문서 `AIR-PROD-095`~`097`을 통과하기 전 production 기능을 활성화하지 않는다.
- `AIR-SYS-137` PDF와 A/B 화면이 동일한 confirmed revision·claim·metric·비식별화 asset만 사용하는지, PDF 임시 파일이 응답 후 삭제되는지 검사한다.

## 15. 확정된 선택의 결과

- 슬라이드 단위 혼합 저장으로 관계형 무결성과 slide별 병렬·재시도를 유지하면서 질문·답변마다 별도 snapshot table을 늘리지 않는다.
- polling을 선택해 Realtime용 공개 publication과 큰 JSON 변경 방송을 피한다.
- OpenRouter는 제공자 교체 경계 뒤 첫 adapter일 뿐이며 자동 routing·fallback은 사용하지 않는다.
- 별도 private worker와 private bucket으로 기존 공개 app·공개 slide bucket의 경계를 AI 처리에 확장하지 않는다.
- report 처리와 정확한 new-data fingerprint는 입력 크기에 선형이지만, 상태·목록 hot path에는 포함하지 않아 live 질문·반응 쓰기에 공통 counter lock을 추가하지 않는다.
