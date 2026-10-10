#!/usr/bin/env bash
# Builds the site and publishes it to the production Cloudflare Pages project.
# Run via `npm run deploy`; pass --skip-checks to skip type checking and tests.
set -euo pipefail

PROJECT_NAME="photo-album"
# Pages treats only this branch as production. Any other value lands in the
# Preview environment, which has no DATABASE_URL secret and returns 500s.
PRODUCTION_BRANCH="master"
SITE_URL="https://photos.ryansalik.com"

cd "$(dirname "$0")/.."

skip_checks=false
if [[ "${1:-}" == "--skip-checks" ]]; then
  skip_checks=true
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: uncommitted changes will be included in this deploy (the build uses the working tree):"
  git status --short
  echo
fi

if [[ "$skip_checks" == false ]]; then
  echo "==> Type checking"
  npm run check
  echo "==> Running tests"
  npm test
fi

echo "==> Building"
npm run build

echo "==> Deploying to Cloudflare Pages ($PROJECT_NAME, branch $PRODUCTION_BRANCH)"
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name "$PROJECT_NAME" \
  --branch "$PRODUCTION_BRANCH"

echo
echo "Deployed. Verify at $SITE_URL"
