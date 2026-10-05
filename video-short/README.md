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
- **Do not publish or embed yet.** Videos exist locally only.
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
- Story length target: 105–120 words, so the whole video lands near a minute
  with the bookends.

## Things that will bite you

- **Text must never spill.** The template's `__checkLayout` runs before every
  render and fails it if text leaves the safe area. Don't disable it to get a
  render through. Fix the copy or the layout.
- This is its own package (`package.json` here). Like the root it is CommonJS
  (an ESM package can't import the root's CommonJS modules). It's excluded from the root `tsconfig`, eslint and output tracing;
  `__tests__/videoShort.isolation.test.ts` guards that.
- `ELEVENLABS_API_KEY` in `.env.local` is a key *ID*, not a key.
- Simple Icons titles can belong to a different company than the one you mean
  ("Hermes" is the parcel carrier, not Hermès). Add such names to
  `COLLISIONS` in `src/marks.ts`; they then render as wordmarks.
- Entrance animations must not park content just off-frame: a card parked
  900 px to the right showed a sliver at the edge for seconds. Use a fade plus
  a short slide.

Reference cost: W39 = $0.28 for the first full run; about $0.18 per script
rewrite + voice after that. W39 total after three rounds of changes: $0.62.
