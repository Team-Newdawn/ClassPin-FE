#!/usr/bin/env bash
# Fly.io 배포. NEXT_PUBLIC_* 는 클라이언트 번들에 박히는 값이라 런타임 secret 이
# 아니라 빌드 인자로 넘겨야 한다. 그 값들을 .env.local 에서 그대로 읽어온다.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  echo "error: .env.local 이 없습니다. 빌드에 필요한 NEXT_PUBLIC_* 값을 읽을 수 없습니다." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?.env.local 에 NEXT_PUBLIC_SUPABASE_URL 이 필요합니다}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?.env.local 에 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요합니다}"

# 배포된 사이트의 자기 주소. 로컬 .env.local 의 localhost 값을 덮어쓴다.
APP_URL="${DEPLOY_APP_URL:-https://pin.newdawn.co.kr}"

exec flyctl deploy \
  --build-arg "NEXT_PUBLIC_APP_URL=${APP_URL}" \
  --build-arg "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}" \
  --build-arg "NEXT_PUBLIC_DATA_MODE=${NEXT_PUBLIC_DATA_MODE:-supabase}" \
  "$@"
