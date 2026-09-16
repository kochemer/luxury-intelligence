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
- **Demote keywords (agreed).** Keyword boost becomes a tie-breaker, not a
  primary signal; source tier leads.
- **Externalise source tiers (agreed).** Move `SOURCE_WEIGHTS` + the inline
  AI-source magic numbers to a `config/sourceTiers` data file, per category.
- **Collapse the middle layer (agreed).** Delete `calculateRelevanceScore` as a
  competing ranker; keep one cheap prefilter feeding a single LLM rerank with a
  wider candidate window, so the model — not a heuristic — decides what's
  interesting/relevant.
- **Upgrade the rerank model (recommended, A/B via harness).** The final rerank
  runs 4×/week, so a stronger model is nearly free and is the highest-leverage
  quality lever. Raise `RERANK_MAX_ITEMS` (18 → ~30-40) and sharpen the prompt
  around reader interest. Test `o3` / `gpt-4.1` / current strongest vs `o4-mini`
  via the harness; keep discovery's 100→40 pass on the cheap model.
- **Story-level dedup (agreed, E).** URL canonicalisation + near-dup clustering
  so one event occupies one slot.
- **Feedback loop (agreed, F).** Fold `IssueRating` into source weighting once
  rating volume is meaningful.

## Area 3 — Cover-image quality (planned)
- Fix the self-contradicting Scene Director prompt (dark-vs-not-dark background,
  people-vs-no-people once anti-repetition activates).
- Resolve the aspect-ratio mismatch (prompt asks 3:1; `gpt-image-1` renders 3:2)
  with a defined focal safe-area or deterministic post-crop.
- Set `quality: 'high'` on the image call.
- Decide one brand-appropriate art direction (premium vs. jokey juxtaposition).

## Area 4 — Reliability / cost (planned)
- Fast-fail on `insufficient_quota` (no 8× retry on a "no credits" 429) and add a
  preflight balance/budget check.
- Surface feed-health (403/429 sources) from the existing `sourceYield` report.
- Add tests for selection scoring, dedup, and cover-prompt assembly.
