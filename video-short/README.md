# video-short

Makes a 60-second Fireship-style short from one story in a weekly digest, in two
versions every time: vertical 1080×1920 and horizontal 1920×1080.

```bash
npx tsx video-short/src/run.ts --week=2026-W39   # full run (costs money, capped)
npx tsx video-short/src/preview.ts               # free template/layout check
```

Output (gitignored): `data/weeks/<week>/video-short/` (mp4s, `script.json`,
`spend.json`, `meta.json`).

## Owner decisions (2026-10-04)

- One story per video. Claude writes the script.
- **$2/week spend cap**, enforced in `src/budget.ts`. Each call is priced at
  worst case *before* it runs. Override with `VIDEO_SHORT_CAP_USD`.
- A cut about every 10 s (5–6 scenes). Voice keeps natural pauses, played at
  **1.2×** (`VIDEO_SHORT_TEMPO`; was 1.25× until 2026-10-05).
- Cheap OpenAI TTS is fine. The owner is moving off ElevenLabs.
- ~~Do not publish or embed yet.~~ Superseded 2026-10-10: publish to YouTube + embed (see "YouTube and the site").
- Vercel limits come first: nothing here may end up in a deployment.

## Owner decisions (2026-10-05)

- Fixed bookends around every story (`run.ts`): a quick intro ("Welcome to
  Luxury Intel's weekly hot take", with WEEKLY HOT TAKE / IN 60 SECONDS on
  screen) and a one-line outro ("Follow the full digest at luxury-intel.com").
  Their inner pauses are squeezed; story scenes keep theirs.
- **Light theme**: cream page, ink text, site gold.
- Casual language and roughly twice the sarcasm (`src/prompts.ts`).
- **No AI-isms.** `checkAiIsms` in `src/script.ts` rejects semicolons,
  exclamation marks, ellipses, stock phrases and "it's not X, it's Y"
  contrasts; dashes are rewritten to commas. A script that still fails after
  the one repair pass stops the run.
- Brand marks per scene (`src/marks.ts`): an open Simple Icons logo in the
  brand's own color when the name matches exactly, otherwise a typeset
  wordmark, plus allowlisted lucide icons for concepts. Amazon and most luxury
  houses are not in Simple Icons (several asked to be removed): they get
  wordmarks, and logos are never scraped. Every brand must be named in the
  source article. `meta.json` → `logosUsed` lists the logos to review before
  anything is published.
- Story length target: 140–160 words (at 180 wpm, about 50 s), so the whole
  video lands near a minute with the bookends.

## YouTube and the site (live 2026-10-11)

