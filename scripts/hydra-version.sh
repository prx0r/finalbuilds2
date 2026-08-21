#!/bin/bash
# HydraDB version and health probe.
# Usage: ./scripts/hydra-version.sh [url] [token]
#
# Outputs JSON with:
#   - running: whether Hydra is reachable
#   - url: the HTTP endpoint tested
#   - graph_id: tested graph
#   - git_version: version of local binary if available
#   - binary_md5: md5 of local binary
#   - write_support: whether CREATE+SET works
#   - query_id: last query ID (proves live connection)

URL="${1:-http://127.0.0.1:8443}"
TOKEN="${2:-iolauz-test-token-32-chars-long!!}"
GRAPH="${HYDRADB_GRAPH_ID:-default}"
CELL="${HYDRADB_CELL_ID:-cell-0}"

# Check reachability
HEALTH=$(curl -sf -X POST "$URL/v1/graphs/$GRAPH/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"cell_id\":\"$CELL\",\"query\":\"MATCH (n:BuildRun) RETURN n.string_id LIMIT 0\"}" 2>&1)

if [ $? -eq 0 ]; then
  RUNNING="true"
  QUERY_ID=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('query_id','?'))" 2>/dev/null || echo "?")
else
  RUNNING="false"
  QUERY_ID=""
fi

# Test write support
WRITE_OK="false"
if [ "$RUNNING" = "true" ]; then
  WRITE_RESULT=$(curl -sf -X POST "$URL/v1/graphs/$GRAPH/query" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"cell_id\":\"$CELL\",\"query\":\"CREATE (n:_VersionProbe {id: 999999, ts: \\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\"})-[:_SENTINEL]->(:_ANCHOR {id: 0})\"}" 2>&1)
  if [ $? -eq 0 ]; then
    WRITE_OK="true"
    # Cleanup
    curl -sf -X POST "$URL/v1/graphs/$GRAPH/query" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"cell_id\":\"$CELL\",\"query\":\"MATCH (n:_VersionProbe {id: 999999}) DETACH DELETE n\"}" >/dev/null 2>&1
  fi
fi

# Get local binary info
BINARY_PATH=$(which graph-node 2>/dev/null || find /root/hydradb-target/release -name graph-node -type f 2>/dev/null | head -1)
GIT_VERSION=""
BINARY_MD5=""
if [ -n "$BINARY_PATH" ]; then
  BINARY_MD5=$(md5sum "$BINARY_PATH" | cut -d' ' -f1)
  if [ -d /root/hydradb-build ]; then
    GIT_VERSION=$(cd /root/hydradb-build && git describe --tags --always 2>/dev/null || echo "?")
  fi
fi

cat <<EOF
{
  "running": $RUNNING,
  "url": "$URL",
  "graph_id": "$GRAPH",
  "cell_id": "$CELL",
  "git_version": "${GIT_VERSION:-unknown}",
  "binary_md5": "${BINARY_MD5:-unknown}",
  "write_support": $WRITE_OK,
  "query_id": "${QUERY_ID:-none}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
