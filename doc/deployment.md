# 배포 — Cloud Run + pin.newdawn.co.kr

## 왜 Cloud Run인가

`/api/convert`가 `soffice`(PPT→PDF)와 `pdftoppm`(PDF→JPEG)을 직접 실행하기 때문에
Vercel·Cloudflare Workers 같은 서버리스 런타임에는 올라가지 않는다. 컨테이너가 필요하다.

컨테이너를 무료로 돌릴 수 있는 곳 중에서:

- **Fly.io** — 2024년에 무료 티어가 없어졌다. 신규 가입자는 2 VM-시간 체험만 주어진다.
- **Render 무료** — 512MB / 0.1 CPU. LibreOffice 변환이 메모리 부족으로 죽는다.
- **Oracle Always Free** — 평생 무료지만 리전 용량 부족으로 인스턴스 생성이 실패하는
  경우가 잦고, VM 관리를 직접 해야 한다.
- **Cloud Run** — 월 200만 요청 + 360,000 GiB-초가 상시 무료. 요청이 없으면 0으로
  줄어들어 과금되지 않는다. 영구 디스크가 없다는 제약은 슬라이드를 Supabase
  Storage에 두는 것으로 해소했다.

리전은 **asia-northeast1(도쿄)** 이다. 서울(asia-northeast3)이 더 가깝지만
Cloud Run 도메인 매핑을 지원하지 않는다.

## 슬라이드가 저장되는 곳

`/api/convert`는 변환한 JPEG를 그 자리에서 `lecture-slides` 버킷의
`{uid}/{uploadId}/{slideId}.jpg`에 올리고 공개 URL을 돌려준다.

호출자의 access token을 그대로 서버에 전달해 그 사용자 권한으로 업로드하므로,
경로의 첫 폴더가 본인 것인지는 storage RLS 정책이 검증한다. 서비스 키는 쓰지 않는다.

컨테이너 디스크에 쓰는 경로도 남아 있지만 Supabase를 설정하지 않은 로컬 실행
전용이다. 배포 환경에서는 타지 않는다.

## 현재 배포 상태

| | |
|---|---|
| GCP 프로젝트 | `pin-project-503023` |
| 서비스 | `pin-class` (asia-northeast1) |
| URL | https://pin-class-181304437134.asia-northeast1.run.app |
| 이미지 | `asia-northeast1-docker.pkg.dev/pin-project-503023/pin-class/pin-class` |

## 최초 설정 (완료됨 — 새 환경에서 재현할 때만 필요)

```bash
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create pin-class --repository-format=docker --location=asia-northeast1
```

신규 프로젝트에서는 Cloud Build가 쓰는 컴퓨트 기본 서비스 계정에 권한이 자동으로
붙지 않는다. 빌드가 `storage.objects.get` 거부로 실패하면 다음을 부여한다:

```bash
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
  --role=roles/storage.objectAdmin
```

`roles/artifactregistry.writer`, `roles/logging.logWriter`도 같은 방식으로 필요하다.

## 배포

```bash
./scripts/deploy.sh
```

`.env.local`에서 `NEXT_PUBLIC_*`을 읽어 빌드 인자로 넘긴다. 이 값들은 클라이언트
번들에 그대로 박히기 때문에 런타임 env로는 늦다 — 반드시 이미지를 구울 때 들어가야 한다.

기본 강의 기능만 배포할 때는 `SUPABASE_SECRET_KEY`가 필요하지 않다. AI 강사 리포트를
활성화하면 소유자 요청으로 고정 snapshot을 만들고 private evidence를 읽는 서버 API와
worker에 이 키가 필요하다. 브라우저 번들·`.env`·이미지·build arg에 넣지 말고 Secret
Manager의 서로 분리된 app/worker runtime 주입으로만 제공한다.

## AI 강사 리포트 운영 반영

AI 리포트는 기존 public app 안에서 OCR과 모델 호출을 실행하지 않는다. 앱은 요청을
검증하고 Cloud Tasks에 작은 작업 식별자만 넣으며, Tesseract OCR·ImageMagick 가림·AI
분석은 별도 private `pin-class-ai-worker` Cloud Run 서비스가 처리한다. 생성 화면의 상태와
최근 리포트 목록은 DB를 폴링하므로 브라우저를 닫아도 작업이 계속된다.

