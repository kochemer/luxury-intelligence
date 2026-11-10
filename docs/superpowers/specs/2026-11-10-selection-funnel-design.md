# Selection funnel v2: design

Status: built and wired into `digest/buildWeeklyDigest.ts` on `agent/selection-funnel` (2026-11-10), default `v2`, not deployed. Tuning round 3 (2026-11-10): lead bar independence >= 3 and quality >= 3.4, editor order primary, editor `sameEvent` groups, cluster thresholds 0.82/0.78, travel retail to Luxury, geography rule (see docs/pipeline-decisions.md).
Deviations after review (2026-11-10): selection paywall patterns are word-bounded and 403 counts as unknown; validatePicks also drops excluded judge types, adRisk high, applies a per-domain cap (2 per category; 5 in the shortlist), series-title duplicates, at most one paywalled story in ranks 1-3, at most 2 per mainCompany in ranks 1-5, and judge fallbacks never meet the lead bar; hard news beats analysis of the same event; Pandora and peer results are significance 4+; Ecommerce scope excludes sourcing, labour and sustainability regulation; all OpenAI calls use a 90 s timeout with 1 retry; judge cache is atomic, serialised and re-judges snippet-only entries once full text is fetched.
Shared types: `selection/types.ts`. Code lives in `selection/`.

## Why

Measured on W45 (2026-11-02..08), the legacy top-7 selection
(`digest/buildWeeklyDigest.ts#selectTopN` + `digest/rerankArticles.ts`):

- The LLM saw 18 of 267–505 articles per category (4–7 %). The 18 were chosen by
  counting 29 retail words (`scoreCandidateForTrimming`), which works against the
  AI category's own prompt.
- The LLM read a title plus the first sentence cut at 100 characters.
- The "sponsored" penalty matched the substring `ad` (trade, head, already):
  983 of 2,279 articles penalised, 9 real. No real sponsored detection existed.
- Same story from several outlets competed as separate candidates; dedupe was
  exact-title only.

## Reader (all four categories)

A professional working in fashion, luxury, jewellery or ecommerce (for example a
Pandora colleague) who wants to follow the relevant news reliably each week.
AI & Strategy keeps its AI-first criteria (major lab, model, economics and policy
news matter to this reader), plus substantive applied AI in retail.

The top of each category (ranks 1–5, tier `lead`) must be significant for the
industry, well written, well thought out, and must not be sponsored content, a
press release or a hidden ad. Ranks 6–7 (tier `more`) may be lighter but must
still be independent journalism.

## Funnel

| # | Stage | File | Model | Input → output (W45 scale) |
|---|---|---|---|---|
| 0 | Week pool | `runFunnel.ts` | – | in-week articles, URL + exact-title dedupe (~2,280) |
| 1 | Hard filters | `hardFilters.ts` | rules | drop sponsored/PR/advertorial (~2,100) |
| 2 | Story clusters | `cluster.ts` | `text-embedding-3-small` | same event → one cluster, coverage = distinct sources |
| 3 | Triage | `triage.ts` | `gpt-6-luna` effort none | every article: category, type, significance, ad risk |
| 4 | Shortlist | `shortlist.ts` | rules | 25 per category, one per cluster |
| 5 | Full text | `fullText.ts` | – | body text for the ~100 shortlisted |
| 6 | Quality judge | `judge.ts` | `gpt-6.1-sol` | rubric scores per shortlisted article |
| 7 | Editor pick | `editorPick.ts` | `gpt-6.1-sol` | ranked 7 per category + deterministic validation |

The keyword classifier (`classification/classifyTopics.ts`) is no longer the
gate: triage assigns the category. The classifier's answer is passed to triage
as a hint, and articles it dropped (no keyword) are triaged too.

### 1. Hard filters (deterministic, pure)

`hardFilter(article, opts?) → HardFilterResult`, plus `scanDisclosures(text)`
reused by stage 5 on full text.

Drop when any of:
- URL path segment (split on `/`, also slug tokens) is one of: `sponsored`,
  `sponsor-content`, `partner-content`, `partnercontent`, `paid-post`, `paidpost`,
  `brandvoice`, `brand-studio`, `brandstudio`, `advertorial`, `branded-content`,
  `native-ad`, `press-release`, `press-releases`, `pressrelease`, `newswire`,
  `promoted-content`, `sponsored-content`. Segment/slug-token match only, never substring.
- Source or domain is a press-release wire: PR Newswire, Business Wire,
  GlobeNewswire, EIN Presswire, Accesswire, PRWeb, Newsfile, PR.com, openPR.
