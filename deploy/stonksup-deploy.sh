#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${STONKSUP_APP_DIR:-/root/workspace/stonksup}"
BRANCH="${STONKSUP_BRANCH:-main}"
RUNTIME_ENV_FILE="${STONKSUP_RUNTIME_ENV_FILE:-.env.runtime}"
PORT="${STONKSUP_PORT:-3000}"
LOCK_FILE="${STONKSUP_LOCK_FILE:-/var/lock/stonksup-deploy.lock}"
WEB_HEALTH_URL="http://127.0.0.1:${PORT}/healthz"
API_HEALTH_URL="http://127.0.0.1:${PORT}/api/v1/health/ready"

log() {
  printf '[stonksup-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

for command_name in curl docker flock git mktemp; do
  require_command "$command_name"
done

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another deployment is already running."

[[ -d "$APP_DIR/.git" ]] || fail "Git repository not found: $APP_DIR"
cd "$APP_DIR"

[[ -s "$RUNTIME_ENV_FILE" ]] || fail "Runtime environment file is missing: $APP_DIR/$RUNTIME_ENV_FILE"
docker compose version >/dev/null
docker compose --env-file "$RUNTIME_ENV_FILE" config --quiet

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  git status --short
  fail "Working tree is not clean. Commit, stash, or remove the listed changes first."
fi

previous_sha="$(git rev-parse HEAD)"
rollback_compose="$(mktemp -t stonksup-compose.XXXXXX.yaml)"
git show "${previous_sha}:compose.yaml" > "$rollback_compose"

cleanup() {
  rm -f "$rollback_compose"
}
trap cleanup EXIT

compose_for() {
  local image_tag="$1"
  shift
  IMAGE_TAG="$image_tag" docker compose --env-file "$RUNTIME_ENV_FILE" "$@"
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS "$WEB_HEALTH_URL" >/dev/null \
      && curl -fsS "$API_HEALTH_URL" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  log "Restoring commit ${previous_sha:0:7} and its containers."
  git reset --hard "$previous_sha"
  IMAGE_TAG="$previous_sha" docker compose \
    -f "$rollback_compose" \
    --env-file "$RUNTIME_ENV_FILE" \
    up -d --remove-orphans

  if wait_for_health; then
    log "Rollback health checks passed."
  else
    log "ERROR: rollback containers did not become healthy." >&2
  fi
}

log "Fetching origin/${BRANCH}."
git fetch --prune origin "$BRANCH"
target_sha="$(git rev-parse "origin/${BRANCH}")"

if [[ "$previous_sha" == "$target_sha" ]]; then
  log "Repository is already at ${target_sha:0:7}; rebuilding the current release."
else
  log "Fast-forwarding ${previous_sha:0:7} -> ${target_sha:0:7}."
  git merge --ff-only "$target_sha"
fi

log "Building backend and web images from server source."
if ! compose_for "$target_sha" build backend web; then
  git reset --hard "$previous_sha"
  fail "Image build failed; the running containers were not changed."
fi

log "Starting release ${target_sha:0:7}."
if ! compose_for "$target_sha" up -d --remove-orphans; then
  rollback
  fail "Container switch failed."
fi

if ! wait_for_health; then
  compose_for "$target_sha" ps || true
  compose_for "$target_sha" logs --tail=160 web backend database || true
  rollback
  fail "Health checks failed for release ${target_sha:0:7}."
fi

compose_for "$target_sha" ps
install -m 755 "$APP_DIR/deploy/stonksup-deploy.sh" /usr/local/bin/stonksup-deploy

log "Deployment complete: ${target_sha}"
log "Web: http://175.178.17.89:${PORT}/stonksup/"
log "Next deployment: stonksup-deploy"
