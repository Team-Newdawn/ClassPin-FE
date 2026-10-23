# OhPin 서버 용량·병목 분석 (t3.small 1대)

검토일: 2026-10-23. 대상: FE `feature-dev`, BE `Team-Newdawn/ClassPin-BE` `origin/main`(05eadd8), Supabase
`OhPin-project`(ap-northeast-2) advisor, 공개 엔드포인트 외부 측정.

근거 수준을 구분한다.

- **확인**: 코드·배포 설정·advisor·외부 측정에서 직접 읽은 사실.
- **추정**: 요청당 CPU, 메모리 사용량, 트래픽 같은 값. EC2 내부(`free`, `docker stats`)는 아직 측정하지 않았다.
- **확인 필요**: AWS·Supabase 요금제 한도처럼 이 저장소 밖에서 확인해야 하는 값.

## 1. 한 줄 요약

- 지금 규모에서는 CPU가 아니라 **메모리 2 GiB**가 먼저 부족하다. 변환 작업이 수업과 겹치면 OOM으로 API가 끊길 수 있다.
- 강사 100명 기준으로는 동시 수업 수가 결정한다. **동시 30개 정도는 t3.small로 버티지만** 메모리를 정리해야 하고,
  **동시 100개는 1대로 부족하다**(CPU 2 vCPU 초과, Node 이벤트 루프 포화, 대역폭 기준선 근접).
- EC2보다 먼저 막힐 수 있는 곳은 **Supabase Realtime 동시 접속 한도**와 **익명 로그인 IP당 한도**다.

## 2. 현재 구조 (확인)

```
브라우저 ─CF─▶ nginx ─▶ Next(node 1프로세스, 컨테이너 ohpin-fe :3002)
                          ├─ /api/rest/*  ─▶ https://ohpinbe.newdawn.co.kr (다시 CF 경유)
                          │                    ─▶ nginx ─▶ Spring Boot(JVM, ohpin-be :8082)
                          │                         ├─ Supabase Auth /auth/v1/user  (API 요청마다)
                          │                         ├─ profiles 조회                 (강사 요청마다)
                          │                         └─ PostgREST / RPC / Storage
                          ├─ /api/pdf      원본 PDF Range 프록시(요청마다 storage.info + 디스크 캐시)
                          ├─ /api/question-summary  Groq 호출
                          └─ /api/admin/ai-reports  poppler·sharp 렌더 + AI 호출(after())
같은 박스: BE LibreOffice/poppler 변환, Prometheus·Loki·Grafana·Alloy·cAdvisor
EC2를 거치지 않음: Realtime 웹소켓, 1 GiB 원본 업로드(tus), PPT 슬라이드 JPEG(public URL)
```

- FE와 BE는 포트(3002 / 8082 / Grafana 3003)를 나눠 같은 EC2에 올라가 있다고 본다(배포 스크립트 근거, EC2에서 미확인).
- PPT/PPTX 변환은 프로덕션에서 BE(`POST /api/conversions`, 프록시 경유)가 한다. FE `app/api/convert`는 데모 경로다.
- 외부 측정: `/login`, `/v3/api-docs` TTFB 430~530ms. Cloudflare 엣지가 HKG로 잡혔고 TCP 연결만 약 70ms.

## 3. 병목

### 3.1 메모리 (가장 위험)

| 구성 요소 | 상한 설정 (확인) | 사용량 (추정) |
|---|---|---|
| Spring JVM | `-XX:MaxRAMPercentage=70`, 컨테이너 `mem_limit` 없음 → 최대 힙 약 1.4 GB | 평소 300~500MB |
| BE `/tmp` tmpfs `size=3g` | RAM 위 파일시스템. 1 GiB 원본·변환 PDF·JPEG가 메모리에 올라감 | 변환 중 수백 MB~1 GB+ |
| LibreOffice | `CONVERSION_MAX_CONCURRENT` 기본 2 | 1개당 200~600MB |
| Next node | `--max-old-space-size`·컨테이너 상한 없음 | 150~300MB, 인사이트 중 +150~250MB |
| 모니터링 스택 | 합계 상한 1.25 GB | 400~700MB |
| OS·docker·nginx | – | 250~350MB |

