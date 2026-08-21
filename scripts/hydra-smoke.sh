#!/usr/bin/env bash
set -euo pipefail

ROOT="${TMPDIR:-/tmp}/finalbuilds-hydra-smoke"
rm -rf "$ROOT"
mkdir -p "$ROOT/store" "$ROOT/cache"
printf '%s\n' 'local-development-token-32-bytes' > "$ROOT/auth-token"

cleanup() {
  docker rm -f finalbuilds-hydra-smoke >/dev/null 2>&1 || true
  rm -rf "$ROOT"
}
trap cleanup EXIT

docker run -d --name finalbuilds-hydra-smoke \
  --user "$(id -u):$(id -g)" \
  -p 7687:7687 -p 8443:8443 -p 9090:9090 \
  -v "$ROOT:/data" \
  -e CLOUD_PROVIDER=local \
  -e LOCAL_PATH=/data/store \
  -e GRAPH_NAMESPACE=default \
  -e GRAPH_ID=finalbuilds \
  -e GRAPH_CELL_ID=cell-0 \
  -e GRAPH_CELLS=cell-0 \
  -e GRAPH_NODE_ID=node-0 \
  -e GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:7687 \
  -e GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:7687 \
  -e GRAPH_DATA_CACHE_DIR=/data/cache \
  -e GRAPH_AUTH_TOKEN_FILE=/data/auth-token \
  -e GRAPH_ALLOW_PLAINTEXT=true \
  -e RUST_MIN_STACK=33554432 \
  ghcr.io/hydra-db/hydradb:latest >/dev/null

for _ in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:9090/readyz >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:9090/readyz >/dev/null

HYDRA_URL=http://127.0.0.1:8443 \
HYDRA_TOKEN=local-development-token-32-bytes \
HYDRA_GRAPH_ID=finalbuilds \
HYDRA_NAMESPACE=default \
HYDRA_CELL_ID=cell-0 \
node scripts/hydra-integration.mjs