운영 반영은 다음 순서를 지킨다.

1. `AI_REPORT_ENABLED=false` 상태로 `20260906170431_ai_instructor_reports.sql` migration을 먼저 적용한다.
2. Secret Manager에 Supabase secret key, OpenRouter key, 32자 이상의 quote HMAC key를 각각 별도 secret으로 만든다.
3. `classpin-ai-reports` Cloud Tasks queue와 전용 task OIDC service account를 만든다. task 계정에는 private worker의 `roles/run.invoker`만 준다.
4. app과 worker에 서로 다른 runtime service account를 사용한다. 두 계정에는 queue enqueue와 task OIDC 계정 사용에 필요한 최소 권한만 준다.
5. `services/ai-report-worker/cloudbuild.yaml`로 worker 이미지를 빌드하고 unauthenticated invocation 없이 배포한다.
6. app runtime에는 queue·worker URL과 quote/가격 설정을, worker에는 동일한 model/provider fingerprint와 호출별 비용 상한을 넣는다. `AI_REPORT_PRICING_AT`은 배포 시점 기준 24시간 이내여야 한다.
7. 별도 테스트 자료로 snapshot → 모든 슬라이드 분석 → 합성 → critic → 근거 이미지 조회를 확인한 뒤에만 `AI_REPORT_ENABLED=true`로 새 app revision을 배포한다.

운영에 필요한 비밀이 아닌 설정 이름은 `.env.example`에 정리되어 있다. generation과 critic은
서로 다른 model family와 고정 provider를 사용하며 자동 fallback, provider data collection,
prompt caching을 허용하지 않는다. 장애 시에는 `AI_REPORT_ENABLED=false` → queue pause → worker
scale-to-zero 순서로 새 호출을 막고 기존 ready 리포트 조회는 유지한다.

## 도메인 연결

`newdawn.co.kr`은 Cloudflare 네임서버를 쓰고 있다.

1. 도메인 소유 확인 (최초 1회):
   ```bash
   gcloud domains verify newdawn.co.kr
   ```
   Search Console이 열리면 안내하는 TXT 레코드를 Cloudflare DNS에 추가한다.

2. 매핑 생성:
   ```bash
   gcloud beta run domain-mappings create --service pin-class --domain pin.newdawn.co.kr --region asia-northeast1
   ```
   출력된 CNAME 레코드(보통 `ghs.googlehosted.com`)를 Cloudflare에 추가한다.

3. Cloudflare에서 이 레코드는 **회색 구름(DNS only)** 으로 둔다. 주황색 프록시를 켜면
   Google의 인증서 검증 요청이 가로채여 발급과 갱신이 실패한다. 같은 이유로
   SSL/TLS → Edge Certificates의 "Always Use HTTPS"도 꺼야 한다.

인증서 발급까지 보통 15분, 길면 24시간 걸린다.

### 알아둘 제약

Cloud Run 도메인 매핑은 아직 Preview이고 Google은 프로덕션 용도로 권장하지 않는다
(매핑 계층이 지연을 더한다). 트래픽이 늘어 이 지연이 문제가 되면 두 가지 대안이 있다:

- **Firebase Hosting**을 앞에 두기 — GA이고 무료 티어가 있다. 전송량 한도(일 360MB)가
  있지만 슬라이드 이미지는 Supabase에서 직접 나가므로 HTML/JS만 계산하면 된다.
- **Global External Application Load Balancer** — 프로덕션 정석이지만 월 $18 정도 든다.

## 무료 한도를 넘지 않으려면

`scripts/deploy.sh`가 `--max-instances 3`, `--concurrency 8`로 배포한다.
concurrency를 낮게 잡은 이유는 LibreOffice 변환 한 건이 수백 MB를 쓰기 때문이다.
기본값(80)이면 동시 업로드 몇 개만으로 인스턴스가 OOM으로 죽는다.

상시 무료 한도는 월 360,000 GiB-초 — 2GiB 인스턴스 기준 약 50시간의 실제 처리
시간에 해당한다. 요청을 처리하지 않는 동안은 CPU가 할당되지 않아 과금되지 않는다.