평소 1.3~1.8 GB. PPTX 변환 1건이면 2 GiB를 넘는다. 스왑이 없으면 OOM killer가 가장 큰 JVM이나 node를 죽인다.

### 3.2 네트워크

1. **같은 박스 안에서 Cloudflare를 돈다.** `app/api/rest/[...path]/route.ts`가 공개 도메인으로 BE를 부르므로
   API 요청마다 EC2 → CF 엣지 → EC2 왕복, TLS 한 번, nginx 통과 한 번이 더 붙는다.
2. **Cloudflare 100초 타임아웃.** BE 변환 NDJSON은 다운로드·PDF 변환·페이지 수 계산 뒤에 첫 이벤트를 보낸다.
   큰 PPTX는 첫 바이트 전 100초를 넘겨 524로 끊길 수 있다(확인 필요). 브라우저 → `ohpin.newdawn.co.kr` 구간도 CF를
   지나므로 내부 네트워크 전환만으로는 풀리지 않는다. BE가 작업 전에 `{"type":"start"}` 같은 이벤트를 먼저 flush해야 한다.
   FE `streamConversion` 파서는 모르는 type을 무시하므로 FE 변경은 필요 없다.
3. **PDF 바이트를 EC2가 나른다.** `/api/pdf`는 Range 요청마다 `storage.info`(RLS 재확인, 문서화된 결정)를 부르고,
   바이트는 디스크 캐시에서 내보낸다. 참여자 수 × PDF 크기만큼 EC2 송신이 생긴다(`Cache-Control: no-store`라 CF 캐시 없음).
   t3.small 대역폭 기준선은 약 0.128 Gbps이고 5 Gbps는 버스트다(확인 필요).

### 3.3 API 호출 증폭 (확인)

- BE `SupabaseAuthenticationFilter`가 API 요청마다 `/auth/v1/user`를 부르고, 강사면 `profiles`도 부른다.
  Supabase로 가는 호출이 API 요청의 2~3배가 된다.
- 폴링 주기: 참여자 30초(`/state` + `/questions`), 강사 창 5초(`/state` + `/questions` + Supabase 직접 조회 1건),
  질문 broadcast 뒤 참여자 0~10초 jitter 재조회, 리모컨 대화상자 5초.

### 3.4 CPU 크레딧

t3.small 기준 성능은 vCPU당 20%(합계 0.4 vCPU)다. Standard 모드면 크레딧 소진 시 스로틀되고,
Unlimited 모드면 초과분이 과금된다. 현재 모드는 확인 필요.

### 3.5 DB (Supabase advisor, 확인)

- FK 인덱스 누락 9개: `questions.slide_id`, `region_anchors.slide_id`, `materials.course_id`,
  `courses(folder_id, owner_id)`, `answers.author_id` 등.
- 같은 역할·동작에 permissive 정책 여러 개: `questions`, `slides`, `lectures`, `answers` 등 9개 테이블.
- 대시보드 `ownedGraph`가 강사의 강의·자료·슬라이드·노트·질문 전체를 한 번에 가져오고, BE가 이를 문자열 → JsonNode → 직렬화로 세 번 든다.

### 3.6 그 밖

- BE가 모든 API 요청을 INFO 로그로 남긴다. 50 req/s면 하루 약 430만 줄이 메모리 256MB Loki로 간다.
- BE 변환은 슬롯 2개가 차면 대기하지 않고 바로 오류(`All conversion slots are busy`)를 낸다.

## 4. 최적화 우선순위

