# Year in review 2026 and the coverage vs share price analysis

Two public pieces from one dataset, decided by the owner on 2026-11-14:

1. **Year in review**: what the 2026 archive shows. Planned formats: a page, a
   data film, a podcast special, LinkedIn and X posts, a short pitch to trade
   journalists. Target: live by about 2026-12-08, to ride the year-end wave.
2. **Coverage vs share price**: a standalone page with the full method and the
   honest result. Its headline finding is also the centrepiece chapter of the
   review; each piece links to the other.

## Status (2026-11-14)

| Part | State |
|---|---|
| Data engine (`review/`, `npm run review:build` → `data/review/2026.json`) | built, tested |
| Second price source to cross-check Yahoo | not done; do before publishing |
| Pages, film, podcast special, social posts, press pitch | not started |

Re-run the build in early December so November is a full month. New headlines
cost about $0.50 per 1,000 to label.

## What the data says (window 2026-03-02 → 2026-11-09, 36 weeks)

**The press watched the losers.** Articles naming each listed group or one of
its brands, from the 44 steady sources (28,128 articles), against the share
price from the first close of 2026:

| Company | Articles | Share price, year to date |
|---|---|---|
| LVMH | 448 | −36.3% |
| Kering | 226 | −38.5% |
| Richemont | 164 | −1.9% |
| Prada | 110 | −9.9% |
| Burberry | 68 | −15.8% |
| Hermès | 46 | −35.2% |
| Moncler | 23 | −17.1% |
| Signet | 20 | +36.2% |
| Pandora | 16 | +29.6% |
| Chow Tai Fook | 4 | −4.2% |
| Brilliant Earth | 0 | −19.0% |

**Coverage does not lead the share price.** Tested on the four companies with
at least two articles a week (LVMH, Kering, Richemont, Prada):

- Direction: a coverage surge says nothing about where the share goes, at any
  lag from −4 to +4 weeks (|r| ≤ 0.17, none significant).
- Size: coverage surges in the same week as big moves (r = 0.32, p = 0.001).
  In the loudest 10% of company-weeks the share moved 4.2% against the basket;
  in the rest, 2.1%.
- The significant r = −0.36 at lag −3 is an artefact, not a finding: a big move
  comes with a coverage spike, which raises the trailing mean that the next
  weeks' surprise is measured against. Do not publish it as a result.
- Sample: 4 companies × 28 usable weeks. Small. Say so wherever it is shown.

**Themes in the luxury trade press** (14 outlets, 6,922 headlines, each outlet
weighted equally; average monthly share, March–June against July–October):

| Theme | Mar–Jun | Jul–Oct |
|---|---|---|
| Retail distress and bankruptcy | 2.2% | 0.9% |
| World Cup and sports marketing (10.4% in June) | 4.9% | 2.6% |
| Tariffs and supply chain | 2.5% | 1.7% |
| Consumer and macro outlook | 3.2% | 2.2% |
| Executive leadership changes | 4.2% | 2.9% |
| AI in retail | 2.5% | 2.6% |

AI in retail is flat. A first pass with pooled shares showed it "cooling"
(2.9% → 1.8%); that was the change in outlet mix in October, and it disappeared
once outlets were weighted equally.

## Method and the reasons for it

- **Window starts 2026-03-02.** Most feeds were connected in March; before
  that the archive is a handful of sources.
- **Steady sources only, shares not counts.** Daily ingestion (2026-10-05)
  tripled October's raw counts, and new feeds joined the same week. A source
  counts if it published in 80% of the weeks (companies) or months (themes).
  Bing News copies of feeds are excluded.
- **Equal weight per outlet for themes** (`review/themes.ts`), with at least 8
  articles from the outlet that month.
- **Themes are labelled by a model**, not keywords: the `/markets` keyword
  themes catch 30–40 articles each over eight months, too few to chart. The
  taxonomy (18 themes, 3 marked as constant background) was proposed by
  `claude-opus-5-5` from 1,360 sampled headlines on 2026-11-14 and then frozen
  in `data/review/2026/taxonomy.json`. Changing it means deleting
  `labels.json` and relabelling everything (about $5).
- **No jewellery themes chapter.** Five steady outlets, mostly Australian,
  20–90 articles per theme. Jewellery appears through the companies.
- **Excess return against an equal-weight basket** of all eleven companies, so
  a week when every luxury share falls is not read as signal.
- **Permutation p-values with a fixed seed**, so published numbers do not
  change between builds.

## Owner decisions

- 2026-11-14: Pandora appears as a plain data row with no commentary. The
  "never about Pandora" rule (`PRODUCT.md`) covers the weekly quote; dropping a
  tracked company from a data table would look worse than including it.
- 2026-11-14: both pieces go ahead.

## Files

| Path | What |
|---|---|
| `review/panel.ts` | window, steady sources, the luxury press panel |
| `review/companies.ts` | company coverage, price history |
| `review/backtest.ts` | surprise, lead/lag, permutation test, event study |
| `review/themes.ts` | model labelling (cached) and monthly shares |
| `review/build.ts`, `scripts/buildYearReview.ts` | the build |
| `lib/review/types.ts` | the output's shape |
| `data/review/2026/` | `taxonomy.json`, `labels.json` (cache), `prices.json` (daily closes) |
| `data/review/2026.json` | the output the pages and film read |
| `__tests__/review.test.ts` | tests |
