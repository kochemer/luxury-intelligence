# Luxury Intelligence — Improvement Plan

Living plan across four areas. Phase 1 (codebase simplification) is being
implemented now; later phases are scoped but not yet started. Each phase is a
self-contained, committable chunk that must leave the app compiling, building,
and deploying cleanly.

## Area 1 — Codebase simplification

### Phase 1 (implementing now) — pure cleanup, no behaviour change
- **Archive one-off root docs.** ~20 diagnostic/fix/report markdown files at the
  repo root (`COVER_IMAGE_*`, `PWA_*`, `RERANK_*`, `REFACTOR_PLAN`,
  `*_DIAGNOSIS`, `ORCHESTRATOR_*`, `BORINGNESS_BREAKER`, `VAPID_KEY_DIAGNOSTIC`,
  `GPT_IMAGE_MIGRATION`, `SEO_DIAGNOSTIC_REPORT`, `AUDIT_ORCHESTRATOR_REPORT`,
  `AI_CATEGORY_DEBUG_DIAGNOSIS`, `CUSTOM_DOMAIN_INDEXING_DIAGNOSTIC`) move to
  `docs/archive/` via `git mv` (history preserved). Verified no code, config, or
  workflow references any of them. Kept at root: `CLAUDE.md`, `README.md`,
  `RANKING_METHODOLOGY.md`, `DISCOVERY_USAGE.md`, `IMPROVEMENTS.md`,
  `SEO_METADATA.md`, `SEO_ROUTES.md`.
- **Delete the legacy cover-image fallback.** `digest/generateCoverImage.ts`
  carries ~360 lines (`buildImagePrompt` + `rewriteHeadline`,
  `extractWhatsHappening`, `extractWhyItMatters`, `extractVisualAnchors`,
  `selectArticlesForImage`, and the `ArticleContext`/`VisualAnchor` types) that
  are reachable only from a fallback branch, and which paint an aesthetic that
  contradicts the primary Scene Director path. The Scene Director already has its
  own internal fallback (`generateFallbackPrompt`) and only throws on empty
  input, so removing the legacy branch is behaviour-equivalent for real runs.
  Also collapse `addBannerCompositionConstraints` (a no-op wrapper around
  `hardenPromptForPhotorealism`). Kept: `extractKeywords` (still feeds
  `coverKeywords`, referenced by `seo/audit`).

### Phase 2 (later) — low-value micro-cleanups, deferred
- Remove the dead `topInfo` prop (declared in `DigestClientView` props, never
  rendered; threaded through the digest + locale home pages).
- Relocate ~13 confirmed-dead one-off scripts to `scripts/oneoff/` with their
  relative imports fixed.

### Phase 3 (later, overlaps Area 2) — structural
- Collapse the three overlapping ranking stages (discovery `selectTop` LLM →
  heuristic `calculateRelevanceScore` → `rerankArticles` LLM). This changes
  selection output, so it is owned by Area 2 rather than "simplification".

## Area 2 — Article-selection quality

Decisions taken with the owner (16 Sep 2026):

- **Phase 0 — Measurement harness (do first).** No selection change ships
  without a before/after diff. A snapshot tool rebuilds the top-7 per category
  for chosen past weeks; a diff tool compares two snapshots (added / removed /
  reordered). Every change below is validated by re-running it. This is also the
  first real test coverage for selection.
- **Recency: NO graded score.** The week-window filter in `buildWeeklyDigest`
  already enforces "published within the digest week, weekday-agnostic" and
  drops undated articles — which is exactly the desired rule. Action: extract +
  unit-test that filter to lock the contract, and delete the dead
  `recencyScore` plumbing. (Date *accuracy* via `dateConfidence` is a separate,
  later, low-priority item — not recency.)
- **Classification precision (DONE, 16 Sep 2026).** Pool-health analysis showed
  the biggest quality leak was upstream: `classifyTopic`'s catch-all default
  (`return "Ecommerce_Retail_Tech"`) dumped every unmatched article into
  Ecommerce — ~1,200 Dezeen architecture pieces plus general tech — and bare
  `"gold"/"silver"` + the `"cart"`-in-"Cartier" substring bug scattered finance
  stories into Jewellery. Fixed: `classifyTopic` now returns `Topic | null`
  (off-topic articles are dropped, not misfiled), removed the noise keywords, and
  added word-boundary matching for `cart`. Result on W34: Ecommerce pool
  464 → 123 (348 off-topic dropped), other categories intact; new
  `__tests__/classifyTopic.test.ts` locks the cases. **Remaining gap this exposed:
  Jewellery is genuinely thin (~17) and single-source-dominated — needs the
  feed-recovery / source-breadth work, not more ranking.**
- **Demote keywords (agreed).** Keyword boost becomes a tie-breaker, not a
  primary signal; source tier leads.
- **Externalise source tiers (agreed).** Move `SOURCE_WEIGHTS` + the inline
  AI-source magic numbers to a `config/sourceTiers` data file, per category.
- **Collapse the middle layer (agreed).** Delete `calculateRelevanceScore` as a
  competing ranker; keep one cheap prefilter feeding a single LLM rerank with a
  wider candidate window, so the model — not a heuristic — decides what's
  interesting/relevant.