| 순위 | 작업 | 효과 | 담당 |
|---|---|---|---|
| P0 | FE·BE 컨테이너를 같은 docker 네트워크에 두고 `REST_API_URL=http://ohpin-be:8080` | API마다 CF 왕복·TLS·nginx 1회 제거 | FE 코드·배포, BE compose (7장) |
| P0 | BE `mem_limit: 1g` + `MaxRAMPercentage=40` + `CONVERSION_MAX_CONCURRENT=1`, FE `--memory 1g` + 힙 512MB(실측 뒤 조정) | 한 컨테이너가 박스 전체 메모리를 먹지 못함 | BE 가이드, FE 배포 스크립트 (7장) |
| P0 | BE `/tmp` tmpfs → 디스크 볼륨, 스왑 2 GB | 변환이 RAM을 먹지 않음 | BE 가이드, 서버 1회 (7장) |
| P0 | CPU 크레딧 모드 확인, 크레딧·컨테이너 메모리·OOM 알람 | 스로틀·OOM 감지 | AWS 콘솔, BE alerts (7장) |
| P1 | BE 인증을 로컬 JWT(JWKS) 검증 또는 30초 TTL 캐시로, 강사 profile 캐시 | Supabase 호출 40~50% 감소 | BE 가이드 |
| P1 | FK 인덱스 추가, permissive 정책 병합 | 수업 중 쿼리·RLS 비용 감소 | 마이그레이션 |
| P1 | 모니터링 스택 외부 이전 또는 상한 축소 | 400~700MB 확보 | BE compose |
| P2 | 성공 요청 로그 샘플링(느린 요청·오류만) | Loki 부하 감소 | BE |
| P2 | `ownedGraph`에서 질문 분리·지연 로드 | 대시보드 응답 크기 억제 | FE·BE |

하지 않는다: Next 클러스터링·PM2(지금은 CPU가 남고 메모리만 늘어남), `/api/pdf` 메타데이터 캐시
(요청마다 RLS를 확인한다는 결정과 충돌, 바꾸려면 문서 승인 먼저).

## 5. 강사 100명 기준 용량 분석

### 5.1 가정

- 강사 100명 등록. 강의당 참여자 40명, 수업 50분, 강의당 질문 20개, 슬라이드 넘김 분당 1회.
- 강사는 플레이어 창 + 발표 창 2개를 연다(창마다 5초 폴링).
- 요청당 CPU(추정): API 1건 약 6ms(nginx 2회 + Next 프록시 + Spring + Supabase TLS 2~3회),
  P0 후 약 4.5ms, P0+P1 후 약 3ms. `/api/pdf` 1건 약 2.5ms.
- 참여자는 새 슬라이드마다 PDF Range 요청 약 2건(64KB 청크), 자료 PDF 평균 10MB를 수업 동안 거의 다 본다.
- 시나리오 A: 동시 수업 30개(참여자 1,200명). 시나리오 B: 100명 전원 동시 수업(참여자 4,000명).

### 5.2 트래픽

| 항목 | 계산 | A (30개) | B (100개) |
|---|---|---|---|
| 참여자 폴링 | 참여자 × 2건 / 30초 | 80 req/s | 267 req/s |
| 질문 뒤 재조회 | 강의 × 20/3000초 × 40명 | 8 | 27 |
| 강사 창 폴링 | 강의 × 2창 × 2건 / 5초 | 24 | 80 |
| **API 합계** | | **약 113 req/s** | **약 375 req/s** |
| PDF Range | 강의 × 40명 × 2건 / 60초 | 40 req/s | 133 req/s |
| EC2 → Supabase 호출 | 참여자 2배, 강사 3배, PDF 1배 | 약 290/s | 약 1,000/s |
| Realtime 동시 접속 | 참여자 + 강사 창 | 약 1,260 | 약 4,200 |
| PDF 송신 | 참여자 × 10MB / 50분 | 약 32 Mbps (수업당 12 GB) | 약 107 Mbps (수업당 40 GB) |

정시 수업 시작 때는 참여자 전원이 PDF 앞부분(약 2MB)을 2분 안에 받는다. B면 순간 약 530 Mbps로, 버스트로만 가능하다.

### 5.3 CPU

| | A 지금 | B 지금 | B P0 후 | B P0+P1 후 |
|---|---|---|---|---|
| 박스 전체 | 약 0.8 vCPU | 약 2.6 vCPU | 약 2.0 vCPU | 약 1.5 vCPU |
| Next 1프로세스(코어 1개 한도) | 약 40% | 약 130% | 약 85% | 약 85% |
| 기준 성능 0.4 vCPU 대비 | 2배 | 6.5배 | 5배 | 4배 |

