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
  1.25× (`VIDEO_SHORT_TEMPO`).
- Cheap OpenAI TTS is fine. The owner is moving off ElevenLabs.
- **Do not publish or embed yet.** Videos exist locally only.
- Vercel limits come first: nothing here may end up in a deployment.

## Things that will bite you

- **Text must never spill.** The template's `__checkLayout` runs before every
  render and fails it if text leaves the safe area. Don't disable it to get a
  render through. Fix the copy or the layout.
- This is its own package (`package.json` here). The root is CommonJS, this is
  not. It's excluded from the root `tsconfig`, eslint and output tracing;
  `__tests__/videoShort.isolation.test.ts` guards that.
- `ELEVENLABS_API_KEY` in `.env.local` is a key *ID*, not a key.

Reference cost: W39 = $0.28.