- **Upgrade the rerank model → gpt-4.1 (DONE, 16 Sep 2026).** Harness A/B on
  W34 (o4-mini vs gpt-4.1, same clean pool): o4-mini FAILED on 3/4 categories
  (fell back to gpt-4.1-mini); gpt-4.1 succeeded on all four and made better
  picks (dropped a filler trade-fair notice for a substantive story; put a
  stronger Ecommerce lead first). Changed `RERANK_MODEL_PRIMARY` default to
  `gpt-4.1` (still env-overridable for future A/Bs). Also fixed the rerank cache
  key to include the model (a swap previously returned stale cached picks).
  Discovery's coarse 100→40 pass stays on the cheap model.
  - **Follow-up 1 — diversity-reject → repair (DONE, 16 Sep 2026).** The
    `validateRerankResponse` source-diversity/Arxiv checks were REJECTING the
    whole LLM ranking whenever the model over-picked from a dominant source,
    silently using the deterministic fallback. Removed those checks from
    validation (they are repairable, not structural): the mapped LLM result now
    flows through `applySourceDiversity`, which trims to ≤3/source in the model's
    rank order and backfills freed slots from the pool. Harness (W34, gpt-4.1
    before/after): AI 5/7 picks changed (added Stratechery, promoted the GPT-5.6
    pricing story to #1, dropped clustered TechCrunch), Luxury 5/7 changed
    (dropped Fashionista job listings + celebrity-shoe filler for substantive
    luxury-business stories). This is what makes the gpt-4.1 upgrade actually pay
    off in concentrated categories.
  - **Follow-up 2 (latent): `loadEnv()` runs after ES imports**, so model
    overrides in `.env.local` (e.g. a stale `RERANK_MODEL=gpt-4o-mini`) are read
    too late and silently ignored. Real env vars (CI, inline) work. Worth fixing
    so local config isn't dead.
  - **`RERANK_MAX_ITEMS` 18 → 30: TESTED AND REJECTED (16 Sep 2026).** Harness
    A/B (W34, gpt-4.1): widening the window did NOT help — Luxury regressed
    (celebrity "Meghan Markle heels" filler returned, LV×Porsche dropped) and AI
    moved laterally (lost the Stripe/OpenRouter deal for more TechCrunch). The
    tighter 18-item pre-trim is helping, so we keep 18. Kept the correctness fix
    of including `RERANK_MAX_ITEMS` in the rerank cache key (so future A/Bs of
    this value don't reuse stale picks).
  - Still to do: sharpen the rerank prompt around reader interest (A/B'd via the
    harness).
- **Story-level dedup (agreed, E).** URL canonicalisation + near-dup clustering
  so one event occupies one slot.
- **Feedback loop (agreed, F).** Fold `IssueRating` into source weighting once
  rating volume is meaningful.

## Area 3 — Cover-image quality

- **Fixed the self-contradicting Scene Director prompt (DONE, 17 Sep 2026).**
  Once the anti-repetition block activated (≈ every week), it demanded a *dark
  counter background*, *soft bokeh*, and *no people/rooms/narrative* — directly
  contradicting the main art direction (*avoid dark surfaces*, *people optional*,
  and a later rule banning bokeh/DoF language as CGI-inducing). Removed that
  block; the prompt now gives one coherent, light/natural direction.
- **Fixed the aspect-ratio mismatch (DONE).** The fallback prompt asked for a
  "3:1 or wider" banner that `gpt-image-1` cannot render (it outputs 1536×1024,
  3:2). Rewrote it to target 3:2 landscape with the focal subject in the central
  band so it survives the hero crop.
- **Set `quality: 'high'` (DONE)** on both `images.generate` calls.
- Still open: decide one brand-appropriate art direction (premium vs. the
  current jokey object-juxtaposition), and optionally change the hero's
  `background-position` crop to match the new central-band composition.

## Area 4 — Reliability / cost (planned)
- Fast-fail on `insufficient_quota` (no 8× retry on a "no credits" 429) and add a
  preflight balance/budget check.
- Surface feed-health (403/429 sources) from the existing `sourceYield` report.
- Add tests for selection scoring, dedup, and cover-prompt assembly.

## Backlog — ingestion overhaul (owner-flagged 16 Sep 2026, do after Area 2)

Dissect the ingestion layer and make it more robust, enriched, and relevant. The
pool-health work already surfaced the leads.

**Feed-health audit (17 Sep 2026, `npm run validate:feeds`): 62/69 valid, 7 broken.**
Characterised each broken feed (the fetcher already sends a browser UA, so this
was never a missing-UA problem):
- **Intermittent (Cloudflare rate-blocks under load; 200 in isolation):** Business
  of Fashion (the premier luxury source), VentureBeat-AI (429). → **Addressed:**
  added retry-with-backoff on 403/429/5xx to `fetchRss` (recovers these most
  weeks).
- **Hard-blocked (403 on every isolated request too):** WatchPro, Professional
  Jeweller. → Still broken; need alternate feed URLs (Google-News RSS for the
  publication, a full-text RSS proxy) or replacement sources.
- **Format broken:** Sourcing Journal returns HTML, not XML (feed moved/changed);
  Just Style intermittent. → Need new URLs.

Remaining robustness work:
- Recover the hard-blocked feeds via alternate URLs; per-source health alerting
  off the existing `sourceYield` report (so a silently-dropped feed is noticed).
- **Relevance / breadth:** add the missing premier sources — Business of Fashion,
  Vogue Business (luxury-business), plus more jewellery/watch trade titles to
  fix Jewellery's thin, single-source-dominated pool; prune persistently
  off-topic sources (e.g. Dezeen) at the root instead of only dropping them at
  classification.
- **Enrichment:** stronger date extraction/confidence (mislabeled dates let stale
  items into the week window), full-text/topic signals to improve classification
  and reranking, and de-duplication at the story level across sources.
- Treat `pool:health` as the scorecard for all of the above.
