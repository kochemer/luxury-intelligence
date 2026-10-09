# Pipeline decisions: models

Why each weekly-pipeline step uses the model it does, what was measured, and
what was rejected. Check here before changing a model back. Tier defaults are
in `lib/llm/models.ts`; per-step env overrides are in `docs/operations.md`.

## Current models (2026-10-09)

| Step | Code | Model | Since |
|---|---|---|---|
| Story selection (discovery ranking) | `discovery/selectTop.ts`, tier `rank` | `gpt-6.1-sol` | 2026-10-09 (was `o4-mini`) |
| Editor's Take | `digest/generateEditorialTake.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Pull-quote generator + judge | `digest/generateThemes.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Cover scene director | `digest/sceneDirector.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Podcast script | `podcast/buildWeeklyPodcast.ts`, tier `script` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Podcast voice | `podcast/buildWeeklyPodcast.ts` | `gpt-4o-mini-tts`, voice `alloy`; `tts-1` fallback | 2026-10-09 (was ElevenLabs, in practice `tts-1`) |
| Cover image | `digest/generateCoverImage.ts` | `gpt-image-2.5-sunburst`; `gpt-image-2` fallback | 2026-10-09 (was `gpt-image-2`) |
| Article summaries, email digest | tier `summarize` | `gpt-4.1` | 2026-09-18 (F1.4) |
| Reranker | `digest/rerankArticles.ts` | `gpt-4.1` | 2026-09-16 |
| Markets pages | tier `markets` | `gpt-4.1` | 2026-10-04 |
| Themes, translations, query-delta | tiers `classify`, `triage` | `gpt-4.1-mini` | — |

Owner approved the 2026-10-09 switches after the measurements below.

## Measurements behind the 2026-10-09 switch

All on real pipeline code against W39 (and W37/W40 where noted), in a scratch
copy of `data/` with caches cleared, recording `usage` from every call.

- **Cost.** Steps on `summarize` + `polish`: 8.9 cents/week on GPT-4.1 vs 15.8
  cents/week with both tiers on Sol (2026-10-03). Sol's input price equals
  GPT-4.1's; the difference is hidden reasoning tokens billed as output (45–70%
  of Sol's output) and $10 vs $8 per million output tokens. Only `polish`
  moved, so the real increase is smaller: about +2 cents/week for Take, quote
  and scene director. Price did not drive the decision; quality did.
- **Editor's Take and quote.** Side-by-side on W39: Sol was more concrete (a
  testable recommendation rather than "be at the table") and every specific it
  added was in that week's sources. On the 120–130 target Sol wrote 122 (W39)
  and 123 (W40) words on the first attempt.
- **Story selection** (W37 pool, 73 candidates, each model run twice). The two
  models picked 32 of 36 stories in common. Sol returned a ranking for all 68
  rankable articles on both runs; one of two `o4-mini` runs returned only 39,
  so that run selected 15 stories instead of 34 (Ecommerce dropped to 1).
- **Parameters.** GPT-5/6 models reject `max_tokens` and any temperature other
  than 1 (400). Hidden reasoning counts against `max_completion_tokens`: with a
  100-token cap, reasoning alone exceeded it in 14 of 28 summaries, which comes
  back empty. `maxTokensParam` adds `REASONING_HEADROOM_TOKENS` (4000) for these
  models; pinned by `__tests__/llm.models.test.ts`.

## Rejected

- **`gpt-6-luna` for themes and translations.** Saves about $0.80 a year. On
  translations it produced more hidden reasoning than visible text and needed a
  retry on themes. Not worth the risk.
- **`gpt-6-astra`.** 5x Sol's price; nothing here needs it.
- **Moving summaries and the email digest without an A/B.** They must stay
  faithful to the source snippet (F1.4 found `gpt-4.1-mini` inventing
  specifics). Still open: A/B them on Sol before switching.

## Editor's Take length (owner decisions)

250–300 words (F3.1, 2026-09-18) → 150–180 ("too chunky", 2026-09-21) →
120–130 (2026-10-09). The roadmap's case for the Take was original content per
digest page (thin-content risk in Search), so each cut trades some of that for
readability; the owner chose readability. The evidence rule was relaxed from
"at least three stories" to "two, ideally three": three named stories, an
objection and a recommendation do not fit in ~125 words. `TARGET_*` constants
in `generateEditorialTake.ts` drive the prompt and the condense pass.

## Podcast voice

ElevenLabs was tried first and its errors were swallowed. It failed every week
from W29 to W40 and in June–July worked roughly two weeks a month (each episode
is ~12,000 characters, consistent with a monthly quota). The owner has moved off
it (2026-10-09), so OpenAI is the voice by default and ElevenLabs is opt-in via
`PODCAST_TTS_PROVIDER=elevenlabs`. "alloy" is kept so the show keeps its voice.

## Not verified live

On 2026-10-09 the OpenAI account ran out of credit mid-session, so these were
shipped without a live call: `gpt-4o-mini-tts` with `instructions`, and
`gpt-image-2.5-sunburst` at 1536x1024 / `quality: high`. Each has a fallback to
the previous, proven model, so the worst case is the old voice or image model,
logged as a warning. Check the first run's log for `retrying with tts-1` or
`retrying with gpt-image-2`.
