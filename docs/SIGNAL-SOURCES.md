# SIGNAL SOURCES — endpoints, limits, etiquette

*Collectors MUST respect these. Backoff on 429/5xx; never hammer; cache daily.*

| Source | Endpoint | Auth | Limits / etiquette | Used by |
|---|---|---|---|---|
| PyPI stats | `https://pypistats.org/api/packages/<pkg>/recent` | none | **observed 429s** — sleep ≥1s between pkgs, retry ×2 w/ 5s backoff, daily cadence only | collect_signals.py |
| npm downloads | `https://api.npmjs.org/downloads/point/last-month/<pkg>` | none | undocumented; be polite ≤1 rps, daily | collect_signals.py |
| GitHub REST | `https://api.github.com/repos/<o>/<r>` | none = **60/hr**; PAT = 5000/hr | sleep ≥0.5s; stop at first 403 | collect_signals.py |
| HN Algolia | `https://hn.algolia.com/api/v1/search?query=&tags=story` | none | generous; cluster by 90d windows, weekly | (queued) |
| x402 Bazaar | `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?query=` | none | 0.4s spacing, 100-item cap | collect_signals.py |
| Wayback CDX | `http://web.archive.org/cdx/search/cdx?url=<pricing_url>&output=json&fl=timestamp,statuscode` | none | **≥1 req/s**, fetch max 2–3 historical snapshots per backfill | track_incumbents.py |
| Incumbent pricing pages | direct GET of vendor URL | none | monthly cadence, single fetch/page, UA identifying us | track_incumbents.py |
| Cloudflare GraphQL | `https://api.cloudflare.com/client/v4/graphql` | CF_API_TOKEN ✓ have | account-scoped, hourly fine | cf-usage.mjs |

## Keys we might want (manual, from user)
- **GITHUB_TOKEN** — only if niche-repo set grows past ~50 checks/hr
- **Product Hunt token** — only if launch-competition tracking wanted
- No keys exist for pytrends (unofficial); treat as best-effort
