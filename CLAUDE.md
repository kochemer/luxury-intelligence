# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Luxury Intelligence** (`luxury-intel.com`) — a Next.js 16 / React 19 weekly digest site for luxury, e-commerce, and retail-tech news. It ingests RSS feeds and web pages, classifies and ranks articles with OpenAI, builds JSON digest files, renders them as a PWA with Tailwind CSS v4, and distributes content via email (Resend) and a podcast (ElevenLabs if its key works, otherwise OpenAI `tts-1`; the owner is moving off ElevenLabs). Subscribers and payments are managed through a Neon Postgres DB (Drizzle ORM) and Stripe.

## Documentation rules

The repo is the only memory shared between agents and sessions. **Read
[`docs/README.md`](docs/README.md) once**: it says where each kind of knowledge
belongs and maps every doc with its status. The short version:

- Update docs **in the same commit** as the code change they describe (new
  script, env var, route, pipeline step, workflow → this file).
- Dated state and numbers go in `docs/<area>-status.md`, never here. Reasons go
  in `docs/<area>-decisions.md`. Deploy/CI facts go in `docs/operations.md`.
- Use absolute dates. Replace stale text, don't append to it. Mark backlog items
  `[DONE]`/`[DROPPED]` with the commit hash.
- A fact about the code or infra must never live only in an agent's private
  memory. If you find one there, move it into the repo.
- No new diagnostic `.md` files at the repo root. Finished reports go to `docs/archive/`.
- Before committing, ask: would the next agent hit what I just hit? If yes, write it down.

## Commands

```bash
# Development
npm run dev          # Next.js dev server (PWA disabled in dev)
npm run build        # Production build (next build --webpack, required for next-pwa)
npm run lint         # ESLint

# Tests
npm test             # node:test runner on __tests__/**/*.test.ts

# Weekly content pipeline (run in order or all-at-once)
npm run digest:preflight          # Check env vars before running
npm run digest:weekly             # Full pipeline: ingest → discover → classify → build digest → podcast → cover → email
  # Options: --week=YYYY-Www --skipRss --skipPodcast --skipCover --skipEmail --forceRebuild

# Individual pipeline steps
npm run ingest        # RSS + page ingestion
npm run discover      # Discovery (find new candidate articles)
npm run cover         # Regenerate cover image
npm run podcast       # Build weekly podcast audio
npm run email:weekly  # Send weekly email digest (NOT idempotent: re-running double-sends)
npm run markets:build # /markets pages data (also pipeline step 9)

# DB migrations (Drizzle)
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate    # Apply migrations

# Weekly 60s short (separate package, see video-short/README.md; $2/week cap)
npx tsx video-short/src/run.ts --week=YYYY-Www

# Older video pipeline (scripts/ + video/)
npm run video:plan && npm run video:render && npm run video:wait && npm run video:captions && npm run video:final && npm run video:compose
```

## Architecture

### Data Flow

```
RSS/web sources → ingestion/ → data/articles.json
                                    ↓
                  discovery/ (OpenAI ranking/filtering)
                                    ↓
                  classification/ (topic tagging)
                                    ↓
                  digest/ → data/digests/YYYY-Www.json
                                    ↓
              email/  podcast/  cover  markets/  app/ (Next.js pages)
```

Orchestrated by `pipeline/runWeeklyPipeline.ts` (entry: `scripts/runWeeklyPipeline.ts`).
Module-level detail, artifacts and caches: `docs/pipeline.md`.