Owner decisions (2026-10-10): the weekly Short goes to YouTube
[@luxury-intel](https://www.youtube.com/@luxury-intel) as a **vertical Short only**,
and the same video is embedded on the digest page. Brand logos are fine to use
(editorial use); the manual logo review is dropped.

- Auth: OAuth "uploader" Desktop client in Google Cloud project
  `wired-height-456014-u8` ("My First Project", also home of the Search Console
  service account; don't touch IAM/service accounts there). Google Auth Platform
  app "Luxury Intel Uploader" is **In production**, unverified on purpose
  (one user, warning screen accepted). In Testing, refresh tokens expire after
  7 days. Scopes: `youtube.upload` + `youtube`.
- `npx tsx scripts/youtubeAuth.ts` does the one-time sign-in: saves
  `YOUTUBE_REFRESH_TOKEN` to `.env.local` and sets the three `YOUTUBE_*` GitHub
  secrets via stdin. Re-run it if uploads start failing with `invalid_grant`.
- Pipeline: `.github/workflows/weekly-short.yml` runs after each successful
  digest build: `run.ts --formats=vertical`, then `src/upload.ts` (see its
  header). upload.ts writes `data/weeks/<week>/video.json` and a ~30 KB poster
  `public/video/shorts/<week>.jpg`; the MP4 is never committed.
- Site: `lib/video/weeklyShort.ts` + `app/components/WatchOrListen.tsx` show the
  Short next to the podcast on the homepage and digest pages, plus a
  `VideoObject` (`buildVideoObjectLd` in `lib/seo/jsonLd.ts`). Our poster shows
  until the reader presses play; only then does the youtube-nocookie player
  load (consent rule). ES/DA pages stay podcast-only (noindex, English video).
- **Uploads are forced to private** until the project passes YouTube's API
  audit (projects created after 2020-07-28). Owner chose (2026-10-11) to wait
  for the audit rather than flip videos by hand. The site shows a video only
  when `video.json` says `"public": true`; `upload.ts --sync` (first step of
  every run, or the workflow's `sync_only` input) flips it once YouTube serves
  it. Audit not yet requested as of 2026-10-11.
- W39 was uploaded privately as the end-to-end test (2026-10-11,
  `I2DlQjpvjso`); its record stays `"public": false`.

## Things that will bite you

- **Text must never spill.** The template's `__checkLayout` runs before every
  render and fails it if text leaves the safe area. Don't disable it to get a
  render through. Fix the copy or the layout.
- This is its own package (`package.json` here). Like the root it is CommonJS
  (an ESM package can't import the root's CommonJS modules). It's excluded from the root `tsconfig`, eslint and output tracing;
  `__tests__/videoShort.isolation.test.ts` guards that.
- `ELEVENLABS_API_KEY` in `.env.local` is a key *ID*, not a key.
- **"1.2×" means 1.2× normal speech (about 180 wpm), not 1.2× whatever the TTS
  returns.** gpt-4o-mini-tts reads at roughly 115–125 wpm whatever the
  instruction says, so a plain `atempo=1.2` came out around 140 wpm and the
  owner heard it as 1× (2026-10-06). `voice.ts` measures the raw pace on every
  run and picks the atempo to hit `TEMPO × NORMAL_WPM` (capped at 1.6×).
  `meta.json` → `voicePace` records raw wpm, atempo and final wpm.
- Simple Icons titles can belong to a different company than the one you mean
  ("Hermes" is the parcel carrier, not Hermès). Add such names to
  `COLLISIONS` in `src/marks.ts`; they then render as wordmarks.
- Entrance animations must not park content just off-frame: a card parked
  900 px to the right showed a sliver at the edge for seconds. Use a fade plus
  a short slide.

## Explainer: "How Luxury Intel works" (2026-10-07)

A one-off ~2-minute landscape video explaining the whole project (ingestion,
classification, ranking, digest, web + Android app, Markets, GitHub Actions →
Vercel, SEO/GEO, analytics). Not tied to a week.

**Published on /about since 2026-10-07** (owner's call; the weekly shorts are still
unpublished). The site serves a compressed copy, `public/video/how-it-works.mp4`
+ `how-it-works-poster.jpg`. After re-rendering, refresh it with:

```bash
ffmpeg -i video-short/explainer/out/luxury-intel-how-it-works.mp4 -c:v libx264 -preset slow -crf 28 -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart public/video/how-it-works.mp4
```

The video is public: keep private things (e.g. the private analytics dashboard URL) out of it.

```bash
npx tsx video-short/explainer/run.ts --preview   # free: one frame per scene
npx tsx video-short/explainer/run.ts             # voice + render (~$0.06 for new lines)
```

- Narration and on-screen text are hand-written in `explainer/scenes.json`.
  **Check every claim against the code before re-rendering**: the first cut
  (2026-10-07) followed stale docs on classification.
- `explainer/template.html` is its own diagram template; voice and budget reuse
  `src/voice.ts` and `src/budget.ts`.
- Output, voice cache and spend ledger: `explainer/out/` (gitignored). The
  current render is `explainer/out/luxury-intel-how-it-works.mp4`. Unchanged
  lines are cached, so re-voicing only pays for edited ones.

Reference cost: W39 = $0.28 for the first full run; about $0.18 per script
rewrite + voice after that. W39 total after three rounds of changes: $0.62.
