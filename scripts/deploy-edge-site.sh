#!/usr/bin/env bash
# deploy-edge-site.sh — S6 for edge sites: build from MERGED MAIN, publish to
# Cloudflare Pages, register in fleet spine, observe immediately.
#
# Usage: deploy-edge-site.sh <site_id> <repo_subdir> [project_name]
# Requires: CLOUDFLARE creds in .env; site committed to main under repo subdir.
set -euo pipefail
cd "$(dirname "$0")/.."

SITE_ID=${1:?usage: deploy-edge-site.sh <site_id> <repo_subdir> [project]}
SUBDIR=${2:?repo subdir required}
PROJECT=${3:-$SITE_ID}

export $(grep -E '^(CF_API_TOKEN|CF_ACCOUNT_ID)=' .env | xargs)
export CLOUDFLARE_API_TOKEN=$CF_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$CF_ACCOUNT_ID

STAGE=$(mktemp -d /tmp/edgesite.XXXXXX)
git -C /root/unbundled archive HEAD:"$SUBDIR" | tar -x -C "$STAGE"
[ -f "$STAGE/package.json" ] && (cd "$STAGE" && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build >/dev/null 2>&1)

OUT=""
for d in dist build out public .; do [ -f "$STAGE/$d/index.html" ] && OUT="$STAGE/$d" && break; done
[ -z "$OUT" ] && { echo "no index.html produced"; exit 1; }

npx wrangler pages deploy "$OUT" --project-name="$PROJECT" --branch=main --commit-dirty=true >/dev/null 2>&1
echo "deployed https://$PROJECT.pages.dev"

node scripts/site-add.mjs "site_$SITE_ID" "$PROJECT.pages.dev" --runtime static --product "product_$SITE_ID"
node scripts/register-sites.mjs
node scripts/observe-sites.mjs
node scripts/conformance.mjs
echo "spine registration complete — sensors now watch https://$PROJECT.pages.dev"
