#!/usr/bin/env bash
# Run on EC2: bash deploy-ec2.sh RELEASE_DIRECTORY IMAGE_TAG
set -Eeuo pipefail
umask 077

release_dir="$(cd "${1:?release directory required}" && pwd)"
tag="${2:?image tag required}"
[[ "$tag" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid image tag' >&2; exit 1; }
app=ohpin-fe
image="$app:$tag"
previous="$app-previous"
candidate="$app-candidate"
old_saved=0
new_attempt=0
success=0

# Serialize manual deployments too. Never let overlapping runs remove each other's containers.
exec 9>"$release_dir/../deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }

docker info >/dev/null
test -s "$release_dir/runtime.env"
test -s "$release_dir/image.tar.gz"
chmod 600 "$release_dir/runtime.env"

exists() { docker container inspect "$1" >/dev/null 2>&1; }
remove_if_exists() {
  if exists "$1"; then docker rm -f "$1" >/dev/null; fi
}
wait_healthy() {
  local name="$1" state
  for ((i = 0; i < 45; i++)); do
    state="$(docker inspect --format '{{.State.Status}}/{{.State.Health.Status}}' "$name")" || return 1
    case "$state" in
      running/healthy) return 0 ;;
      exited/*|dead/*|*/unhealthy) return 1 ;;
    esac
    sleep 2
  done
  return 1
}
cleanup() {
  local status=$?
  trap - EXIT
  set +e
  remove_if_exists "$candidate"
  if (( ! success )); then
    echo 'Deployment failed; restoring the previous container if available.' >&2
    if (( new_attempt )); then remove_if_exists "$app"; fi
    if (( old_saved )); then
      if docker rename "$previous" "$app" && docker start "$app" >/dev/null; then
        echo 'Previous container restored.' >&2
      else
        echo 'ROLLBACK FAILED: inspect ohpin-fe and ohpin-fe-previous on EC2.' >&2
      fi
    fi
  fi
  # Containers retain their own environment; no plaintext env/archive needs to remain on disk.
  rm -f "$release_dir/runtime.env" "$release_dir/image.tar.gz"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# Load and validate before stopping any live container. No global image/system prune.
gzip -dc "$release_dir/image.tar.gz" | docker load >/dev/null
docker image inspect "$image" >/dev/null
remove_if_exists "$candidate"
health_cmd="node -e \"fetch('http://127.0.0.1:3000/login',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))\""
run_options=(
  --env-file "$release_dir/runtime.env"
  --env PORT=3000 --env HOSTNAME=0.0.0.0 --env NODE_ENV=production
  --init --log-opt max-size=10m --log-opt max-file=3
  --health-cmd "$health_cmd" --health-interval 5s --health-timeout 5s
  --health-start-period 10s --health-retries 3
)
# Candidate uses an ephemeral loopback port; the live port remains untouched.
docker run -d --name "$candidate" "${run_options[@]}" \
  -p 127.0.0.1::3000 "$image" >/dev/null
wait_healthy "$candidate"
remove_if_exists "$candidate"

# Keep exactly one previous container (with its original image and environment).
remove_if_exists "$previous"
if exists "$app"; then
  docker rename "$app" "$previous"
  old_saved=1
  docker stop --time 30 "$previous" >/dev/null
fi
new_attempt=1
docker run -d --name "$app" "${run_options[@]}" \
  --restart unless-stopped -p 127.0.0.1:3002:3000 "$image" >/dev/null
wait_healthy "$app"
if [[ "$(curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:3002/login)" != 200 ]]; then
  echo "Host HTTP check failed" >&2
  exit 1
fi
success=1
echo "Deployed $image on 127.0.0.1:3002"
