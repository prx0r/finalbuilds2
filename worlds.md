# Worlds — backtestable market-intelligence graphs

The best Worlds are probably the messy ones.

Score potential Worlds by:

**economic value × historical fragmentation × agent demand × ability to backtest × absence of incumbent API.**

| World | Why |
|-------|-----|
| EtsyWorld | Extremely fragmented historical intelligence |
| eBayWorld | Reselling/pricing/selection decisions |
| AmazonWorld | Huge value, but stronger incumbent data providers |
| ShopifyWorld | Own-store outcomes + cross-store intelligence |
| PartsWorld | Compatibility + installed base + prices |
| SupplierWorld | Pricing/MOQ/lead-time history |
| AdsWorld | Historical decision/outcome intelligence |
| AppStoreWorld | Apps/rank/reviews/pricing history |
| DomainsWorld | Registrations/prices/naming outcomes |
| JobsWorld | Skills/salary/demand changes |
| PropertyWorld | Highly valuable temporal state |
| UsedCarWorld | Listings/prices/time-to-sale |

---

## Appendix — first-pass scores (1–5 each, multiplicative, max 3125)

Scored 2026-09-11. Draft — challenge every cell. `absence` = absence of incumbent API (5 = no incumbent).

| World | econ | frag | agent | backtest | absence | total |
|-------|------|------|-------|----------|---------|-------|
| EtsyWorld | 4 | 5 | 3 | 4 | 4 | **960** |
| DomainsWorld | 3 | 4 | 4 | 5 | 4 | **960** |
| eBayWorld | 4 | 4 | 3 | 5 | 3 | 720 |
| ShopifyWorld | 5 | 4 | 4 | 3 | 3 | 720 |
| PartsWorld | 4 | 5 | 3 | 3 | 4 | 720 |
| SupplierWorld | 5 | 5 | 3 | 2 | 4 | 600 |
| UsedCarWorld | 4 | 4 | 3 | 4 | 3 | 576 |
| PropertyWorld | 5 | 4 | 3 | 4 | 2 | 480 |
| AppStoreWorld | 3 | 3 | 3 | 5 | 3 | 405 |
| AmazonWorld | 5 | 3 | 4 | 3 | 2 | 360 |
| AdsWorld | 5 | 3 | 3 | 4 | 2 | 360 |
| JobsWorld | 4 | 3 | 3 | 4 | 2 | 288 |

Reading:

- **DomainsWorld ties for first and we can start it today.** `bulkHistory` + naming outcomes + registration/price observations are already being persisted in cmail. No new collection needed — just structure what exists into a temporal graph and expose it.
- **EtsyWorld is the biggest open one.** Maximum fragmentation, no incumbent API for historical seller/listing intelligence, backtestable via listing snapshots. Pure collection play.
- **Amazon/Ads/Jobs score low for the same reason:** incumbents (Jungle Scout/Keepa, ad libraries, Adzuna/ONS) already sell the API. We'd be a worse-funded clone, not a gap.
- **ShopifyWorld is the merchant-track data moat.** Own-store outcomes via app installs + anonymized cross-store benchmarks. Feeds directly off the Shopify hidden market (`marketplaces.md` §9–10).
- **PropertyWorld has the value but not the access.** Land Registry is open; the good stuff (time-to-sale, listing history) sits behind Rightmove/Zoopla ToS. Unofficial-connector rule bites — needs licensed feeds or skip.

## Mapping to existing pipeline

| World | Existing asset |
|-------|----------------|
| DomainsWorld | domain-name-assistant + `bulkHistory` + NAMING_LOG (FINALBUILDS2-001) |
| ShopifyWorld | merchant-tools track, northstar §4 step 6 |
| PartsWorld | `idea_fit_checker` (registry) |
| SupplierWorld | `idea_supplier_check` (registry) |
| PropertyWorld | `idea_property_check` (registry) |
| EtsyWorld, eBayWorld, UsedCarWorld, AppStoreWorld, AdsWorld, JobsWorld, AmazonWorld | unregistered — candidates for the gap crawler |
