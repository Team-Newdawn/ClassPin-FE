#!/usr/bin/env bash
# Cloud Run 배포. NEXT_PUBLIC_* 는 클라이언트 번들에 박히는 값이라 런타임 env 가
# 아니라 빌드 인자로 넘겨야 한다. 운영 값은 .env.production.local 에서 읽는다.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.production.local ]]; then
  echo "error: .env.production.local 이 없습니다. 운영 빌드에 필요한 NEXT_PUBLIC_* 값을 읽을 수 없습니다." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.production.local
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?.env.production.local 에 NEXT_PUBLIC_SUPABASE_URL 이 필요합니다}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?.env.production.local 에 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요합니다}"

if [[ "$NEXT_PUBLIC_SUPABASE_URL" == http://127.0.0.1:* || "$NEXT_PUBLIC_SUPABASE_URL" == http://localhost:* ]]; then
  echo "error: 운영 배포에는 로컬 Supabase URL을 사용할 수 없습니다." >&2
  exit 1
fi

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
: "${PROJECT:?GCP_PROJECT 를 설정하거나 gcloud config set project 를 먼저 실행하세요}"

# asia-northeast3(서울)은 Cloud Run 도메인 매핑을 지원하지 않는다. 지원 리전 중
# 한국에서 가장 가까운 곳이 도쿄다.
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE="${SERVICE_NAME:-pin-class}"
REPO="${ARTIFACT_REPO:-pin-class}"
APP_URL="${DEPLOY_APP_URL:-https://pin.newdawn.co.kr}"
DATA_MODE="${NEXT_PUBLIC_DATA_MODE:-supabase}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"

echo "==> 이미지 빌드: ${IMAGE}"
gcloud builds submit \
  --project "$PROJECT" \
  --config cloudbuild.yaml \
  --substitutions "_IMAGE=${IMAGE},_APP_URL=${APP_URL},_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL},_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY},_DATA_MODE=${DATA_MODE}"

echo "==> Cloud Run 배포: ${SERVICE} (${REGION})"
# 변환 한 건이 vCPU 수만큼 pdftoppm 을 띄우므로 동시성을 2 로 묶는다. 기본값(80)
# 이면 서로 CPU 를 뺏어 한 건당 시간이 오히려 늘고, 메모리도 수백 MB 씩 겹친다.
# 4 vCPU × 최대 3개면 리전 CPU 할당량 안에서 롤링 배포 여유도 남는다.
exec gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 4 \
  --no-cpu-boost \
  --timeout 3600 \
  --concurrency 2 \
  --max 3 \
  --max-instances 3 \
  --set-env-vars "^@^NEXT_PUBLIC_APP_URL=${APP_URL}@NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}@NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}@NEXT_PUBLIC_DATA_MODE=${DATA_MODE}" \
  "$@"
