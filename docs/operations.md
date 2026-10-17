# Operations: deploy, CI, re-runs

How luxury-intel.com gets built, deployed and re-run, plus the traps already hit.
Facts are as of 2026-10-05 unless dated otherwise.

## Hosting

- Vercel project `luxury-intelligence`, GitHub `kochemer/luxury-intelligence`,
  branch `main`. Every push to `main` deploys to production.
- The Vercel CLI on the owner's machine is authenticated as `kochemer`.
- The account is on **Hobby** (checked via the API 2026-10-06). Deployment
  storage is **10 GB for the whole account**, shared with the owner's other
  projects (daglig-dansk, family_messenger, travel-blog-generator-codex). See
  § Storage.

## Scheduled workflows (`.github/workflows/`)

| Workflow | Schedule (UTC) | What it does |
|---|---|---|
| `weekly-digest.yml` | Mon 06:00 | Gate job skips a scheduled run if last week's digest is already committed (no double email). Restores + merges the daily ingestion buffer, then `digest:weekly -- --skipMarkets`, commits `data/weeks/*/*.{json,txt}` + digest JSON. Then calls `weekly-short.yml`, then a `send-email` job emails subscribers from `main`. The email waits for the Short (at most its 45-min timeout) but goes out even if the Short fails. A `social` job calls `weekly-social.yml` after the Short (runs if the digest built). Last, a `markets` job calls `weekly-markets.yml` (runs if the digest built, even if the Short or email failed) |
| `weekly-social.yml` | Called by `weekly-digest.yml` after the Short; manual (`week`, `force`, `publish`) | `npm run social:build` writes `data/weeks/<week>/social.json` (keeps an existing plan unless `force`), commits only that file (no deploy: `scripts/vercel-ignore-build.sh` skips it), then `social:publish` sends Monday's posts to Buffer. Emails the owner (`SEO_ALERT_EMAIL`) about dropped posts. Concurrency group `weekly-social` |
| `social-publish.yml` | Mon–Fri 05:30; manual (`mode`: live / dry-run / draft) | `npm run social:publish`: sends that day's posts to Buffer at their planned times (one day at a time: Buffer's free plan holds 1 X thread and 10 posts per channel). Idempotent: skips posts Buffer already has. Emails the owner about failed/dropped posts and 7/3/1 days before `BUFFER_KEY_EXPIRES`. Fails red when a post failed. Concurrency group `weekly-social` |
| `weekly-markets.yml` | Called by `weekly-digest.yml` as its last job; manual (`workflow_dispatch`) | Runs `npm run markets:build` on Node 22 (yahoo-finance2 needs >= 22) with `OPENAI_API_KEY`, then commits only `data/markets/` as `Markets pages: <week>` and pushes, so Vercel redeploys the `/markets` pages. No `[skip ci]` on purpose. Skips the commit when nothing changed. Failure makes this job red and nothing else. Concurrency group `weekly-markets` |
| `weekly-short.yml` | Called by `weekly-digest.yml` (reusable workflow, between build and email); manual (`week`, `sync_only`) | Renders the week's vertical 60s Short (`video-short/`, ~$0.30, $2/week cap; work dir kept in the Actions cache so retries reuse paid work), uploads it to YouTube @luxury-intel, emails the owner (`SEO_ALERT_EMAIL`). Commits only `data/weeks/<week>/video.json` + `public/video/shorts/<week>.jpg` (one extra deploy a week). Every run first re-checks earlier private uploads (`upload.ts --sync`). Skips a week that already has a YouTube id |
| `daily-ingest.yml` | Daily 05:30 | RSS + pages only (`--mode=rss`, no Tavily, no secrets). Keeps `data/articles.json` + `data/source_yield.json` in the Actions cache (`.ingest-buffer/`, key `ingest-buffer-*`), **never commits** (a commit = a Vercel deploy). Step summary lists failing sources |
| `seo-weekly.yml` | Sun 08:00 | Full SEO pass, GSC snapshot, weekly email |
| `seo-monitor.yml` | Daily 07:00 | Detects outages; emails only on change; can roll back and open repair PRs |
| `subscriber-sweep.yml` | Daily 03:17 | Subscriber cleanup (uses `DATABASE_URL` secret) |
| `docs-check.yml` | Every push / PR | `scripts/checkDocs.mjs`: docs still match the code (see `docs/README.md` §6) |
| `backfill-visit-history.yml` | Manual only | One-off, re-runnable: imports Amplitude's daily visit history (up to the 2026-10-05 consent change) into `visit_history` for the `/analytics` page. Uses `AMPLITUDE_SECRET_KEY` + `DATABASE_URL` |
| `weekly-analytics.yml` | Sun 09:00 (after `seo-weekly`); manual (`dry_run`: decide and check, write nothing) | Runs `npm run analytics:insights`: builds a pack of aggregate facts, asks Claude for at most one new /analytics 'Historical insights' tile, checks it (`lib/analytics/insights/checks.ts`) and writes `analytics_insights`. No change is a green run; never commits. Secrets: `DATABASE_URL`, `AMPLITUDE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `GSC_*`; optional repo variable `INSIGHTS_MODEL` (default `claude-opus-5-5`). Read-only for the repo (never commits). Migration `0004` must be applied first. Concurrency group `weekly-analytics` |

## Analytics page limits (`/analytics`, Amplitude)

As of 2026-10-17. Design and data findings:
`docs/superpowers/specs/2026-10-16-analytics-amplitude-design.md`.

- **The replay route (`app/analytics/replay/route.ts`) returns 413 above 4 MB gzipped.** Vercel caps a function
  response at 4.5 MB, so the route refuses bigger recordings and the player
  points the owner at Amplitude. Most visits are far below that.
- **The page needs `maxDuration = 60`.** A cold Amplitude refresh is ~20 calls
  (the results are cached for 3 hours per period). Don't lower it or add calls
  without checking the time.
- **Amplitude rate-limits by concurrency per project (HTTP 429).**
  `lib/analytics/amplitude.ts` keeps at most 3 requests in flight per process
  and backs off on 429, but two processes at once (a local dev server and
  `analytics:insights`, or the page and the weekly workflow) can starve each
  other. Run one at a time.
- The replay list only reaches back 30 days, and every Amplitude panel starts
  at `CONSENT_START` (2026-10-06); older periods are clamped.

## Build

- **The build must be `next build --webpack`** (it is, in `package.json`).
  Next 16 defaults to Turbopack, under which next-pwa silently never runs. For
  months the live `sw.js` was a stale file committed to git. `public/sw.js` and
  `workbox-*.js` are now gitignored build output.
- **Function size limit: 250 MB uncompressed.** Any `fs` access under `public/`
  from a route makes the tracer bundle that directory (the podcast feed once
  pulled in 595 MB of MP3s). Keep media out with `outputFileTracingExcludes` in
  `next.config.ts`. A route-specific list *replaces* the `'*'` list, so repeat
  the globs there.
- `outputFileTracingExcludes['/api/build-digest']` with `./data/weeks/**` does
  **not** work in a local build (thousands of `data/weeks` files get traced).
  It's safe on Vercel only because git deploys see tracked files only. Unfixed
  as of 2026-10-04.

## Deploying

- Deploy = push to `main`. Nothing else.
- **Never `vercel deploy` / `vercel deploy --prebuilt` from the working tree.**
  It uploads ~600 MB of tracked media and ships uncommitted files.
- **The git → Vercel trigger is flaky.** Several pushes with real changes have
  produced no deployment (GitHub commit status stuck `pending`). Retrigger with
  `git commit --allow-empty -m "Retrigger Vercel deploy" && git push` before
  trying anything else. It usually lands within 20 s to 3 min. An empty commit
  only builds if site files changed since the last *successful* deployment
  (see "Skipped deploys" below); to rebuild identical code, use Redeploy in
  the Vercel dashboard.
- **Skipped deploys** (since 2026-10-09): `vercel.json` `ignoreCommand` runs
  `scripts/vercel-ignore-build.sh`, which skips the deployment when nothing
  changed since `VERCEL_GIT_PREVIOUS_SHA` outside `docs/`, `*.md`,
  `__tests__/`, `.github/`, `.githooks/`, `.gitignore`, `video-short/` and
  `data/seo/`. The daily `seo: update monitor state [skip ci]` commit used to
  deploy every day (Vercel ignores `[skip ci]`). If the app ever starts reading
  one of those paths at runtime, remove it from the script.
- A deployment shown as `● Queued` in `vercel ls` may be the git deployment
  itself. Check `vercel inspect <url>` before removing it.
- Verify a deploy landed: fetch `https://luxury-intel.com/sw.js` and check the
  precache has 0 `.mp3` / `.mp4` entries.
- **After an SEO rollback, Vercel stops deploying pushes** until someone undoes
  the rollback. If the weekly digest seems to stop publishing, check this first.
  See `docs/seo-system.md`.

## Re-running a week

- `sendWeeklyEmailDigest.ts` has **no idempotency check**, and
  `data/email/sent/` is gitignored. Re-running an already-emailed week sends it
  again to every subscriber. Use the workflow's `send_email=false` dispatch
  input for re-runs.
- The daily ingestion buffer lives only in the Actions cache. If it is evicted
  (unused 7 days) or a daily run fails, the Monday build still runs its own RSS
  step; WordPress feeds with `paginate` backfill the week, others lose the gap.
  `scripts/mergeIngestBuffer.ts` only ever adds articles, never removes.
- The workflow's "Check for changes" guard needs `git status --porcelain -uall`.
  Without `-uall`, a new untracked week directory collapses to one line and
  fails the file-level allow-list (W38 incident, fixed in `bbd57d4`).
- The homepage falls back to the newest digest on disk, so a failed Monday run
  shows the previous digest, not an empty page.

## Storage

The pipeline commits its own output, so whatever gets committed ships in every
future deployment.

- Only `data/weeks/*/*.{json,txt}` is committed per week. Discovery, podcast
  temp, video and voice-only files are gitignored (fixed 2026-09-18, `57799ff`).
- At request time only `podcast.json` and `email-digest.json` are read from
  `data/weeks/`.
- Every deployment stores its own copy of `public/` media, so deployment
  storage ≈ deployments kept × media size. Hobby keeps the 3 latest production
  deployments plus aliased ones and deletes the rest once over 10 GB. The
  limit was exceeded on 2026-10-09 (~720 MB per deployment, ~1 deploy a day).
- Media is compressed (2026-10-09, `npm run media:compress`, safe to re-run):
  - `public/podcast/*.mp3`: 64 kbps mono (`podcast/compressAudio.ts`, applied by
    `buildWeeklyPodcast` before it records `fileSize`). 563 → 256 MB.
  - `public/weekly-images/*.png`: 256-colour palette PNG
    (`digest/compressCoverImage.ts`, applied by `generateCoverImage`).
    110 → 32 MB. **Keep them PNG under the same names**: sent newsletters link
    to `/weekly-images/{week}.png` and Outlook desktop can't show WebP.
- Still pending: `public/podcast/*.mp3` → Cloudflare R2 (owner's choice).
  Blocked on the owner supplying the account/bucket/token/public URL. Only
  `podcast.json`'s `audioPath` needs to change.
- `public/video/how-it-works.mp4` (~6 MB, CRF 28) + poster: the About page explainer, published 2026-10-07. It is in `publicExcludes` (PWA precache) and `outputFileTracingExcludes`; the page uses `preload="none"`. Re-encode any replacement the same way (see `video-short/README.md`), never commit the 12 MB master.
- `public/video/shorts/<week>.jpg` (~30 KB/week): poster frame for the weekly Short. The MP4 itself is only on YouTube; never commit it.
- Old deployments can be purged with `vercel remove <project> --safe --yes`
  (`--safe` keeps anything holding a live alias).

## Optional environment variables (tuning knobs)

Required variables are in the `CLAUDE.md` env table. These are optional
overrides; leave them unset unless you mean to change behaviour.

| Variables | Effect |
|---|---|
| `SELECTION_MODEL`, `RERANK_MODEL`, `RERANKER_MODEL_PRIMARY`, `RERANKER_MODEL_FALLBACK`, `QUERY_DELTA_MODEL`, `ARTICLE_SUMMARY_MODEL`, `SUMMARY_GENERATOR_MODEL`, `SUMMARY_JUDGE_MODEL`, `THEME_MODEL`, `EDITORIAL_TAKE_MODEL`, `EMAIL_DIGEST_MODEL`, `SCENE_DIRECTOR_MODEL`, `TRANSLATE_MODEL_FALLBACK` | Per-step OpenAI model overrides. Defaults per workflow live in `lib/llm/`; each workflow can also be overridden with `LLM_MODEL_<WORKFLOW>` (e.g. `LLM_MODEL_SUMMARIZE`) |
| `LLM_REASONING_TRIAGE`, `LLM_REASONING_CLASSIFY`, `LLM_REASONING_SUMMARIZE`, `LLM_REASONING_RANK`, `LLM_REASONING_SCRIPT`, `LLM_REASONING_POLISH`, `LLM_REASONING_MARKETS`, `RERANKER_REASONING` | `reasoning_effort` (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`) per workflow, and for the reranker. Unset = the default in `DEFAULT_REASONING_BY_WORKFLOW` (`lib/llm/models.ts`; `classify` = `none` since 2026-10-14), else not sent (model default). Sent only to GPT-5/6 and o-series models, so a fallback to GPT-4.x drops it; an unknown value throws at startup. o-series models don't accept `none`. Caches key on the model, not the effort: clear them when comparing efforts. Added for the 2027-01 retirement tests (`docs/pipeline-decisions.md`) |
| `COVER_IMAGE_MODEL` | Cover image model (default `gpt-image-2.5-sunburst`; on error it retries once with `gpt-image-2`) |
| `PODCAST_TTS_PROVIDER`, `PODCAST_TTS_MODEL`, `PODCAST_TTS_VOICE` | Podcast voice. Provider `elevenlabs` opts back into ElevenLabs (needs `ELEVENLABS_*`); otherwise OpenAI, default `gpt-realtime-2.1-mini` (Realtime API, `lib/llm/speech.ts`) / `alloy`, with `gpt-4o-mini-tts` as the fallback until OpenAI removes it on 2027-01-06 |
| `MAX_TOTAL_ARTICLES`, `MAX_ARTICLES_PER_CATEGORY`, `MIN_ARTICLES_PER_CATEGORY` | Digest size limits in the pipeline |
| `RERANK_MAX_ITEMS`, `RERANK_MAX_CHARS`, `RERANK_COOLDOWN_MS`, `RERANK_DEBUG` | Rerank batch size, prompt size, rate limiting, logging |
| `RERANK_TRIM_MAX_PER_SOURCE` | Max candidates per source when trimming to `RERANK_MAX_ITEMS` before the LLM (default 4) |
| `COMMERCE_MATERIALITY_WEIGHT_ECOM`, `_EMAIL`, `_OTHER` | Weights in `scoring/commerceMateriality.ts` |
| `DISCOVERY_TIME_BOUND`, `DISCOVERY_EXTRA_EXCLUDES` | Discovery search window; extra URL exclude regexes |
| `SEO_BASE_URL`, `SEO_ALERT_EMAIL`, `CLAUDE_BIN` | SEO monitor target (production by default), alert recipient, path to the Claude binary for repair |
| `AMPLITUDE_API_KEY`, `AMPLITUDE_SERVER_ZONE` | Server-side Amplitude export for the weekly email (EU zone) |
| `AMPLITUDE_ORG` | Amplitude org URL name (the word after `/analytics/` in its URL). Set in Vercel to get "Open in Amplitude" links next to the replay Play buttons on `/analytics`; without it no link is shown |
| `NEXT_PUBLIC_VERCEL_ENV` | Set by Vercel; tags analytics events with the environment |
| `VIDEO_RENDER_ENABLED` | Must be `true` for the old `video/` pipeline to render (costs money) |
| `VIDEO_SHORT_CAP_USD`, `VIDEO_SHORT_TEMPO`, `VIDEO_SHORT_VOICE` | `video-short/` spend cap, voice speed, TTS voice |
