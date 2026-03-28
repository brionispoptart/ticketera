#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USE_POSTGRES=false
USE_CADDY=false
TARGET_TAG=""
IMAGE_REPO="${APP_IMAGE_REPO:-brionispoptart/ticketera}"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-rollback.sh --to-tag TAG [options]

Options:
  --to-tag TAG     Required image tag to deploy (example: 2026.03.27.1)
  --caddy          Include optional Caddy reverse proxy service
  --image-repo REPO  Image repo to roll back (default: APP_IMAGE_REPO)
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
    --caddy)
      USE_CADDY=true
      shift
      ;;
    --postgres)
      USE_POSTGRES=true
      shift
      ;;
    --image-repo)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --image-repo" >&2
        usage
        exit 1
      fi
      IMAGE_REPO="$2"
      shift 2
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
if [[ "$USE_CADDY" = true ]]; then
  COMPOSE_ARGS+=(-f docker-compose.caddy.yml)
fi
if [[ "$USE_POSTGRES" = true ]]; then
  COMPOSE_ARGS+=(-f docker-compose.postgres.yml)
fi

export APP_IMAGE_REPO="$IMAGE_REPO"
export APP_IMAGE_TAG="$TARGET_TAG"
export RUN_DB_PUSH_ON_START=false

echo "Rolling back to ${APP_IMAGE_REPO}:${APP_IMAGE_TAG}"

if ! docker image inspect "${APP_IMAGE_REPO}:${APP_IMAGE_TAG}" >/dev/null 2>&1; then
  echo "Local image ${APP_IMAGE_REPO}:${APP_IMAGE_TAG} not found. Pulling..."
  docker pull "${APP_IMAGE_REPO}:${APP_IMAGE_TAG}"
fi

docker compose "${COMPOSE_ARGS[@]}" up -d --no-build

docker compose "${COMPOSE_ARGS[@]}" ps

echo "Rollback complete."
