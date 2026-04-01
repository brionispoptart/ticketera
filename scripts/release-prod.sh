#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USE_POSTGRES=false
USE_CADDY=false
SKIP_GIT=false
SKIP_BUILD=false
CUSTOM_TAG=""
IMAGE_REPO="${APP_IMAGE_REPO:-brionispoptart/ticketera}"

usage() {
  cat <<'EOF'
Usage: ./scripts/release-prod.sh [options]

Options:
  --tag TAG        Use explicit release tag (default: UTC timestamp)
  --caddy          Include optional Caddy reverse proxy service
  --image-repo REPO  Use image repo REPO (default: APP_IMAGE_REPO)
  --postgres       Enable postgres profile during deploy
  --skip-git       Skip git fetch/checkout/pull steps
  --skip-build     Skip image build and run compose up -d
  -h, --help       Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --tag" >&2
        usage
        exit 1
      fi
      CUSTOM_TAG="$2"
      shift 2
      ;;
    --caddy)
      USE_CADDY=true
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
    --postgres)
      USE_POSTGRES=true
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

if [[ -n "$CUSTOM_TAG" ]]; then
  RELEASE_TAG="$CUSTOM_TAG"
else
  RELEASE_TAG="$(date -u +%Y.%m.%d.%H%M%S)"
fi

echo "Release tag: $RELEASE_TAG"

DEPLOY_ARGS=(--image-repo "$IMAGE_REPO" --image-tag "$RELEASE_TAG")
if [[ "$USE_CADDY" = true ]]; then
  DEPLOY_ARGS+=(--caddy)
fi
if [[ "$USE_POSTGRES" = true ]]; then
  DEPLOY_ARGS+=(--postgres)
fi
if [[ "$SKIP_GIT" = true ]]; then
  DEPLOY_ARGS+=(--skip-git)
fi
if [[ "$SKIP_BUILD" = true ]]; then
  DEPLOY_ARGS+=(--skip-build)
fi

./scripts/deploy-prod.sh "${DEPLOY_ARGS[@]}"

echo "Release deployment complete for tag: $RELEASE_TAG"
