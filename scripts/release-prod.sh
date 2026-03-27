#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USE_POSTGRES=false
RUN_DB_PUSH=false
SKIP_GIT=false
SKIP_BUILD=false
CUSTOM_TAG=""

usage() {
  cat <<'EOF'
Usage: ./scripts/release-prod.sh [options]

Options:
  --tag TAG        Use explicit release tag (default: UTC timestamp)
  --postgres       Enable postgres profile during deploy
  --run-db-push    Temporarily set RUN_DB_PUSH_ON_START=true for this release
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

DEPLOY_ARGS=(--image-tag "$RELEASE_TAG")
if [[ "$USE_POSTGRES" = true ]]; then
  DEPLOY_ARGS+=(--postgres)
fi
if [[ "$RUN_DB_PUSH" = true ]]; then
  DEPLOY_ARGS+=(--run-db-push)
fi
if [[ "$SKIP_GIT" = true ]]; then
  DEPLOY_ARGS+=(--skip-git)
fi
if [[ "$SKIP_BUILD" = true ]]; then
  DEPLOY_ARGS+=(--skip-build)
fi

./scripts/deploy-prod.sh "${DEPLOY_ARGS[@]}"

echo "Release deployment complete for tag: $RELEASE_TAG"
