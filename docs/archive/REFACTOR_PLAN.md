# Stability-First Refactor Plan

## A. Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WEEKLY PIPELINE                                   │
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│   │  INGEST     │────▶│  CLASSIFY   │────▶│  SELECT     │                   │
│   │             │     │             │     │  (Rerank)   │                   │
│   │ RSS + Pages │     │  Keywords   │     │  LLM + det. │                   │
│   │ + Discovery │     │  + Source   │     │  fallback   │                   │
│   └─────────────┘     └─────────────┘     └─────────────┘                   │
│         │                                       │                           │
│         ▼                                       ▼                           │
│   data/articles.json               data/digests/{week}.json                 │
│   data/weeks/{week}/               data/weeks/{week}/                       │
│     discoveryArticles.json           cover-input.json                       │
│                                      email-digest.json                      │
│                                      podcast.json                           │
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│   │  SUMMARIES  │────▶│  PODCAST    │────▶│  COVER IMG  │                   │
│   │  (GPT-3.5)  │     │  (TTS)      │     │  (DALL-E)   │                   │
│   └─────────────┘     └─────────────┘     └─────────────┘                   │
│                                                 │                           │
│                                                 ▼                           │
│                                     public/weekly-images/{week}.png         │
│                                     public/podcast/{week}.mp3               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            NEXT.JS APP (UI)                                 │
│                                                                             │
│   app/                                                                      │
│   ├── page.tsx (Home - loads digest, shows hero + categories)               │
│   ├── week/[weekLabel]/page.tsx (Week detail page)                          │
│   ├── archive/page.tsx                                                      │
│   ├── email-digest/page.tsx                                                 │
│   ├── sitemap.ts, robots.ts                                                 │
│   ├── api/build-digest/route.ts                                             │
│   └── api/push/* (Web Push routes)                                          │
│                                                                             │
│   Reads from: data/digests/*.json, data/weeks/*/                            │
│   Static: public/podcast/*.mp3, public/weekly-images/*.png                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities (Current)

| Folder | Responsibility |
|--------|----------------|
| `ingestion/` | RSS fetching, page scraping, source definitions, yield tracking |
| `discovery/` | Web search (Tavily), URL fetching, extraction, filtering, merge |
| `classification/` | Topic assignment via keywords + source matching |
| `digest/` | Build weekly digest, reranking, AI summaries, cover image, intro |
| `scripts/` | CLI runners for digest, podcast, cover, discovery, analysis |
| `scoring/` | Commerce materiality scoring (single file) |
| `config/` | Jewellery companies list (single file) |
| `podcast/` | TTS generation (ElevenLabs/OpenAI), text enrichment |
| `utils/` | Week handling, date formatting, site URL, topic display names |
| `lib/` | PWA utils, push storage |
| `app/` | Next.js pages, API routes, React components |
| `data/` | Articles DB, digests, caches, week artifacts |

---

## B. Top 10 Pain Points (Impact-Ordered)

### 1. 🔴 **Duplicated `.env.local` Loading** (HIGH IMPACT)
**Files:** 11 files with identical 30-line UTF-16 aware env loading block
```
ingestion/runIngestion.ts
scripts/discoverWeekly.ts
scripts/buildWeeklyDigest.ts
scripts/buildWeeklyPodcast.ts
scripts/buildWeeklyEmailDigest.ts
scripts/regenerateCover.ts
scripts/generateVapidKeys.ts
app/api/build-digest/route.ts
```
**Risk:** Any fix to env loading must be applied 11 times. Silent failures.

### 2. 🔴 **Duplicated Article/WeeklyDigest Types** (HIGH IMPACT)
**Files:**
- `ingestion/types.ts` – canonical Article type
- `classification/classifyTopics.ts` – redefines Article
- `digest/buildWeeklyDigest.ts` – extends Article
- `digest/rerankArticles.ts` – extends Article
- `app/page.tsx` – redefines Article + WeeklyDigest
- `app/week/[weekLabel]/page.tsx` – redefines Article + WeeklyDigest
- `app/email-digest/page.tsx` – redefines Article + WeeklyDigest
- `scripts/buildWeeklyPodcast.ts` – partial WeeklyDigest type

**Risk:** Type drift, missing fields in some places, confusing inheritance.

### 3. 🟠 **Script Duplication: digest/ vs scripts/** (MEDIUM IMPACT)
**Files:**
- `digest/buildWeeklyDigest.ts` – core logic (exports `buildWeeklyDigest`)
- `scripts/buildWeeklyDigest.ts` – CLI wrapper importing from digest/

**Confusion:** Which is the "real" one? Both exist, unclear ownership.

### 4. 🟠 **Hardcoded Week in `getCurrentDigestWeek()`** (MEDIUM IMPACT)
**File:** `utils/getCurrentDigestWeek.ts`
```ts
export function getCurrentDigestWeek(): string {
  return '2026-W05'; // <-- Manual update required each week
}
```
**Risk:** Forgetting to update breaks homepage.

### 5. 🟠 **Scattered Caching with No Invalidation Strategy** (MEDIUM IMPACT)
**Cache files:**
- `data/rerank_cache.json` – keyed by week+category+fingerprint
- `data/classification_cache.json`
- `data/intro_cache.json`
- `data/scene_director_cache.json`
- `data/themes_cache.json`
- `data/query_director_cache.json`

**Risk:** Cache invalidation is manual. No clear rules for when to bust.

### 6. 🟠 **No Shared `loadEnv()` Utility** (MEDIUM IMPACT)
Each script reimplements UTF-16 BOM detection. PowerShell sometimes saves files as UTF-16.
**Fix:** Single `lib/loadEnv.ts` importable everywhere.

### 7. 🟡 **Empty `filtering/` Directory** (LOW IMPACT)
Listed in root but contains nothing. Dead folder.

### 8. 🟡 **Commented-Out Arxiv Sources** (LOW IMPACT)
**File:** `ingestion/sources.ts` lines 127-145
Temporarily disabled with comment but may be forgotten.

### 9. 🟡 **No Safety Nets for Pipeline** (LOW IMPACT, HIGH VALUE)
No automated checks for:
- Paywall % exceeding threshold
- Podcast duration sanity check
- Coverage per category (min articles)
- Domain concentration (single source domination)

### 10. 🟡 **Inconsistent Topic/Category Naming** (LOW IMPACT)
- Topic keys: `"AI_and_Strategy"`, `"Ecommerce_Retail_Tech"`
- Display names: "AI & Strategy", "Ecommerce & Retail Tech"
- Totals keys: `AIStrategy`, `EcommerceRetail`

Three naming conventions for the same 4 categories.

---

## C. Proposed Target Structure

```
project/
├── app/                          # Next.js App Router (pages, API, components)
│   ├── page.tsx
│   ├── week/[weekLabel]/page.tsx
│   ├── email-digest/page.tsx
│   ├── archive/page.tsx
│   ├── api/
│   │   ├── build-digest/route.ts
│   │   └── push/
│   ├── components/               # React components (existing)
│   ├── globals.css
│   ├── layout.tsx
│   ├── sitemap.ts
│   └── robots.ts
│
├── lib/                          # SHARED CODE (extracted)
│   ├── env.ts                    # loadEnv() – UTF-16 aware env loading
│   ├── types/
│   │   ├── article.ts            # Article, SourceFeed, SourcePage
│   │   ├── digest.ts             # WeeklyDigest, DigestTopic
│   │   ├── topic.ts              # Topic enum/union, display names map
│   │   └── index.ts              # Re-export all
│   ├── week.ts                   # getWeekRangeCET, getCurrentDigestWeek, getPreviousWeek
│   ├── siteUrl.ts                # (existing, move from utils/)
│   ├── formatDate.ts             # (existing, move from utils/)
│   ├── pushStorage.ts            # (existing)
│   └── pwa.ts                    # (existing)
│
├── pipeline/                     # WEEKLY PIPELINE (consolidated)
│   ├── ingest/
│   │   ├── rss.ts                # fetchRss
│   │   ├── pages.ts              # fetchPages
│   │   ├── sources.ts            # SOURCE_FEEDS, SOURCE_PAGES
│   │   ├── yield.ts              # sourceYield tracking
│   │   └── runner.ts             # runIngestion (main entry)
│   │
│   ├── discover/
│   │   ├── queryDirector.ts
│   │   ├── queryDelta.ts
│   │   ├── searchProvider.ts     # Tavily wrapper
│   │   ├── fetchExtract.ts       # fetch + extract article text
│   │   ├── selectTop.ts          # filter + select candidates
│   │   ├── mergeArticles.ts
│   │   ├── domains/
│   │   │   ├── consultancy.ts
│   │   │   └── platform.ts
│   │   └── runner.ts             # discoverWeekly entry
│   │
│   ├── classify/
│   │   ├── topics.ts             # classifyTopic() + keywords
│   │   └── withLLM.ts            # optional LLM classification
│   │
│   ├── digest/
│   │   ├── build.ts              # buildWeeklyDigest
│   │   ├── rerank.ts             # LLM reranking + fallback
│   │   ├── summaries.ts          # generateSummariesForDigest
│   │   ├── intro.ts              # generateIntro
│   │   ├── themes.ts             # generateThemes
│   │   └── runner.ts             # scripts/buildWeeklyDigest entry
│   │
│   ├── publish/
│   │   ├── cover.ts              # generateCoverImage, sceneDirector
│   │   ├── emailDigest.ts        # buildWeeklyEmailDigest
│   │   └── podcast/
│   │       ├── script.ts         # generatePodcastScript
│   │       ├── tts.ts            # ElevenLabs, OpenAI TTS
│   │       └── runner.ts         # buildWeeklyPodcast entry
│   │
│   ├── scoring/
│   │   └── commerceMateriality.ts
│   │
│   └── checks/                   # SAFETY NETS (new)
│       ├── paywallPercent.ts
│       ├── podcastDuration.ts
│       ├── categoryMinimums.ts
│       └── domainConcentration.ts
│
├── config/
│   ├── jewelleryCompanies.ts     # (existing)
│   └── topics.ts                 # Topic definitions, display names, colors
│
├── scripts/                      # THIN CLI WRAPPERS ONLY
│   ├── ingest.ts                 # calls pipeline/ingest/runner
│   ├── discover.ts               # calls pipeline/discover/runner
│   ├── digest.ts                 # calls pipeline/digest/runner
│   ├── podcast.ts                # calls pipeline/publish/podcast/runner
│   ├── cover.ts                  # calls pipeline/publish/cover
│   ├── emailDigest.ts            # calls pipeline/publish/emailDigest
│   ├── validateFeeds.ts
│   ├── printSourceYield.ts
│   └── analyzeDigest.ts          # combine existing analyze scripts
│
├── data/                         # GENERATED DATA (gitignored except structure)
│   ├── articles.json
│   ├── digests/
│   ├── weeks/
│   └── cache/                    # ALL CACHES IN ONE PLACE
│       ├── rerank.json
│       ├── classification.json
│       ├── intro.json
│       ├── themes.json
│       ├── scene_director.json
│       └── query_director.json
│
├── public/
│   ├── podcast/
│   ├── weekly-images/
│   ├── icons/
│   ├── manifest.webmanifest
│   └── offline.html
│
└── docs/                         # Documentation
    ├── pipeline.md               # How the weekly pipeline works
    ├── development.md            # Local setup, env vars
    └── architecture.md           # This diagram
```

---

## D. Stepwise Refactor Plan (6-10 Safe Steps)

### Step 1: Extract Shared `loadEnv()` Utility
**Risk:** LOW | **PR Size:** Small

**Changes:**
1. Create `lib/env.ts` with the UTF-16 aware loading logic
2. Update all 11 files to import and call `loadEnv()` from lib/env
3. Remove duplicated code

**Files changed:**
- NEW: `lib/env.ts`
- EDIT: `ingestion/runIngestion.ts`
- EDIT: `scripts/discoverWeekly.ts`
- EDIT: `scripts/buildWeeklyDigest.ts`
- EDIT: `scripts/buildWeeklyPodcast.ts`
- EDIT: `scripts/buildWeeklyEmailDigest.ts`
- EDIT: `scripts/regenerateCover.ts`
- EDIT: `scripts/generateVapidKeys.ts`
- EDIT: `app/api/build-digest/route.ts`

**Verification:**
```bash
# Run all scripts that use env vars
npm run ingest -- --mode=rss --week=2026-W05
npm run discover -- --week=2026-W05
npm run build  # Next.js build should pass
```

---

### Step 2: Consolidate Type Definitions
**Risk:** LOW | **PR Size:** Medium

**Changes:**
1. Create `lib/types/article.ts` – canonical Article type
2. Create `lib/types/digest.ts` – WeeklyDigest, Topic types
3. Create `lib/types/index.ts` – re-export all
4. Update all files to import from `@/lib/types`
5. Remove duplicate type definitions

**Files changed:**
- NEW: `lib/types/article.ts`
- NEW: `lib/types/digest.ts`
- NEW: `lib/types/index.ts`
- EDIT: `ingestion/types.ts` (keep SourceFeed/SourcePage only)
- EDIT: `classification/classifyTopics.ts`
- EDIT: `digest/buildWeeklyDigest.ts`
- EDIT: `digest/rerankArticles.ts`
- EDIT: `app/page.tsx`
- EDIT: `app/week/[weekLabel]/page.tsx`
- EDIT: `app/email-digest/page.tsx`

**Verification:**
```bash
npm run build  # TypeScript compilation
npm run lint
```

---

### Step 3: Move Utils to lib/
**Risk:** LOW | **PR Size:** Small

**Changes:**
1. Move `utils/weekCET.ts` → `lib/week.ts`
2. Move `utils/getCurrentDigestWeek.ts` → `lib/week.ts` (merge)
3. Move `utils/siteUrl.ts` → `lib/siteUrl.ts`
4. Move `utils/formatDate.ts` → `lib/formatDate.ts`
5. Move `utils/topicNames.ts` → `lib/types/topic.ts`
6. Update all imports
7. Delete empty `utils/` folder

**Verification:**
```bash
npm run build
# Test home page renders
npm run dev & curl http://localhost:3000
```

---

### Step 4: Clean Up Empty/Dead Code
**Risk:** LOW | **PR Size:** Small

**Changes:**
1. Delete empty `filtering/` directory
2. Delete empty `podcast/tts/` directory
3. Remove or uncomment Arxiv feeds in `ingestion/sources.ts` with clear TODO

**Verification:**
```bash
# Ensure no imports reference deleted paths
npm run build
```

---

### Step 5: Consolidate Cache Files
**Risk:** LOW | **PR Size:** Small

**Changes:**
1. Create `data/cache/` directory
2. Update cache file paths in:
   - `digest/rerankArticles.ts` → `data/cache/rerank.json`
   - `discovery/queryDirector.ts` → `data/cache/query_director.json`
   - etc.
3. Add `.gitkeep` to `data/cache/`

**Verification:**
```bash
# Clear caches and rebuild
rm -rf data/*.json data/cache/
npm run ingest -- --week=2026-W05
npm run digest -- --week=2026-W05
# Verify cache files created in data/cache/
ls data/cache/
```

---

### Step 6: Automate `getCurrentDigestWeek()`
**Risk:** MEDIUM | **PR Size:** Small

**Changes:**
1. Update `lib/week.ts` `getCurrentDigestWeek()` to scan `data/digests/` for latest week
2. Add fallback to `getPreviousWeek()` if no digests found
3. Remove hardcoded return value

**Verification:**
```bash
npm run build
# Home page should show latest available digest
npm run dev & curl http://localhost:3000 | grep "Week 2026-W"
```

---

### Step 7: Create Thin Script Wrappers
**Risk:** MEDIUM | **PR Size:** Medium

**Changes:**
1. Ensure `scripts/*.ts` are thin wrappers that:
   - Call `loadEnv()` from lib/env
   - Parse args
   - Call the actual logic from pipeline modules
2. Move core logic from scripts to pipeline modules if mixed

**Files to review:**
- `scripts/buildWeeklyDigest.ts` → ensure it only calls `digest/buildWeeklyDigest.ts`
- `scripts/buildWeeklyPodcast.ts` → core TTS logic should be in `podcast/`

**Verification:**
```bash
npm run podcast -- --week=2026-W05
npm run cover -- --week=2026-W05
```

---

### Step 8: Add Safety Net Checks (New Feature)
**Risk:** LOW | **PR Size:** Medium

**Changes:**
1. Create `pipeline/checks/` with:
   - `paywallPercent.ts` – warn if >30% articles are paywalled
   - `categoryMinimums.ts` – warn if <3 articles in any category
   - `podcastDuration.ts` – warn if script <1500 or >3500 words
   - `domainConcentration.ts` – warn if single source >40% of category
2. Integrate checks into `buildWeeklyDigest` (log warnings, don't fail)

**Verification:**
```bash
npm run digest -- --week=2026-W05
# Should see check outputs in console
```

---

### Step 9: Add Basic Smoke Tests
**Risk:** LOW | **PR Size:** Medium

**Changes:**
1. Add `__tests__/pipeline.smoke.test.ts`:
   - Verify `buildWeeklyDigest()` returns valid structure
   - Verify `classifyTopic()` returns valid Topic
   - Verify `getSiteUrl()` returns valid URL
2. Add to `package.json`: `"test": "node --test"`

**Verification:**
```bash
npm test
```

---

### Step 10: Documentation Update
**Risk:** LOW | **PR Size:** Small

**Changes:**
1. Create/update `docs/pipeline.md` with current architecture
2. Create `docs/development.md` with setup instructions
3. Update `README.md` with quick start and script reference

---

## E. Safety Net Proposals (Do Not Implement Without Approval)

### 1. Paywall Percentage Check
```ts
// pipeline/checks/paywallPercent.ts
export function checkPaywallPercent(articles: Article[], threshold = 0.30): {
  pass: boolean;
  percent: number;
  paywalled: number;
  total: number;
} {
  const paywalled = articles.filter(a => a.paywalled).length;
  const percent = paywalled / articles.length;
  return {
    pass: percent <= threshold,
    percent,
    paywalled,
    total: articles.length,
  };
}
```

### 2. Category Coverage Check
```ts
// pipeline/checks/categoryMinimums.ts
export function checkCategoryMinimums(
  digest: WeeklyDigest,
  minPerCategory = 3
): { pass: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const [topic, data] of Object.entries(digest.topics)) {
    if (data.top.length < minPerCategory) {
      violations.push(`${topic}: ${data.top.length} articles (min ${minPerCategory})`);
    }
  }
  return { pass: violations.length === 0, violations };
}
```

### 3. Podcast Word Count Check
```ts
// pipeline/checks/podcastDuration.ts
export function checkPodcastWordCount(
  script: string,
  minWords = 1500,
  maxWords = 3500
): { pass: boolean; wordCount: number } {
  const wordCount = script.split(/\s+/).length;
  return {
    pass: wordCount >= minWords && wordCount <= maxWords,
    wordCount,
  };
}
```

### 4. Domain Concentration Check
```ts
// pipeline/checks/domainConcentration.ts
export function checkDomainConcentration(
  articles: Article[],
  maxPercent = 0.40
): { pass: boolean; dominant?: { source: string; percent: number } } {
  const counts = new Map<string, number>();
  for (const a of articles) {
    counts.set(a.source, (counts.get(a.source) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return { pass: true };
  const [source, count] = sorted[0];
  const percent = count / articles.length;
  return {
    pass: percent <= maxPercent,
    dominant: { source, percent },
  };
}
```

### 5. Type Consolidation Interface
```ts
// lib/types/article.ts
export interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  ingested_at: string;
  snippet?: string;
  aiSummary?: string;
  // Discovery fields
  discoveredAt?: string;
  sourceType?: 'rss' | 'page' | 'discovery' | 'consultancy' | 'platform';
  categoryHint?: 'Fashion & Luxury' | 'Jewellery Industry';
  // Ranking fields
  relevance?: RelevanceScore;
  rerankWhy?: string;
  rerankConfidence?: number;
  // Filtering fields
  paywalled?: boolean;
  hasFullText?: boolean;
}
```

---

## F. Verification Checklist (Manual)

After each refactor step, verify:

### Build & Type Check
```bash
npm run build
npm run lint
```

### Pipeline Runs
```bash
npm run ingest -- --mode=rss --week=2026-W05
npm run discover -- --week=2026-W05  
npm run digest -- --week=2026-W05
npm run podcast -- --week=2026-W05
npm run cover -- --week=2026-W05
```

### Production URLs (post-deploy)
```bash
curl -s -o /dev/null -w "%{http_code}" https://luxury-intel.com/
curl -s -o /dev/null -w "%{http_code}" https://luxury-intel.com/sitemap.xml
curl -s -o /dev/null -w "%{http_code}" https://luxury-intel.com/robots.txt
curl -s -o /dev/null -w "%{http_code}" https://luxury-intel.com/manifest.webmanifest
curl -s -o /dev/null -w "%{http_code}" https://luxury-intel.com/sw.js
curl -s -o /dev/null -w "%{http_code}" https://luxury-intel.com/week/2026-W05
```

### SEO Correctness
- Verify canonical URLs use `luxury-intel.com` not `vercel.app`
- Verify sitemap includes all week pages
- Verify robots.txt allows indexing

---

## G. Summary

**CORRECT Configuration:** ✅
- Pipeline flow is sound (ingest → classify → select → publish)
- Timezone handling is correct (Europe/Copenhagen)
- SEO/canonical URLs are correct (custom domain)
- Caching improves performance (LLM reranking, summaries)

**NEEDS CLEANUP:** ⚠️
- Duplicated env loading code
- Scattered type definitions
- Hardcoded week value
- Empty directories
- No automated safety checks

**RECOMMENDED APPROACH:**
1. Start with Step 1 (env loading) – lowest risk, highest DRY improvement
2. Then Step 2 (types) – prevents future type drift
3. Steps 3-5 are low-risk housekeeping
4. Steps 6-8 add safety and automation
5. Steps 9-10 improve maintainability

Each step is independently deployable and reversible.

---

## H. LLM Model Routing

All OpenAI text-generation calls are routed through `lib/llm/models.ts`.
The function `getModelFor(workflow)` returns the model for a given pipeline step.

### Default Model Assignment

| Workflow   | Default Model   | Used for                                        |
|------------|-----------------|--------------------------------------------------|
| `triage`   | `gpt-5-nano`    | Discovery delta-query generation                 |
| `classify` | `gpt-5-mini`    | Theme generation, article translation            |
| `summarize`| `gpt-4.1-mini`  | Article summaries, digest intro, email bullets   |
| `rank`     | `o4-mini`       | Article selection (selectTop), reranking         |
| `script`   | `gpt-4.1-mini`  | Podcast script generation                        |
| `polish`   | `gpt-4.1`       | Scene director (cover image prompt) — final pass |

### Environment Variable Overrides

Each workflow can be overridden at runtime without touching code:

| Env Variable          | Example                          |
|-----------------------|----------------------------------|
| `LLM_MODEL_TRIAGE`   | `LLM_MODEL_TRIAGE=gpt-4o-mini`  |
| `LLM_MODEL_CLASSIFY` | `LLM_MODEL_CLASSIFY=gpt-4o`     |
| `LLM_MODEL_SUMMARIZE`| `LLM_MODEL_SUMMARIZE=gpt-4.1`   |
| `LLM_MODEL_RANK`     | `LLM_MODEL_RANK=o4-mini`        |
| `LLM_MODEL_SCRIPT`   | `LLM_MODEL_SCRIPT=gpt-4.1`      |
| `LLM_MODEL_POLISH`   | `LLM_MODEL_POLISH=gpt-4.1`      |

Legacy per-module env vars (e.g. `RERANKER_MODEL_PRIMARY`, `SCENE_DIRECTOR_MODEL`, `THEME_MODEL`) still work and take priority when set.

---

## I. Video Rendering Pipeline

Weekly video digest generation using Sora API.

### Workflow

1. **Plan** (`video:plan`): Generate `videoPlan.json` from weekly digest
2. **Render** (`video:render`): Render Sora clips for each segment with caching
3. **Captions** (`video:captions`): Generate SRT captions from plan
4. **Final** (`video:final`): Compose final video with ffmpeg

### Features

#### Moderation-Safe Fallback
- Automatically sanitizes prompts when moderation blocks content
- Sanitization rules:
  - Removes sentences containing risky words (steal, hack, violence, etc.)
  - Replaces specific brand names with generic terms (Pandora → "luxury jewelry brand")
  - Removes age/minor mentions, political content
  - Adds "Safe, brand-friendly, professional tone." suffix
- Both `originalPrompt` and `sanitizedPrompt` saved to `videoRender.json` for traceability

#### Resume Mode (`--resumeFailed`)
- Loads previous `videoRender.json` and retries only failed segments
- Automatically skips cached segments
- Usage: `npm run video:render -- --week=2026-W06 --resumeFailed`

#### Billing Limit Detection
- Detects billing hard limit errors and fails fast
- Marks remaining segments as `skipped_due_to_billing`
- Clear error message: "Billing hard limit reached — aborting remaining segments"

#### Voiceover (ElevenLabs)
- `buildWeeklyVideoVoiceover` writes `voiceover.txt` from the plan’s voText and, when `ELEVENLABS_API_KEY` is set, generates `vo.wav` via ElevenLabs TTS (mp3 then converted to wav with ffmpeg).
- `video:final` runs voiceover then compose; if `vo.wav` exists it is passed to compose as the audio track (replacing Sora clip audio).
- Without the API key, only `voiceover.txt` is created and the final video keeps the original clip audio (or silent if Sora had none).

### Environment Variables

- `VIDEO_RENDER_ENABLED=true`: Required to enable rendering (safety flag)
- `OPENAI_API_KEY`: Required for Sora API calls
- `ELEVENLABS_API_KEY`: Optional. When set, `video:final` and voiceover step generate narrated audio (vo.wav) via ElevenLabs TTS from the plan’s voText; compose then uses it as the video audio track.
- `ELEVENLABS_VOICE_ID`: Optional. Voice ID for TTS (default: Rachel). Get IDs from ElevenLabs profile / API.

### Cache

- Location: `data/cache/video-clips.json`
- Key: SHA256 of `{model, size, seconds, prompt}`
- Cache entries include: `cacheKey`, `model`, `size`, `seconds`, `promptHash`, `outputPath`, `createdAt`