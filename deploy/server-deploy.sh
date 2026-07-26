#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/workspace/stonksup}"
LEGACY_DIR="${LEGACY_DIR:-/root/workspace/ai-investment-agent}"
PORT="${STONKSUP_PORT:-3000}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-.env.runtime}"
DATABASE_BASE_IMAGE="${STONKSUP_DATABASE_BASE_IMAGE:-mirror.ccs.tencentyun.com/library/postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193}"
BACKEND_BASE_IMAGE="${STONKSUP_BACKEND_BASE_IMAGE:-mirror.ccs.tencentyun.com/library/python:3.13-slim}"
WEB_HEALTH_URL="http://127.0.0.1:${PORT}/healthz"
API_HEALTH_URL="http://127.0.0.1:${PORT}/api/v1/health/ready"

: "${IMAGE_TAG:?IMAGE_TAG must be set to the Git commit SHA}"

cd "$APP_DIR"
requested_tag="$IMAGE_TAG"
export IMAGE_TAG STONKSUP_PORT="$PORT"

if [[ ! -s "$RUNTIME_ENV_FILE" ]]; then
  umask 077
  if command -v openssl >/dev/null 2>&1; then
    database_password="$(openssl rand -hex 24)"
  else
    database_password="$(tr -d '-' < /proc/sys/kernel/random/uuid)$(tr -d '-' < /proc/sys/kernel/random/uuid)"
  fi
  printf 'POSTGRES_PASSWORD=%s\n' "$database_password" > "$RUNTIME_ENV_FILE"
fi
chmod 600 "$RUNTIME_ENV_FILE"
grep -q '^POSTGRES_PASSWORD=' "$RUNTIME_ENV_FILE"

compose() {
  docker compose --env-file "$RUNTIME_ENV_FILE" "$@"
}

compose config --quiet
docker pull "$DATABASE_BASE_IMAGE"
if ! docker pull "$BACKEND_BASE_IMAGE"; then
  echo "Backend base image warm-up failed; continuing with the GHCR image." >&2
fi
if [[ "${STONKSUP_BACKEND_PRELOADED:-0}" == "1" ]]; then
  compose pull database web
else
  compose pull
fi

legacy_was_running=0
previous_web_image="$(docker inspect --format '{{.Config.Image}}' stonksup-web 2>/dev/null || true)"

port_pid() {
  ss -ltnp | awk -v port=":${PORT}" '
    $4 ~ port"$" && match($0, /pid=[0-9]+/) {
      print substr($0, RSTART + 4, RLENGTH - 4)
      exit
    }
  '
}

stop_legacy() {
  if [[ -n "$previous_web_image" ]]; then
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

restore_previous_web() {
  if [[ -z "$previous_web_image" ]]; then
    restore_legacy
    return
  fi

  cat > .rollback-compose.yaml <<EOF
name: stonksup
services:
  web:
    image: ${previous_web_image}
    container_name: stonksup-web
    restart: unless-stopped
    ports:
      - "${PORT}:80"
EOF
  docker compose -f .rollback-compose.yaml up -d
  for _ in {1..20}; do
    if curl -fsS "$WEB_HEALTH_URL" >/dev/null; then
      echo "Restored previous web image: ${previous_web_image}"
      return
    fi
    sleep 1
  done
  echo "Previous web image could not be restored" >&2
}

wait_for_stack() {
  for _ in {1..60}; do
    if curl -fsS "$WEB_HEALTH_URL" >/dev/null \
      && curl -fsS "$API_HEALTH_URL" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

stop_legacy

if ! compose up -d --remove-orphans; then
  compose down || true
  restore_previous_web
  exit 1
fi

if ! wait_for_stack; then
  compose ps
  compose logs --tail=160 web backend database
  compose down || true
  restore_previous_web
  exit 1
fi

compose ps
rm -f .rollback-compose.yaml
echo "Deployed image tag ${requested_tag}"
echo "Web health check passed: ${WEB_HEALTH_URL}"
echo "API and database readiness passed: ${API_HEALTH_URL}"
