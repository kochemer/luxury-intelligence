# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Luxury Intelligence** (`luxury-intel.com`) — a Next.js 16 / React 19 weekly digest site for luxury, e-commerce, and retail-tech news. It ingests RSS feeds and web pages, classifies and ranks articles with OpenAI, builds JSON digest files, renders them as a PWA with Tailwind CSS v4, and distributes content via email (Resend), podcast (ElevenLabs), and web push notifications. Subscribers and payments are managed through a Neon Postgres DB (Drizzle ORM) and Stripe.

## Commands

```bash
# Development
npm run dev          # Next.js dev server (PWA disabled in dev)
npm run build        # Production build
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
npm run email:weekly  # Send weekly email digest

# DB migrations (Drizzle)
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate    # Apply migrations

# Video pipeline
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
              email/  podcast/  app/ (Next.js pages)
```

### Key Directories

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router pages and API routes |
| `app/api/` | API routes: `subscribe/`, `stripe/webhook`, `push/`, `build-digest`, `unsubscribe`, `og` |
| `app/[es|da]/` | i18n locale sub-routes (Spanish, Danish) |
| `app/digest/[slug]/` | Dynamic digest page (slug = `month-yyyy-week-n`) |
| `pipeline/` | `runWeeklyPipeline.ts` — orchestrates all weekly steps |
| `ingestion/` | RSS (`fetchRss.ts`) and page (`fetchPages.ts`) scrapers |
| `discovery/` | Article candidate scoring/discovery logic |
| `classification/` | OpenAI-powered topic classification |
| `digest/` | Digest builder — ranks, selects, and writes JSON |
| `email/` | Resend email rendering + delivery |
| `podcast/` | ElevenLabs TTS podcast builder |
| `video/` | FFmpeg-based video clip composer |
| `scoring/` | Article relevance scoring utilities |
| `lib/` | Shared utilities: `db/`, `llm/`, `i18n/`, `stripe/`, `analytics/`, `utils/`, `env.ts` |
| `data/` | Runtime JSON store: `articles.json`, `digests/`, `weeks/`, caches |
| `scripts/` | One-off and maintenance scripts (run with `tsx`) |
| `hooks/` | Git hooks |

### Database

Neon Postgres via Drizzle ORM. Schema at `lib/db/schema.ts` — single `subscribers` table with `plan_type` enum (`none | free | supporter_monthly | patron_monthly`) and Stripe fields. Run `loadEnv()` from `lib/env.ts` before accessing `DATABASE_URL` in scripts (handles Windows UTF-16 `.env.local` encoding).

### Routing & i18n

- Default locale: English at `/`
- Spanish at `/es/`, Danish at `/da/` — locale pages are thin wrappers that pass locale to shared components
- `lib/i18n/messages.ts` holds all UI string dictionaries
- `middleware.ts` handles www→non-www, trailing slash removal, and gclid/fbclid stripping (308); utm_* params are intentionally preserved for client-side attribution
- `/week/YYYY-Www` → `/digest/slug` permanent redirects built at compile time in `next.config.ts`

### Environment Variables

Scripts must call `loadEnv()` from `lib/env.ts` at startup. Key variables:

| Variable | Used for |
|----------|---------|
| `DATABASE_URL` | Neon Postgres |
| `OPENAI_API_KEY` | Article classification/summaries |
| `RESEND_API_KEY` | Transactional + digest emails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push |
| `PUSH_ADMIN_SECRET` | Push notification admin endpoint |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV (push subscription storage) |
| `ELEVENLABS_API_KEY` | Podcast TTS |
| `UNSUBSCRIBE_SECRET` | Email unsubscribe token signing |

### PWA

`next-pwa` wraps the Next.js config. Disabled in `development`. The service worker at `public/push-sw.js` handles web push events. PWA uses webpack (not Turbopack) for `next-pwa` compatibility.

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

Backlog and deferred work: `docs/seo-backlog.md`.

### Testing

Node.js built-in `node:test`. `npm test` runs `__tests__/**/*.test.ts` —
the pipeline smoke test plus the SEO suite (`seo.*.test.ts`, ~100 tests,
including a `tsc` run over the SEO scripts that the root tsconfig excludes).
Run a single file: `node --test --import tsx __tests__/pipeline.smoke.test.ts`.

The SEO safety tests (`seo.repairPolicy.test.ts`, `seo.authority.test.ts`) are
the most important in the repo — they assert that an autonomous agent cannot
reach credentials, payments, the database, CI, or its own policy file. Treat a
failure there as a stop-everything signal, not a flaky test.
