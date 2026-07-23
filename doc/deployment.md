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

## 최초 설정

```bash
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create pin-class --repository-format=docker --location=asia-northeast1
```

## 배포

```bash
./scripts/deploy.sh
```

`.env.local`에서 `NEXT_PUBLIC_*`을 읽어 빌드 인자로 넘긴다. 이 값들은 클라이언트
번들에 그대로 박히기 때문에 런타임 env로는 늦다 — 반드시 이미지를 구울 때 들어가야 한다.

`SUPABASE_SECRET_KEY`는 코드 어디서도 쓰지 않으므로 Cloud Run에 설정하지 않는다.

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