- A: CPU는 충분하다. 크레딧은 시간당 약 23씩 줄어 가득 찬 상태(576)에서 하루 넘게 버틴다.
- B: 지금 구조로는 2 vCPU를 넘는다. Next는 스레드 하나라 코어 1개를 넘을 수 없어 응답이 줄 선다.
  P0·P1을 해도 박스 75%, Next 85%를 계속 써서 변환 하나만 겹쳐도 지연이 터진다.

### 5.4 메모리·변환

- 동시 처리 중인 요청은 B에서도 약 60개(375 req/s × 150ms)라 요청 자체의 메모리는 작다.
- 강사가 늘면 변환이 겹친다. 주 200건(강사당 2건), 저녁 20시간에 몰리고 건당 4분이면 평균 동시 실행 약 0.5건이고,
  피크에 약 8%는 슬롯 2개가 차서 바로 실패한다. 변환이 돌 때마다 3.1의 메모리 위험이 다시 생긴다.
- 인사이트 렌더는 `oneRenderAtATime`으로 하나씩만 돈다. 강사당 하루 2회라 최대 하루 200회다.

### 5.5 EC2 밖의 한도 (확인 필요)

- **Supabase Realtime 동시 접속**: Free 200, Pro 500으로 알고 있다. A(1,260)부터 넘는다. 넘으면 폴링 폴백(15~20초)으로
  바뀌어 API 요청이 늘어난다.
- **익명 로그인 IP당 한도**: 기본 시간당 30회로 알고 있다. 학교 Wi-Fi처럼 학생 수백 명이 공인 IP 하나를 쓰면
  입장이 막힐 수 있다. Supabase Auth 설정에서 확인하고 올린다.
- **송신 비용**: 서울 리전 인터넷 송신 약 $0.126/GB. 강사 100명이 주 3시간씩 가르치면 PDF 송신만 월 약 520 GB(약 $65)로,
  t3.small 인스턴스 비용(월 약 $19)보다 크다.

### 5.6 판정

| 단위 | A (동시 30개) | B (동시 100개) |
|---|---|---|
| Node 1프로세스 | 충분 | 부족. 2프로세스 이상이나 FE 분리 필요 |
| JVM 1프로세스 | 충분 | 프로세스로는 충분(멀티스레드), 박스 CPU가 부족 |
| t3.small 1대 | P0 적용 시 가능. 메모리 여유가 없어 t3.medium(4 GiB) 권장 | 부족. FE/BE 분리 또는 상위 인스턴스, PDF 전달 구조 재검토 |

순서: P0 → 실측 → A 수준이면 t3.medium 한 대로 올리고, 동시 수업이 50개를 넘어가면 FE와 BE를 다른 인스턴스로 나눈다.
PDF를 EC2가 나르는 구조는 B에서 대역폭·비용 모두 가장 먼저 한계에 닿는다. 바꾸려면 "per-participant signed URL 금지,
RLS 매 요청 확인" 결정을 문서에서 다시 정해야 한다.

## 6. 실측으로 확정할 항목

```
ssh <ec2> 'free -m; swapon --show; docker stats --no-stream; nproc'
```

- AWS: CPU 크레딧 모드, `CPUCreditBalance`·`NetworkOut` 추이, FE/BE가 같은 인스턴스인지.
- Supabase: 요금제, Realtime 동시 접속 한도, 익명 로그인 IP당 한도.
- Grafana: 수업 시간 `http.server.requests`와 `ohpin.supabase.request` p95, 컨테이너 메모리 피크.

## 7. P0 변경 명세

### 7.0 바로잡음: "env 1줄"로는 안 된다

FE는 docker 컨테이너 안에서 돈다. 컨테이너의 `127.0.0.1`은 컨테이너 자신이라 호스트의 BE(`127.0.0.1:8082`)에 닿지 않는다.
또 `scripts/prepare-ec2-env.mjs`가 "REST_API_URL cannot use a local backend in production"으로 local 주소를 일부러 막는다.
그래서 두 컨테이너를 같은 사용자 정의 docker 네트워크 `ohpin`에 두고, 컨테이너 이름 `ohpin-be`로 부른다.
트래픽은 호스트 밖으로 나가지 않으므로 HTTP여도 된다. 허용 대상은 정확히 `ohpin-be` 하나다.

