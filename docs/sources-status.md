# Sources status

Dated state of the ingestion sources: what was measured, what changed, what is
still open. How ingestion works is in `docs/pipeline.md` (`ingestion/`);
CI facts are in `docs/operations.md`.

## Open: dead-feed cleanup review, due ~2027-01-05

The owner chose (2026-10-05) **not** to drop weak or failing feeds yet, but to
observe them for ~3 months first. Around 2027-01-05, check
`data/source_yield.json` over the preceding weeks (`failedRuns`, `newArticlesAdded`)
and drop or replace whatever is still dead. Candidates as of 2026-10-05:

- **Near-duplicate:** `Jeweller - Main`, `Jeweller - Jewellery Trends` (0–1 new/week; the Business News feed carries the same items).
- **Empty:** `Luxury Daily - Retail`, `Luxury Daily - Commerce` (0 items), `Luxury Daily - Research` (0 new).
- **Failing every run (403/429/parse error):** `Business of Fashion - News`, `Professional Jeweller`, `WatchPro`, `Just Style`, `Retail TouchPoints`, `Sourcing Journal`, `AI News`, `VentureBeat - AI`, `PYMNTS` (parse error since 2026-10-05), `BoF - News (The News in Brief)` page scrape.
  BoF, Professional Jeweller, WatchPro and Retail TouchPoints now also come in
  via Bing News proxies, so their direct feeds can go once the proxies prove stable.

## 2026-10-05: coverage expansion

**Problems found**

1. Failing feeds were invisible: a feed that errored never appeared in
   `source_yield.json`. Ten were failing in W40. BoF's feed works from a home IP
   but is blocked from GitHub Actions IPs (Cloudflare), so retries can't fix it.
2. A weekly fetch truncates busy feeds. Many feeds list only their latest
   10–30 items. Measured weekly volume vs what one Sunday fetch captured:
   WWD ~280 vs 10, Highsnobiety ~58 vs 12, FT Technology ~56 vs 25,
   Dazed ~39 vs 15, Robb Report / Footwear News / Instore ~30 vs 10 each.
3. Jewellery had no US trade press (JCK, Rapaport, National Jeweler), and
   selected jewellery stories came from 3 outlets (concentration warnings in W40).

**What changed**

- `daily-ingest.yml`: RSS + pages Mon–Sat, buffered in the Actions cache and merged
  by the Sunday build (no daily commits, no Tavily).
- WordPress `?paged=N` pagination on 12 feeds (`paginate` in `sources.ts`).
- New feeds: FashionUnited, WWD Business News, CPP-Luxury, Moodie Davitt Report,
  The Industry.fashion, Inside Retail Asia, JCK Editorial, Rapaport News, Hodinkee.
- Bing News `site:` proxies: Business of Fashion, Vogue Business, Jing Daily,
  FashionNetwork, National Jeweler, Professional Jeweller, WatchPro, Retail TouchPoints.
- Failures are recorded in `source_yield.json`, which now accumulates per week.
- Rerank pre-trim caps 4 candidates per source (`RERANK_TRIM_MAX_PER_SOURCE`).

**Measured effect** (one local `--mode=rss` run on 2026-10-05, articles published in
the previous 7 days, classified with `classifyTopic`):

| Category | Before | After one run |
|---|---|---|
| Luxury & Consumer | 57 | 327 |
| Jewellery Industry | 98 | 255 |
| Ecommerce & Retail Tech | 116 | 174 |
| AI & Strategy | 148 | 215 |

FashionUnited alone was 100 of the 270 added luxury items, hence the trim cap.
Pagination on Drapers mostly added items the classifier drops (no category
keywords). Daily runs from CI will differ from this home-IP run; compare against
the first CI weeks (W41+) before trusting the numbers.

**Cost:** $0 in API spend. Classification is keyword-based, the reranker sees at
most 18 candidates per topic and summaries cover only the selected 28, so pool
size does not change OpenAI usage. Discovery (Tavily, metered) is untouched.
The daily job uses ~2 min of Actions time. `data/articles.json` will grow faster
(roughly +15 MB/year), which matters for the 250 MB function limit and `/api/search`.