### Key Directories

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router pages and API routes |
| `app/api/` | API routes: `subscribe/`, `stripe/webhook`, `push/`, `build-digest`, `unsubscribe`, `og` |
| `app/[es|da]/` | i18n locale sub-routes (Spanish, Danish) |
| `app/digest/[slug]/` | Dynamic digest page (slug = `month-yyyy-week-n`) |
| `pipeline/` | `runWeeklyPipeline.ts` orchestrates all weekly steps; `checks/` = content-quality gates. `competitorAnalyze.ts` is unused since 2026-10-04 (delete after a few weeks) |
| `ingestion/` | RSS (`fetchRss.ts`) and page (`fetchPages.ts`) scrapers |
| `discovery/` | Article candidate scoring/discovery logic |
| `classification/` | OpenAI-powered topic classification |
| `digest/` | Digest builder — ranks, selects, and writes JSON |
| `email/` | Resend email rendering + delivery |
| `podcast/` | Podcast script + TTS (ElevenLabs, falls back to OpenAI `tts-1`); feed at `/podcast/feed.xml` |
| `markets/` | Engine for `/markets/luxury` + `/markets/jewellery` |
| `seo/` | SEO audit / monitor / repair / recovery system (see below) |
| `video/` | Older FFmpeg-based video clip composer |
| `video-short/` | Weekly 60s short; its own package, isolated from the root build |
| `scoring/` | Article relevance scoring utilities |
| `lib/` | Shared utilities: `db/`, `llm/`, `i18n/`, `stripe/`, `analytics/`, `seo/`, `markets/`, `utils/`, `env.ts` |
| `data/` | Runtime JSON store: `articles.json`, `digests/`, `weeks/`, `markets/`, `seo/`, caches |
| `scripts/` | Entry points and maintenance scripts (run with `tsx`) |
| `hooks/` | React hooks (`useCountUp`, `useReveal`), not git hooks |
| `.github/workflows/` | Weekly digest, SEO weekly + daily monitor, subscriber sweep (see `docs/operations.md`) |

### Database

Neon Postgres via Drizzle ORM. Schema at `lib/db/schema.ts` — single `subscribers` table with `plan_type` enum (`none | free | supporter_monthly | patron_monthly`) and Stripe fields. Run `loadEnv()` from `lib/env.ts` before accessing `DATABASE_URL` in scripts (handles Windows UTF-16 `.env.local` encoding).

### Routing & i18n

- Default locale: English at `/`
- Spanish at `/es/`, Danish at `/da/`: locale pages are thin wrappers that pass locale to shared components. Since 2026-09-18 they are `noindex`, out of the sitemap, with no hreflang (roadmap F2.3). robots.txt is untouched on purpose.
- `lib/i18n/messages.ts` holds all UI string dictionaries
- `middleware.ts` handles www→non-www, trailing slash removal, and gclid/fbclid stripping (308); utm_* params are intentionally preserved for client-side attribution
- `/week/YYYY-Www` → `/digest/slug` permanent redirects built at compile time in `next.config.ts`

### Environment Variables

Scripts must call `loadEnv()` from `lib/env.ts` at startup. Key variables:

