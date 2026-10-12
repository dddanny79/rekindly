#!/usr/bin/env bash
# Smoke test of the Docker image (task 05 acceptance):
# setup wizard on first start, data survives a restart, clear error without
# PUBLIC_URL, non-root user, CLI works, image < 250 MB.
#   scripts/docker-smoke.sh <image>
set -euo pipefail

IMAGE=${1:?usage: docker-smoke.sh <image>}
NAME=pg-smoke-$$
VOLUME=pg-smoke-data-$$
PORT=${SMOKE_PORT:-3999}
BASE=http://localhost:$PORT
JAR=$(mktemp)
MAX_BYTES=$((250 * 1000 * 1000))

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  rm -f "$JAR"
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
fail() {
  echo "FAIL: $*" >&2
  docker logs "$NAME" 2>&1 | tail -30 >&2 || true
  exit 1
}

wait_healthy() {
  for _ in $(seq 1 "${SMOKE_TIMEOUT:-60}"); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo missing)
    [ "$status" = healthy ] && return 0
    sleep 1
  done
  fail "container not healthy (status: $status)"
}

api() { # method path [json]
  curl -sS -b "$JAR" -c "$JAR" -X "$1" -H "origin: $BASE" -H 'content-type: application/json' \
    ${3:+--data "$3"} "$BASE$2"
}

step "image size"
SIZE=$(docker image inspect -f '{{.Size}}' "$IMAGE")
echo "$((SIZE / 1000 / 1000)) MB"
[ "$SIZE" -lt "$MAX_BYTES" ] || fail "image is larger than 250 MB"

step "missing PUBLIC_URL stops with a clear message"
set +e
OUT=$(docker run --rm "$IMAGE" 2>&1)
CODE=$?
set -e
echo "$OUT"
[ "$CODE" -eq 1 ] || fail "expected exit code 1, got $CODE"
grep -q 'PUBLIC_URL is required' <<<"$OUT" || fail "no PUBLIC_URL message"

step "first start shows the setup wizard"
docker volume create "$VOLUME" >/dev/null
docker run -d --name "$NAME" -p "$PORT:3000" -v "$VOLUME:/data" \
  -e PUBLIC_URL="$BASE" -e TZ=Europe/Berlin "$IMAGE" >/dev/null
wait_healthy
[ "$(docker exec "$NAME" id -u)" = 1000 ] || fail "app does not run as uid 1000"
# Health checks of platforms (Coolify) use wget/curl against localhost, which may be ::1.
docker exec "$NAME" wget -qO- http://localhost:3000/api/health | grep -q '"ok"' || fail "not reachable via localhost"
docker logs "$NAME" 2>&1 | grep -q 'time zone: Europe/Berlin' || fail "TZ not applied"
api GET /api/v1/auth/status | grep -q '"setupRequired":true' || fail "setup not required"
curl -sS "$BASE/setup" | grep -q '<div id="root">' || fail "web app not served"

step "set up, add a person, restart, data is still there"
api POST /api/v1/auth/setup \
  '{"name":"Erika Musterfrau","email":"erika@example.com","password":"correct horse battery staple","locale":"de"}' \
  | grep -q '"account"' || fail "setup failed"
SPACE=$(api GET /api/v1/spaces | sed -E 's/.*"id":"([^"]+)".*/\1/')
api POST /api/v1/people "{\"spaceId\":\"$SPACE\",\"firstName\":\"Dora\",\"lastName\":\"Docker\"}" \
  | grep -q '"displayName":"Dora Docker"' || fail "person not created"
docker restart "$NAME" >/dev/null
wait_healthy
api GET '/api/v1/search?q=docker' | grep -q 'Dora Docker' || fail "person lost after restart"
api GET /api/v1/auth/status | grep -q '"setupRequired":false' || fail "account lost after restart"

step "CLI inside the container"
docker exec "$NAME" node dist/cli.js reindex | tee /dev/stderr | grep -q '1 people' || fail "reindex failed"
docker exec "$NAME" node dist/cli.js backup /data/backups/smoke.sqlite | grep -q 'backed up' || fail "backup failed"
docker exec "$NAME" test -s /data/backups/smoke.sqlite || fail "backup file missing"

echo
echo "OK"
