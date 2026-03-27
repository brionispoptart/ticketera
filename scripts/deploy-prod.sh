#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USE_POSTGRES=false
RUN_DB_PUSH=false
SKIP_GIT=false
SKIP_BUILD=false
IMAGE_TAG="${APP_IMAGE_TAG:-latest}"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-prod.sh [options]

Options:
  --postgres       Enable postgres profile during deploy
  --run-db-push    Temporarily set RUN_DB_PUSH_ON_START=true for this deploy
  --skip-git       Skip git fetch/checkout/pull steps
  --skip-build     Skip image build and run compose up -d
  --image-tag TAG  Build/deploy using image tag TAG (default: APP_IMAGE_TAG or latest)
  -h, --help       Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --postgres)
      USE_POSTGRES=true
      shift
      ;;
    --run-db-push)
      RUN_DB_PUSH=true
      shift
      ;;
    --skip-git)
      SKIP_GIT=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --image-tag)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --image-tag" >&2
        usage
        exit 1
      fi
      IMAGE_TAG="$2"
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

if [[ ! -f ".env" ]]; then
  echo "Missing .env in repository root. Create it before deploying." >&2
  exit 1
fi

if [[ "$SKIP_GIT" = false ]]; then
  git fetch origin main
  git checkout main
  git pull --ff-only origin main
fi

COMPOSE_ARGS=(-f docker-compose.yml -f docker-compose.prod.yml)
if [[ "$USE_POSTGRES" = true ]]; then
  COMPOSE_ARGS+=(--profile postgres)
fi

export APP_IMAGE_TAG="$IMAGE_TAG"
echo "APP_IMAGE_TAG=$APP_IMAGE_TAG"

if [[ "$RUN_DB_PUSH" = true ]]; then
  export RUN_DB_PUSH_ON_START=true
  echo "RUN_DB_PUSH_ON_START=true for this deploy"
else
  export RUN_DB_PUSH_ON_START=false
fi

if [[ "$SKIP_BUILD" = true ]]; then
  docker compose "${COMPOSE_ARGS[@]}" up -d
else
  docker compose "${COMPOSE_ARGS[@]}" up --build -d
fi

docker compose "${COMPOSE_ARGS[@]}" ps

echo "Deploy complete."
if [[ "$RUN_DB_PUSH" = true ]]; then
  echo "Reminder: set RUN_DB_PUSH_ON_START=false for normal production operation."
fi
