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
- **Failing every run (403/429/parse error):** `Business of Fashion - News`, `WatchPro`, `Just Style`, `Retail TouchPoints`, `Sourcing Journal`, `AI News`, `VentureBeat - AI`, `PYMNTS` (parse error since 2026-10-05), `BoF - News (The News in Brief)` page scrape.
  BoF, WatchPro and Retail TouchPoints now also come in via Bing News proxies,
  so their direct feeds can go once the proxies prove stable. (`Professional
  Jeweller` and `Rapaport News` direct feeds were removed on 2026-11-11, see below.)

## 2026-11-11: Jewellery pool enlargement

**Why.** Watches moved from Jewellery to Luxury (owner decision 2026-11-11). In
W45, about 160 of the 297 articles triaged into Jewellery were watch stories, so
Jewellery would drop to ~140 articles a week, almost all from five trade titles
(Instore, Retail Jeweller UK, JCK Editorial, Jeweller Business News, Professional
Jeweller via Bing).

**Removed / replaced**

- `Rapaport News` direct feed (403 on 8 of 8 runs since 2026-10-05) →
  `Rapaport News (via Bing News)`.
- `Professional Jeweller` direct feed (403 every run) → removed; the Bing proxy
  has run 8 of 8 without failure (84 items, 2026-11-03 to 2026-11-09).

**Added** (items dated in the last 14 days when checked from a home IP on
2026-11-11; Bing returns at most ~10–14 items, so daily ingestion sees more per week):

| Feed | Recent / total items | On topic |
|---|---|---|
| `Rapaport News (via Bing News)` | 12 / 12 | all (De Beers sale, auctions, synthetics) |
| `Jewellery Outlook` (direct) | 10 / 10 | all (UK trade) |
| `Jeweller Magazine (via Bing News)` | 11 / 11 | all; overlaps the direct Jeweller feeds, URL dedupe drops repeats |
| `Retail Jeweller India (via Bing News)` | 12 / 12 | ~half business news, ~half local store promotions (triage scores those low) |
| `World Gold Council (via Bing News)` | 10 / 12 | Gold Demand Trends, central-bank data; a few static price pages, ingested once |
| `Jewellery Business (Canada)` (direct) | 5 / 10 | mostly |
| `IDEX Online (via Bing News)` | 2 / 3 | all |
| `Bing News: Pandora jewellery` | 2 / 10 | mostly |
| `Bing News: Signet Jewelers` | 5 / 12 | mixed: results and filings plus stock-commentary noise |
| `Bing News: De Beers` | 2 / 2 | all |
| `Bing News: Chow Tai Fook` | 1 / 11 | all |
| `Bing News: lab-grown diamonds` | 2 / 11 | all |

Keyword queries (`bingNewsQuery` in `sources.ts`) bring business coverage from
any outlet (Reuters, Bloomberg, CNBC). Their articles are keyed to the real
publisher from Bing's `News:Source` field, e.g. `Reuters (via Bing News)`
(`articleSourceName` in `ingestion/fetchRss.ts`), so readers never see the
query name and selection's per-source caps apply per outlet. They also pull in
consumer listicles (Bustle, Sportskeeda); triage scores those low and the
shortlist excludes listicles. Expected effect: roughly +70–100
on-topic Jewellery articles a week. Check the first CI weeks in
`source_yield.json` and the selection report before trusting that.

**Rejected:** Jewellery Focus (direct 403; Bing ~1 item a fortnight), Solitaire
International (direct 403; Bing empty), Gem-A (direct feed has nothing recent;
Bing empty), Diamond World / GJEPC (empty), JewelleryNet and JNA (Bing empty;
JNA's own feed is malformed XML), Kitco and Mining.com diamonds (404), Centurion
(unreachable), Diamonds.net (Bing stale), Retail Jeweller India direct (403),
JCK via Bing (duplicates `JCK - Editorial`), Brilliant Earth query (mostly its own
press releases and call transcripts), "jewellery sales" and "diamond industry"
queries (nothing recent).

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
