# Markets pages — design

Approved 2026-10-04 from the mock at
https://claude.ai/artifact/9e7BbZc8V2JQEtz4cAFibJ. Replaces Competitor Watch.

## What

Two public, indexable pages, one engine:

- `/markets/luxury`: 12 luxury houses and groups
- `/markets/jewellery`: 12 jewellery brands

Each shows, refreshed weekly with the digest:

1. **This week**: two or three sentences on what the companies did, generated
   only from that week's classified moves.
2. **Share of voice**: articles naming each brand, last 12 weeks, from the
   publication's own sources.
3. **Share price, 3 months**: % change per listed group, diverging bars.
   Replaces the old chart that put share prices in different currencies on one axis.
4. **Moves**: dated company actions from the last 6 weeks, each typed and
   linked to its source.
5. **Brand table**: coverage sparkline, trend, latest move, price sparkline.
   Selecting a row filters Moves.

Generic framing. No brand is privileged; Pandora is one of twelve jewellery names.

## Decisions

| Decision | Why |
|---|---|
| A market page, not a page per brand | Owner's call. Per-brand coverage (3–11 articles in 12 weeks) is too thin for standalone pages. |
| Share of voice counts only the publication's own sources | A stable, explainable basis. Mixing in other feeds would change the method silently. |
| Moves also draw on a Google News feed per brand | Four jewellery brands had zero coverage in 12 weeks; without this their rows are empty. Used for moves only, never for share-of-voice counts. |
| An LLM decides whether the brand is the subject and what kind of move it is | Keyword matching tagged podcasts, roundups and "Alexandre Arnault joins Nike's board" as brand moves. |
| The page shows the publisher's headline | Changed during the build. A checked restatement turned an interview with Chanel's former designer into "Virginie Viard departs Chanel": wrong as current news, and no automatic check catches a change of meaning. The restatement is now shown only when the original doesn't name the brand or is a fragment list, and is otherwise used just to merge duplicate reports. |
| Moves are rated major or minor | Added during the build. Six weeks produced ~70 luxury moves, many of them product drops; Pandora's "latest move" was Winnie the Pooh charms rather than the Vietnam factory. The page shows major moves by default. |
| One event from several outlets is one move | Added during the build: the Rolex Padellone launch arrived as four moves. Merged on the restated headline or shared names, with an outlet count kept. |
| The weekly summary is generated from classified moves only, and validated | Each sentence must name a brand present in the input, and no number may appear that isn't in the input. On failure, the section is omitted rather than shown wrong. |
| Trends only for brands with 10+ articles in 12 weeks | Below that, ratios are noise (see the Signal Index analysis). |
| Brand matching fixes known false positives | `jared` matched Jared Kushner; `Pandora` matched the Pandora Papers. |
| A price fetch failure keeps the previous prices, marked stale | A Yahoo hiccup must not blank the chart. |
| Old URLs redirect permanently | `/competitor-watch` → `/markets/jewellery`; locale versions go there too. |

## Shape

```
markets/                      Node-only build step (like digest/, seo/)
  brands.ts                   registry: name, group, pattern, ticker, market
  coverage.ts                 counts, weekly series, trend (pure)
  candidates.ts               move candidates from own sources + Google News
  classifyMoves.ts            LLM: subject? company move? type; cached per item
  summary.ts                  LLM weekly sentences, validated
  prices.ts                   Yahoo Finance, rebased series, stale fallback
  buildMarkets.ts             orchestrator → data/markets/{market}.json
lib/markets/
  types.ts, load.ts           what the app imports
app/markets/[market]/page.tsx two static pages, server-rendered
scripts/buildMarkets.ts       npm run markets:build
```

The pipeline's step 9 (`competitorAnalyze`) and the separate CI step that
also ran it (it ran twice a week) are replaced by `markets`, which is
non-critical: a failure never blocks a digest. The old analyser code in
`pipeline/competitorAnalyze.ts` and `data/competitor-intel.json` are left in
place, unused, for removal once the new pages have run for a few weeks.
`data/markets/` joins the CI commit allowlist.

## Testing

Unit tests for the pure parts: brand matching (including the false positives
above), coverage counts and trend thresholds, summary validation, move
de-duplication. Contract test: every market URL is in the sitemap inventory.
Then a real build against live data, deployed, and checked on production.

## Later (not in v1)

Signal Index themes on these pages, a brand-list editor, per-market JSON-LD
beyond the basics, and Spanish/Danish versions (locale pages are `noindex` today).