| Variable | Used for |
|----------|---------|
| `DATABASE_URL` | Neon Postgres |
| `OPENAI_API_KEY` | Classification, summaries, themes, cover, TTS fallback. Many `*_MODEL` vars override per-step models |
| `TAVILY_API_KEY` | Web discovery |
| `ANTHROPIC_API_KEY` | SEO repair agent (CI), video-short |
| `NEXT_PUBLIC_SITE_URL` | Site URL (`localhost` in dev, so don't use it for anything that acts on production) |
| `NEXT_PUBLIC_AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY` | Analytics; secret key feeds the SEO weekly Visitors section |
| `RESEND_WEBHOOK_SECRET` | Resend bounce/complaint webhook |
| `SEO_AGENT_AUTHORITY` | SEO agent level (see below) |
| `RESEND_API_KEY` | Transactional + digest emails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push |
| `PUSH_ADMIN_SECRET` | Push notification admin endpoint |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV (push subscription storage) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Podcast TTS (the local `.env.local` value is a key ID, so local runs use OpenAI) |
| `UNSUBSCRIBE_SECRET` | Email unsubscribe token signing |

### PWA

`next-pwa` wraps the Next.js config. Disabled in `development`. PWA uses webpack (not Turbopack) for `next-pwa` compatibility. `public/sw.js` and `workbox-*.js` are gitignored build output. Media is kept out of the precache.

Web push: the backend (`app/api/push/`, `public/push-sw.js`, Vercel KV) still exists, but the subscribe UI was removed on 2026-09-18 (roadmap F2.4). `app/components/EnableNotificationsButton.tsx` is not rendered anywhere.

### Deploy & CI

Push to `main` = production deploy on Vercel. **Read `docs/operations.md`
before touching build config, workflows, or re-running a week.** The traps:
the git→Vercel trigger sometimes drops a push (retrigger with an empty commit),
never `vercel deploy` from the working tree, functions max 250 MB, and the
weekly email is not idempotent (re-run with `send_email=false`).

### SEO system

An automated SEO audit / monitor / repair system lives in `seo/` and `lib/seo/`.
**Read `docs/seo-system.md` before touching anything SEO-related** — it covers
the architecture, the authority model, and a list of mistakes already made once.

```bash
npm run seo:audit       # static + live checks → data/seo/report-{week}.md
npm run seo:monitor     # is anything broken? (runs daily in CI)
npm run seo:indexing    # what Google reports per page + sitemap health
npm run seo:optimize    # best-practice opportunities
npm run seo:repair      # agent fixes a defect, six gates verify it
npm run seo:recover     # detect an outage, roll production back
npm run seo:weekly      # full Sunday pass; always emails a summary (--no-email locally)
npm run typecheck:seo   # tsc over the SEO system — root tsc skips scripts/
```

Email: the weekly summary sends **every** Sunday; the daily monitor emails
**only** when a problem appears or clears. Both use `seo/shared/email.ts` —
don't call Resend directly (it resolves with `{ error }` instead of throwing).

Four rules that are easy to break by accident:

- **Never use `getSiteUrl()` for anything that acts on production.** It resolves
  `NEXT_PUBLIC_SITE_URL`, which is `localhost:3000` in dev. The monitor and
  recovery use a hardcoded `CANONICAL_URL` and refuse local URLs — same pattern
  as `lib/email/transactional.ts`.
- **`lib/seo/urlInventory.ts` is the single source of indexable URLs.**
  `app/sitemap.ts` is a thin wrapper over it. Edit the inventory, not the sitemap.
- **When you change what a page emits, change the check that asserts it.** This
  has silently broken twice — see the "Things that will bite you" section of
  `docs/seo-system.md`.
- **Agent authority is `SEO_AGENT_AUTHORITY`** (`observe`/`propose`/`recover`/
  `autonomy`). Guardrails in `seo/authority.ts` are separate, hold at every
  level, and throw if weakened. Don't route around them.

Structured data is built in `lib/seo/jsonLd.ts` as one `@id`-anchored entity
graph — don't re-declare `Organization` or `Person` in a page.

SEO docs, by purpose:

| Doc | For |
|---|---|
| `docs/seo-system.md` | architecture — read first |
| `docs/seo-status.md` | **resuming work**: baseline numbers (13 Sep 2026), what is live vs. only built, open decisions, a decision guide |
| `docs/seo-decisions.md` | why each design choice was made and what was rejected — check before undoing something odd |
| `docs/seo-backlog.md` | unscheduled ideas and the remaining work to make repair/recovery act unattended |

When resuming SEO work, start with the checklist in `docs/seo-status.md`. As of
2026-10-04 detection, email, **rollback** and **repair** can all act in CI.
Repair opens pull requests for review, never merges. Neither has been
triggered by a real incident yet, and repair hasn't had an end-to-end
rehearsal. The weekly pass records search traffic. After any rollback, Vercel
stops deploying pushes until someone undoes it — see `docs/seo-system.md`.

### Markets pages

`/markets/luxury` and `/markets/jewellery` replaced Competitor Watch on
2026-10-04 (old URLs redirect). Data is built by `markets/` (`npm run
markets:build`, also pipeline step 9) into `data/markets/{market}.json`.
Design and the reasons behind it: `docs/superpowers/specs/2026-10-04-markets-pages-design.md`.
Brand patterns and their known false positives live in `markets/brands.ts`,
pinned by `__tests__/markets.brands.test.ts`. Move classifications are cached
in `data/markets/classified.json`; bump `PROMPT_VERSION` to redo them.

### Planning docs

What to work on next comes from the owner's roadmap `luxury-intel-roadmap-2026-09.md`
(repo root, **untracked on purpose**, so it may not exist in your clone). Other
backlogs: `IMPROVEMENTS.md`, `docs/improvement-plan.md`, `docs/seo-backlog.md`.
See `docs/README.md` §4 for how they relate.

### Testing

Node.js built-in `node:test`. `npm test` runs `__tests__/**/*.test.ts` —
the pipeline smoke test plus the SEO suite (`seo.*.test.ts`, ~100 tests,
including a `tsc` run over the SEO scripts that the root tsconfig excludes).
Run a single file: `node --test --import tsx __tests__/pipeline.smoke.test.ts`.

The SEO safety tests (`seo.repairPolicy.test.ts`, `seo.authority.test.ts`) are
the most important in the repo — they assert that an autonomous agent cannot
reach credentials, payments, the database, CI, or its own policy file. Treat a
failure there as a stop-everything signal, not a flaky test.