### 7.1 FE (이 저장소)

| 파일 | 변경 |
|---|---|
| `app/_infrastructure/server/rest-origin.ts` (신규) | `REST_API_URL` 검사를 한 곳으로 모은다. https는 허용, http는 `localhost`·`127.0.0.1`·`[::1]`·`ohpin-be`만 허용 |
| `app/api/rest/[...path]/route.ts` | 중복 검사를 지우고 `restOrigin()`을 쓴다. 지금은 `catch {}`가 오류를 버리므로, 클라이언트 abort가 아닌 오류는 `console.error`로 남긴다 |
| `app/_service/insight-request.ts` (`readOwnedInsightSource`) | 중복 검사를 지우고 `restOrigin()`을 쓴다 |
| `app/_infrastructure/server/rest-origin.test.ts` (신규) | `http://ohpin-be:8080` 허용, `http://unsafe.example`·경로 포함 주소 거부 |
| `scripts/prepare-ec2-env.mjs` | `REST_API_URL`이 `http:`면 `ohpin-be`만 허용. localhost 금지는 유지(컨테이너에서 닿지 않음) |
| `scripts/deploy-ec2.sh` | `docker network create ohpin 2>/dev/null \|\| docker network inspect ohpin >/dev/null`. `run_options`에 `--network ohpin --memory 1g --env NODE_OPTIONS=--max-old-space-size=512`. `REST_API_URL`이 있으면, 후보가 healthy가 된 뒤 후보 안에서 `${REST_API_URL}/api/`가 401(BE 인증 필터 응답, swagger 설정과 무관)인지 확인하고 아니면 배포 중단. 없으면 공개 주소를 쓰므로 지금처럼 건너뛴다 |
| GitHub secret `ENV_FILE` | BE가 네트워크에 붙은 뒤 `REST_API_URL=http://ohpin-be:8080` 한 줄 추가(전체 재업로드) |

- 검사가 `route.ts`와 `insight-request.ts`에 복사돼 있다. 한쪽만 고치면 API는 되는데 인사이트만 503이 난다. 그래서 한 곳으로 모은다.
  설정 오류와 네트워크 오류가 둘 다 같은 502로 보여 라우트 테스트로는 구분할 수 없다는 것도 이유다.
  `prepare-ec2-env.mjs`는 CI에서 도는 별도 스크립트이고 규칙도 더 엄격(localhost 금지)해서 따로 둔다.
- `--memory-swap`은 쓰지 않는다. `--memory`만 주면 docker 기본값이 그 두 배라 1536m 같은 값을 적을 필요가 없다.
- 기존 health check(`/login`)는 BE 연결을 보지 않는다. 연결 확인을 빼면 `REST_API_URL`이나 네트워크가 틀려도 배포가 성공하고 API만 전부 502가 난다.
  docker health check에 넣지 않는 이유: BE 장애가 FE를 unhealthy로 만들어 배포 롤백이 반복된다. 배포할 때 한 번만 본다.
- 768m·힙 384MB에서 1g·512MB로 올린 이유: 상한은 컨테이너 안의 인사이트용 `pdftoppm`·`pdftotext`·sharp에도 함께 걸린다.
  이를 합치면 768m에 거의 닿고, 넘으면 cgroup이 가장 큰 프로세스인 node를 죽여 모든 수업 API가 10초쯤 끊긴다.
  인사이트 분석 1건을 돌리면서 `docker stats` 피크를 잰 뒤 줄인다. FE 1g + BE 1g는 상한일 뿐 예약이 아니며, 둘이 동시에 차는 경우는 스왑이 받는다.
- 후보 컨테이너도 같은 옵션으로 뜬다. 배포하는 몇 초 동안 FE 두 개가 동시에 떠 있다.

### 7.2 BE (`Team-Newdawn/ClassPin-BE`, 읽기 전용이라 가이드로 전달)

`compose.yml`

```yaml
services:
  api:
    mem_limit: 1g
    # tmpfs는 컨테이너 메모리 cgroup에 잡힌다. 1g 상한과 1 GiB 원본이 같이 들어갈 수 없으므로 디스크로 옮긴다.
    volumes:
      - ohpin-tmp:/tmp
    networks: [default, ohpin]   # default는 Prometheus가 api:8081을 긁는 데 필요
networks:
  ohpin:
    external: true
volumes:
  ohpin-tmp:
```

