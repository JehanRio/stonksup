#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/workspace/stonksup}"
LEGACY_DIR="${LEGACY_DIR:-/root/workspace/ai-investment-agent}"
PORT="${STONKSUP_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/healthz"

: "${IMAGE_TAG:?IMAGE_TAG must be set to the Git commit SHA}"

cd "$APP_DIR"
requested_tag="$IMAGE_TAG"
export IMAGE_TAG STONKSUP_PORT="$PORT"

docker compose config --quiet
docker compose pull web

legacy_was_running=0
previous_image="$(docker inspect --format '{{.Config.Image}}' stonksup-web 2>/dev/null || true)"

port_pid() {
  ss -ltnp | awk -v port=":${PORT}" '
    $4 ~ port"$" && match($0, /pid=[0-9]+/) {
      print substr($0, RSTART + 4, RLENGTH - 4)
      exit
    }
  '
}

stop_legacy() {
  if [[ -n "$previous_image" ]]; then
    return
  fi

  local pid cwd command parent
  pid="$(port_pid)"
  if [[ -z "$pid" ]]; then
    return
  fi

  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
  command="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)"
  if [[ "$cwd" != "$LEGACY_DIR" || "$command" != *"/node_modules/.bin/vite"* ]]; then
    echo "Refusing to stop unexpected process on port ${PORT}: pid=${pid} cwd=${cwd}" >&2
    exit 1
  fi

  legacy_was_running=1
  parent="$(ps -o ppid= -p "$pid" | tr -d ' ')"
  kill "$pid" 2>/dev/null || true
  if [[ -n "$parent" && "$parent" != "1" ]]; then
    kill "$parent" 2>/dev/null || true
  fi

  for _ in {1..20}; do
    if [[ -z "$(port_pid)" ]]; then
      rm -f "$LEGACY_DIR/vite-preview.pid" "$LEGACY_DIR/vite-dev.pid"
      return
    fi
    sleep 0.25
  done

  echo "Legacy Vite process did not release port ${PORT}" >&2
  exit 1
}

restore_legacy() {
  if [[ "$legacy_was_running" -ne 1 || ! -d "$LEGACY_DIR" ]]; then
    return
  fi

  cd "$LEGACY_DIR"
  nohup npm run dev -- --host 0.0.0.0 --port "$PORT" \
    > vite-dev.out.log 2> vite-dev.err.log &
  echo "$!" > vite-dev.pid
}

wait_for_health() {
  for _ in {1..30}; do
    if curl -fsS "$HEALTH_URL" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

stop_legacy

if ! docker compose up -d --remove-orphans; then
  restore_legacy
  exit 1
fi

if ! wait_for_health; then
  docker compose ps
  docker compose logs --tail=120 web

  if [[ -n "$previous_image" ]]; then
    export STONKSUP_IMAGE="${previous_image%:*}"
    export IMAGE_TAG="${previous_image##*:}"
    docker compose up -d --remove-orphans
    wait_for_health || true
  else
    docker compose down
    restore_legacy
  fi
  exit 1
fi

docker compose ps
echo "Deployed image tag ${requested_tag}"
echo "Health check passed: ${HEALTH_URL}"