#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USE_POSTGRES=false
TARGET_TAG=""

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-rollback.sh --to-tag TAG [options]

Options:
  --to-tag TAG     Required image tag to deploy (example: 2026.03.27.1)
  --postgres       Enable postgres profile during rollback
  -h, --help       Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to-tag)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --to-tag" >&2
        usage
        exit 1
      fi
      TARGET_TAG="$2"
      shift 2
      ;;
    --postgres)
      USE_POSTGRES=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET_TAG" ]]; then
  echo "--to-tag is required" >&2
  usage
  exit 1
fi

if [[ ! -f ".env" ]]; then
  echo "Missing .env in repository root. Create it before rolling back." >&2
  exit 1
fi

COMPOSE_ARGS=(-f docker-compose.yml -f docker-compose.prod.yml)
if [[ "$USE_POSTGRES" = true ]]; then
  COMPOSE_ARGS+=(--profile postgres)
fi

export APP_IMAGE_TAG="$TARGET_TAG"
export RUN_DB_PUSH_ON_START=false

echo "Rolling back to APP_IMAGE_TAG=$APP_IMAGE_TAG"

if ! docker image inspect "ticketera-app:${APP_IMAGE_TAG}" >/dev/null 2>&1; then
  echo "Local image ticketera-app:${APP_IMAGE_TAG} not found." >&2
  echo "Build it first on this host (or pull from your registry) before rollback." >&2
  exit 1
fi

docker compose "${COMPOSE_ARGS[@]}" up -d --no-build

docker compose "${COMPOSE_ARGS[@]}" ps

echo "Rollback complete."