- `tmpfs: /tmp:size=3g` 블록을 지운다. `read_only: true`는 유지한다(쓰기 가능한 곳은 `/tmp` 볼륨뿐).
- 새 named volume은 이미지의 `/tmp` 권한(1777)을 그대로 이어받는다. 재시작해도 파일이 남는다.
  정상 종료 시에는 `ConversionService`가 `finally`에서 작업 폴더를 지운다. 크래시 잔여물(`ohpin-convert-*`)은 디스크 알람으로 본다.

`Dockerfile`: `-XX:MaxRAMPercentage=70` → `-XX:MaxRAMPercentage=40`. 상한 1g 기준 힙 약 410MB이고,
나머지 약 600MB는 metaspace·스레드와 같은 cgroup에서 도는 `soffice`·`pdftoppm`이 쓴다.

`ENV_FILE`: `CONVERSION_MAX_CONCURRENT=1`. soffice 2개(최대 약 1.2GB)는 1g 상한에 들어가지 않는다.

`scripts/deploy-production.sh`: `compose up` 전에 `docker network inspect ohpin >/dev/null 2>&1 || docker network create ohpin`를 실행한다.
FE와 BE 중 어느 쪽이 먼저 배포돼도 동작하도록 양쪽 스크립트가 모두 만든다.

`monitoring/prometheus/alerts.yml`에 추가:

```yaml
      - alert: OhPinContainerMemoryHigh
        expr: |
          container_memory_working_set_bytes{name=~"ohpin-fe|ohpin-be"}
          / clamp_min(container_spec_memory_limit_bytes{name=~"ohpin-fe|ohpin-be"}, 1) > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: OhPin container memory is above 85% of its limit
      - alert: OhPinContainerOom
        expr: increase(container_oom_events_total{name=~"ohpin-fe|ohpin-be"}[5m]) > 0
        labels:
          severity: critical
        annotations:
          summary: An OhPin container hit its memory limit
```

상한을 넣기 전에는 `container_spec_memory_limit_bytes`가 0이라 첫 규칙이 항상 울린다. 상한과 함께 배포한다.
알림이 실제로 어디로 가는지(Alertmanager·Grafana contact point)도 확인한다.

### 7.3 EC2·AWS (서버에서 한 번)

```bash
df -h /                                   # 볼륨 /tmp에 1 GiB 원본 + PDF + JPEG가 들어갈 여유 확인
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl --system
aws ec2 describe-instance-credit-specifications --instance-ids <instance-id>
```

- Standard 모드면 CloudWatch 알람 `CPUCreditBalance < 60`(15분)을 건다. Unlimited 모드면 `CPUSurplusCreditBalance > 0`을 건다.

### 7.4 적용 순서·확인·되돌리기

1. 서버: 디스크 확인, 스왑, 크레딧 모드와 알람.
2. BE `main` 배포(네트워크·메모리·볼륨·동시 변환 1).
3. FE `dev` 배포(허용 목록, 배포 스크립트). 이때 `REST_API_URL`은 아직 넣지 않는다.
4. `ENV_FILE`에 `REST_API_URL=http://ohpin-be:8080`을 넣고 FE를 재배포한다.
5. 확인:
   - `docker stats --no-stream`에 `ohpin-fe`·`ohpin-be` 상한이 1GiB로 보인다.
   - `docker exec ohpin-fe node -e "fetch('http://ohpin-be:8080/api/').then(r=>console.log(r.status))"` → 401.
   - 강사 로그인 → 폴더 → 자료 열기, 참여자 입장, PPTX 변환 1건.
   - Grafana에서 API p95가 배포 전보다 내려간다.
6. 되돌리기:
   - 4단계는 `ENV_FILE`에서 `REST_API_URL` 줄을 지우고 재배포하면 기본값(공개 HTTPS)으로 돌아간다.
   - 2단계는 BE 배포 스크립트의 이전 이미지 복원을 쓴다.
