# Operations: deploy, CI, re-runs

How luxury-intel.com gets built, deployed and re-run, plus the traps already hit.
Facts are as of 2026-10-05 unless dated otherwise.

## Hosting

- Vercel project `luxury-intelligence`, GitHub `kochemer/luxury-intelligence`,
  branch `main`. Every push to `main` deploys to production.
- The Vercel CLI on the owner's machine is authenticated as `kochemer`.
- Hobby-style limits apply (owner hasn't confirmed Hobby vs Pro as of 2026-10-04).
  Deployment storage and function storage quotas are **account-wide**, shared
  with the owner's other projects.

## Scheduled workflows (`.github/workflows/`)

| Workflow | Schedule (UTC) | What it does |
|---|---|---|
| `weekly-digest.yml` | Sun 06:00 | `digest:weekly`, emails subscribers, commits `data/weeks/*/*.{json,txt}` + digest JSON |
| `seo-weekly.yml` | Sun 08:00 | Full SEO pass, GSC snapshot, weekly email |
| `seo-monitor.yml` | Daily 07:00 | Detects outages; emails only on change; can roll back and open repair PRs |
| `subscriber-sweep.yml` | Daily 03:17 | Subscriber cleanup (uses `DATABASE_URL` secret) |

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
  trying anything else. It usually lands within 20 s to 3 min.
- A deployment shown as `● Queued` in `vercel ls` may be the git deployment
  itself. Check `vercel inspect <url>` before removing it.
- Verify a deploy landed: fetch `https://luxury-intel.com/sw.js` and check the
  precache has 0 `.mp3` entries.
- **After an SEO rollback, Vercel stops deploying pushes** until someone undoes
  the rollback. If the weekly digest seems to stop publishing, check this first.
  See `docs/seo-system.md`.

## Re-running a week

- `sendWeeklyEmailDigest.ts` has **no idempotency check**, and
  `data/email/sent/` is gitignored. Re-running an already-emailed week sends it
  again to every subscriber. Use the workflow's `send_email=false` dispatch
  input for re-runs.
- The workflow's "Check for changes" guard needs `git status --porcelain -uall`.
  Without `-uall`, a new untracked week directory collapses to one line and
  fails the file-level allow-list (W38 incident, fixed in `bbd57d4`).
- The homepage falls back to the newest digest on disk, so a failed Sunday run
  shows last week's digest, not an empty page.

## Storage

The pipeline commits its own output, so whatever gets committed ships in every
future deployment.

- Only `data/weeks/*/*.{json,txt}` is committed per week. Discovery, podcast
  temp, video and voice-only files are gitignored (fixed 2026-09-18, `57799ff`).
- At request time only `podcast.json` and `email-digest.json` are read from
  `data/weeks/`.
- Still pending as of 2026-10-05:
  1. `public/podcast/*.mp3` (~500 MB) → Cloudflare R2 (owner's choice). Blocked
     on the owner supplying the account/bucket/token/public URL. Only
     `podcast.json`'s `audioPath` needs to change.
  2. `public/weekly-images/*.png` (~100 MB) → WebP.
- Old deployments can be purged with `vercel remove <project> --safe --yes`
  (`--safe` keeps anything holding a live alias).