- Title starts with a label: `Sponsored`, `[Sponsored]`, `Advertorial`,
  `Partner content`, `Paid post`, `Promoted:` (case-insensitive, optional `:`/`|`/`-`).

Soft flags (never drop alone; shown to triage and judge): whole-phrase matches in
title/snippet of `sponsored by`, `in partnership with`, `brought to you by`,
`paid partnership`, `affiliate`, `we may earn a commission`,
`presented by`. (`press release` is deliberately not one: it fires on independent
reporting such as "said in a press release"; wires and URL paths catch real
releases and the judge's independence score covers the rest.)

### 2. Story clusters

Embed `title + first 200 chars of snippet` with `text-embedding-3-small`
(batches of 256; no persistent cache, the call costs fractions of a cent).
Greedy clustering in a fixed order (articles sorted by URL): an article joins the
first existing cluster whose **centroid** has cosine ≥ `SELECTION_CLUSTER_SIM`
(default 0.82) **and** whose seed has cosine ≥ 0.78; otherwise it seeds a new
cluster. Centroid-based, so no single-link chaining. `coverage` = distinct
sources. If the embedding call fails, every article is its own cluster (log a
warning, don't fail the digest). Expose a pure `clusterByVectors(items, vectors,
opts)` for tests.

### 3. Triage (cheap LLM, every article that passed stage 1)

Batches of 40, concurrency 4, model `SELECTION_TRIAGE_MODEL` (default
`gpt-6-luna`, reasoning `none`). Use `maxTokensParam` / `temperatureParam` /
`reasoningParam` from `lib/llm/models.ts`. JSON output, validated; one retry per
batch, then per-article fallback (`category` = classifier result, `type`
`other`, `significance` 2, `adRisk` `low`, `fallback: true`).

Per article the model sees: index, title, source, URL path, snippet ≤ 400 chars,
classifier hint, soft flags. It returns `category | null`, `type`,
`significance`, `adRisk`, `reason`.

Significance anchors (same scale everywhere, judged for the reader above):
- 5 landmark: a top-3 story of the week for this category (major deal or
  result, CEO change at a major group, frontier model release, binding
  regulation, market-moving data).
- 4 important: someone following the category should know it this week.
- 3 notable: worthwhile, narrower impact.
- 2 minor: incremental, local, single small company.
- 1 noise: irrelevant, trivial, promotional.

Category definitions: reuse the intent of the four legacy rerank prompts in
`digest/rerankArticles.ts` (AI-first for AI & Strategy; industry significance for
Ecommerce; deals/results/leadership/strategy for Luxury and for Jewellery incl.
watches, diamonds, gold, lab-grown, major jewellers and trade bodies).
Controversy filter from the legacy prompts carries over (war, culture-war,
election horse race → `significance` ≤ 2 unless direct retail/trade impact).

Cache: `readJsonCache/writeJsonCache` kind `selection_triage`, shape
`{ [week]: { [url]: TriageResult & { v: PROMPT_VERSION, model } } }`; keep the
last 8 weeks only. Bump `TRIAGE_PROMPT_VERSION` to invalidate.

### 4. Shortlist (deterministic, pure)

Per category, from articles not dropped, triage `category` = that category:
- exclude `adRisk` high and `type` in {sponsored, press_release, podcast_video, event_promo};
- one representative per cluster: highest `significance`, then type bonus, then
  longer snippet, then URL;
- `shortlistScore = significance*10 + typeBonus + min(coverage-1, 3)*2 − (adRisk medium ? 4 : 0)`,
  typeBonus: hard_news +3, analysis +3, feature_profile +1, interview 0, other 0,
  opinion −2, review −3, how_to_explainer −4, listicle_roundup −4;
- sort desc (ties by URL), cap 4 per source, take `SELECTION_SHORTLIST_N` (25).

### 5. Full text

Fetch HTML for each shortlisted URL (concurrency 6, 15 s timeout, browser-like
UA as `discovery/fetchExtract.ts` does), extract main text with the existing
extraction helpers (export what's needed from `discovery/fetchExtract.ts`,
don't duplicate), reuse its paywall detection. Truncate to 12,000 chars. Run
`scanDisclosures` on the body. On failure or paywall: `status: snippet_only`,
text = snippet. Cache in a **gitignored** dir `data/cache/selection-fulltext/`
(one JSON per URL hash); never commit body text.

### 6. Quality judge (strong LLM, shortlist only)

One call per article, concurrency 4, model `SELECTION_JUDGE_MODEL` (default
`gpt-6.1-sol`, reasoning per `getReasoningFor('rank')` or none). Input: category
+ reader, title, source, URL, coverage (how many outlets ran the story), paywall
status, disclosures + soft flags, body text (≤ 12,000 chars).

Rubric, 1–5 each, with anchors in the prompt so length is not rewarded:
- significance — what changes for the industry, and for whom
- substance — new facts, numbers, named sources, original reporting (vs rewrite of another outlet)
- insight — explains why it happened and what comes next (vs restating)
- writing — clear, well structured, no filler
- independence — 5 independent journalism … 1 advertorial/PR/hidden ad.
  Hidden-ad signals: only the company quoted, no independent voice or numbers,
  promotional adjectives, prices / where to buy, call to action, reads like a
  press release.

Also `hiddenAd` (bool), corrected `type`, `why` (≤ 20 words, why it matters to
the reader). `quality = 0.35·sig + 0.20·substance + 0.20·insight + 0.10·writing + 0.15·independence`.

Fallback on failure: scores from triage (`significance` = triage, others 3,
`independence` 4 unless adRisk medium → 3), `fallback: true`.

Cache kind `selection_judge`, same shape/pruning as triage, `JUDGE_PROMPT_VERSION`.

### 7. Editor pick

One call per category, model `SELECTION_EDITOR_MODEL` (default `gpt-6.1-sol`).
Input: the judged shortlist (title, source, type, coverage, cluster id, five
scores, quality, why, paywall). Task: choose and order up to 7 for the reader;
ranks 1–5 from candidates meeting the lead bar where possible; vary sub-topics;
prefer the outlet with original reporting when two cover the same event; at most
one paywalled story in ranks 1–3. Returns `{ url/id, rank, editorWhy }`.

Deterministic validation after the LLM (`validatePicks`, pure, tested):
- remove `hiddenAd` or `independence` < 3; remove a second item from the same cluster;
- cap 3 per source; AI & Strategy: max 1 arXiv source (all arXiv feeds count as one);
- the editor's order is primary. The editor also returns `sameEvent` groups
  (shortlisted candidates covering one event); each group is merged into one
  cluster, one pick per group, the editor's first;
- lead bar: `significance ≥ 4 && quality ≥ 3.4 && independence ≥ 3` (plus not
  hiddenAd, type not excluded, adRisk not high). An editor pick in ranks 1–5
  that fails the bar is swapped down (to 6–7 or out) only when a bar-passer can
  take its place (the editor's later picks first, then the pool by quality);
  bar-passers are never reordered among themselves. If fewer than 5 pass, fill
  with the best remaining by `quality` (still tier `lead` for ranks 1–5 so UI
  is unchanged — record `barMet: false` in the report);
- backfill to 7 from remaining judged candidates by `quality`, still respecting
  the caps; return fewer only if the pool is exhausted;
- tier = `lead` for ranks 1–5, `more` for 6–7.
LLM failure → same function on candidates sorted by `quality`.

## Output

Each selected article = original `Article` fields + `relevance` (zeroed legacy
shape, for type compatibility) + `selection: SelectionExplain`.
`data/weeks/{week}/selection-report.json`: stage counts, per-category shortlist
with triage + judge scores, picks, drops with reasons, model names, failures,
token usage if available. `totals.byTopic` in the digest = triage category counts.

## Switch and fallback

`SELECTION_FUNNEL` env: `v2` (default on this branch) or `legacy`. Any thrown
error inside v2 for the whole run → log loudly and fall back to legacy for that
build (the digest must still publish). Legacy path gets the bug fixes
(whole-word sponsored markers, exact outlet match for the quality-source bonus,
full snippet to the LLM, corrected module comment).

## Evaluation (no gold set; owner declined to label)

`scripts/selectionCompare.ts --week=YYYY-Www`: legacy published top 7 vs v2 top 7
per category. Blind pairwise judge with a different model family
(`claude-opus-5-5` via `ANTHROPIC_API_KEY`), A/B order randomised and swapped
(two calls, position bias cancels), criteria = this spec's reader + lead-bar
definition. Writes `data/harness/{week}__compare.json` and a side-by-side HTML.
Run on W43–W45.

## Cost (estimate, W45 scale)

Triage ~2,100 articles ≈ 55 calls, ~0.4 M input / 0.1 M output tokens on Luna.
Judge ~100 calls × ~4 k tokens ≈ 0.4 M input on Sol. Editor 4 calls. Embeddings
~0.15 M tokens. Measure actual usage on the first run and record it in
`docs/pipeline-decisions.md`.
