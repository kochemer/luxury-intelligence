# Pipeline decisions: models

Why each weekly-pipeline step uses the model it does, what was measured, and
what was rejected. Check here before changing a model back. Tier defaults are
in `lib/llm/models.ts`; per-step env overrides are in `docs/operations.md`.

## Current models (2026-10-14)

| Step | Code | Model | Since |
|---|---|---|---|
| Story selection (discovery ranking) | `discovery/selectTop.ts`, tier `rank` | `gpt-6.1-sol` | 2026-10-09 (was `o4-mini`) |
| Editor's Take | `digest/generateEditorialTake.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Pull-quote generator + judge | `digest/generateThemes.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Cover scene director | `digest/sceneDirector.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Podcast script | `podcast/buildWeeklyPodcast.ts`, tier `script` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Podcast voice | `podcast/buildWeeklyPodcast.ts` | `gpt-realtime-2.1-mini` (Realtime API), voice `alloy`; `gpt-4o-mini-tts` fallback until 2027-01-06 | 2026-10-14 (was `gpt-4o-mini-tts` with `tts-1` fallback) |
| Cover image | `digest/generateCoverImage.ts` | `gpt-image-2.5-sunburst`; `gpt-image-2` fallback | 2026-10-09 (was `gpt-image-2`) |
| Article summaries, email digest | tier `summarize` | `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1`) |
| Reranker | `digest/rerankArticles.ts` | `gpt-6.1-sol`, criteria "hard news first"; fallback `gpt-6-luna`, effort `none` | 2026-10-14 (was `gpt-4.1`) |
| Markets pages | tier `markets` | `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1`) |
| Themes, translations | tier `classify` | `gpt-6-luna`, effort `none`; translation fallback `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1-mini`) |
| Discovery queries (query-delta) | tier `triage` | `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1-mini`) |

Owner approved the 2026-10-09 switches after the measurements below.

## Retirement 2027-01 (OpenAI notices of 2026-10-01 and 2026-10-14)

OpenAI removes these from the API. Source:
[deprecations page](https://developers.openai.com/api/docs/deprecations).

| Shutdown | Models | OpenAI's replacement | Used here by |
|---|---|---|---|
| **2027-01-06** | `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` (both snapshots, so the alias too) | `gpt-realtime-2.1-mini` | Podcast voice **and** its `tts-1` fallback (`podcast/buildWeeklyPodcast.ts`); weekly Short + explainer voice (`video-short/src/voice.ts`) |
| 2027-01-14 | `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini` (and fine-tunes) | `gpt-6-luna` | Tiers `summarize`, `markets` (`gpt-4.1`); `classify`, `triage` (`gpt-4.1-mini`); reranker primary/fallback (`digest/rerankArticles.ts`); translation fallback (`lib/i18n/translate.ts`) |

Steps already on `gpt-6.1-sol` (rank, polish, script) and the cover image
models are not affected. No CI secret overrides a model, so code defaults are
what production runs.

Plan (owner approved 2026-10-14). Finish by early December; the holidays are
the buffer. The voice is the critical path because its fallback dies too.

1. [DONE] Housekeeping: removed `RERANK_MODEL=gpt-4o-mini` (local reranks had
   silently differed from CI's `gpt-4.1`) and the unused `CLASSIFIER_MODEL`
   from the owner's `.env.local`.
2. [DONE] `reasoning_effort` per workflow (`LLM_REASONING_<WORKFLOW>`,
   `RERANKER_REASONING`; `reasoningParam` in `lib/llm/models.ts`). Needed because
   OpenAI's suggested start for Luna is effort `none`; the 2026-10-03 Luna
   rejection below ran at its default effort.
3. Side-by-side. [DONE, 2026-10-14] Results and recommendation under
   "Side-by-side results (2026-10-14)" below.
4. Voice. [DONE, 2026-10-14] `gpt-realtime-2.1-mini` is not
   served on `/v1/audio/speech` (404), so it runs over the Realtime API
   (`lib/llm/speech.ts`): a read-verbatim instruction plus the delivery brief,
   and the model's own transcript is checked against the text (a chunk that
   drifts is retried once, then the run fails). It is now the fallback for the
   podcast (replacing `tts-1`) and the Short, then, after the owner's listening
   test the same day, the primary for both, with `gpt-4o-mini-tts` as the
   fallback until 2027-01-06. Measured on W41's full podcast script
   (16,399 chars) and W39's six Short lines: the model's transcript matched
   word for word; an independent `gpt-transcribe` pass differed from the
   script by 2.3% on the full episode vs 3.05% for `gpt-4o-mini-tts` on the
   same text, all spelling (UK/US, "e-commerce") or misheard names. Episode
   15:17 vs 15:54 live, same 64 kbps MP3. `alloy` and `ash` both exist. About
   $0.37 an episode vs $0.22 ($20/1M audio tokens, ~1,200 tokens a minute).
   Rejected: `gpt-audio-mini` on Chat Completions (works, simpler, but
   it is itself removed 2027-01-20). Owner listened to both on W41 (podcast)
   and W39 (Short) and approved ("they sound alright"). After 2027-01-06,
   drop the `gpt-4o-mini-tts` fallbacks (step 6).
5. [DONE 2026-10-14] Switched `summarize`, `classify`, `triage` and
   `markets` together instead of one tier a week: the side-by-side had already
   run each step on three weeks, and each step logs its model, so the 2026-W42
   run is the live check. The reranker followed the same day, after its
   criteria were rewritten for hard news first and re-tested (below). No text
   step or fallback uses GPT-4.1 / 4.1-mini any more.
6. Cleanup: a test that fails if a default or fallback model is on a
   `RETIRED_MODELS` list; methodology page copy (it still says the judge is
   `gpt-4.1`); comments and this table. Also: `digest/generateIntro.ts` is
   never called (no digest has an `introParagraph`), so delete it rather than
   migrate it; its sentence trimming splits on "." and cuts "$11.6 billion"
   into "$11. 6".

Owner decisions 2026-10-14: tiers as recommended below; the reranker should
favour hard news (deals, results, launches, leadership, strategy) over
analysis and opinion. Open: whether the methodology page names models.

### Side-by-side results (2026-10-14)

Every step still on GPT-4.1 / 4.1-mini, run on W39, W40 and W41 in a clean
worktree with caches cleared: today's models ("4.1"), `gpt-6.1-sol` at its
default effort, and `gpt-6-luna` at effort `none` (it then spends no hidden
reasoning tokens). Claude Opus 5.5 graded the outputs blind and shuffled, so
no OpenAI model graded its own family; summaries and email items against the
source the writer saw (full text for email), markets labels against Claude
applying the prompt's own rules on the 69 of 253 headlines where the models
disagreed. Harness (local only, `mock/` is gitignored): `mock/model-ab/`
`gen.ts`, `judge.ts`, `report.ts`.

| Step (tier) | 4.1 | Sol | Luna@none | Cost per week (4.1 / Sol / Luna) |
|---|---|---|---|---|
| Article summaries (`summarize`): items with an unsupported claim; quality 1-5 | 50%; 3.74 | **4%; 4.44** | 12%; 4.36 | 4.3¢ / 7.6¢ / 0.2¢ |
| Email digest items (`summarize`): same | 43%; 3.38 | **24%**; 4.05 | 38%; **4.24** | 2.9¢ / 4.6¢ / 0.2¢ |
| Key themes (`classify`): 1-5 | 3.00 | 3.33 | **3.67** | ~0.1¢ each |
| Translations da/es (`classify`): accuracy 1-5 | 4.05 / 4.29 | 4.71 / 4.76 | **4.81 / 4.76** | 0.9¢ / 7.7¢ / 0.3¢ |
| Discovery queries (`triage`): 1-5 | 1.00 | **4.00** | 2.00 | 0.2¢ / 1.7¢ / 0.1¢ |
| Markets labels (`markets`): right on contested | 28/69 | **44/69** | 28/69 | pennies (only new headlines) |
| Reranker: picks shared with 4.1 (4.1 vs itself: 83/84) | n/a | 62/84 | 68/84 | cents |
| Reranker lists judged on the prompt's own criteria, 1-5 | 3.50 | **3.83** | 3.58 | |
| Reranker lists judged on "hard news first", 1-5 | **3.58** | 3.25 | 3.25 | |

What the numbers mean:

- The "unsupported claims" are mostly subtle, not invented facts: 4.1 states
  forecasts as settled ("are set to spend" for a Goldman Sachs projection),
  drops "up to" and attributions. Sol is the most careful; Luna close behind.
- Discovery queries: 4.1 and Luna repeat the same few stories across all four
  topics and force off-topic pairings ("Anthropic cloud deal for jewelry
  ecommerce"); Sol writes topic-specific queries.
- Markets: on contested headlines 4.1 made 9 false moves and missed 19; Sol 4
  and 11; Luna 7 and 20. 4.1 re-run agreed with its own cached labels on only
  89%, so a model change was always going to re-label some.
- Reranker: the prompt asks for "strong analysis and non-obvious takeaways" and
  to avoid "pure announcements without analysis". Sol and Luna follow that
  literally and pick more analysis and opinion pieces; 4.1 picked more hard news
  (e.g. Rio Tinto selling Argyle Pink, Capri up for sale). Which is better
  depends on what the sections should favour: an owner decision. If hard news,
  change the criteria first and re-run the reranker comparison.
- Reliability: no failed calls or batches on any variant; theme validation
  retried once (4.1, Sol) or twice (Luna) and recovered.
- Speed: Sol's hidden reasoning (37-78% of its output tokens) makes calls 3-5x
  slower (5 s per summary, 26 s per markets batch); fine for a weekly batch.

Recommendation: `summarize` → Sol (faithfulness is the stated bar, F1.4;
about +5¢/week); `classify` → Luna@none (best themes and translations at a
tenth of the cost); `triage` → Sol; `markets` → Sol; reranker → after the
owner decides what it should favour. Fallbacks that still point at
`gpt-4.1-mini` (reranker, translations) move to Luna@none.

Reranker re-test with the hard-news criteria (2026-10-14). The owner chose
"hard news first", so the criteria in `digest/rerankArticles.ts` now rank
deals, results, leadership changes, strategy and launches above analysis and
opinion, and name the formats to push down (opinion and advice columns,
listicles, podcasts, video tours). Same three weeks, judged blind against the
new criteria: Sol 4.67/5 (best or tied in all 12 category-weeks, 4 or 5
everywhere), Luna@none 3.83, the previous gpt-4.1 lists 2.25 (made under the
old criteria, so this compares setups, not just models). Sol now leads with
the stories the first pass found missing (Rio Tinto selling Argyle Pink, De
Beers taking Gahcho Kue, the Armani stake sale, Capri up for sale). Switched:
Sol primary, Luna@none fallback.


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

## Pull-quote style (owner brief, 2026-10-09)

"Punchy, provocative, to the point, using simple words." The first Sol quotes
were accurate but read as consultant-speak ("enterprise agents ... could make
workplace software a commerce gatekeeper, forcing merchants to court algorithms").
Cause: both prompts rewarded "non-obvious depth" and named lenses like
"paradox" and "structural shift"; nothing asked for plain words.

- Generator (`digest/generateThemes.ts`): max 23 words (18 until the owner
  loosened it on 2026-10-10), one or two short
  sentences, plain words, stated as fact (no could/may), a named company,
  good and bad examples in the prompt.
- Judge: punch and plain language first, then provocation, then specificity;
  shorter wins a tie.
- `quoteProblem()` drops candidates over `QUOTE_MAX_WORDS` (23), with jargon from
  `QUOTE_JARGON`, hedges, or a Pandora mention, before the judge sees them
  (unless that leaves none). Pinned by `__tests__/digest.quote.test.ts`.
- **Never mention Pandora** (the editor's employer), same rule as the Take.
  The quote prompts lacked it, and a W40 test run picked a Pandora quote.
  Theme tags may still name Pandora as news; that is a label, not opinion.

On W37-W40 the new prompts produced, e.g., "Luxury calls price hikes growth.
Customers call them a reason to walk away." (W39).

## House style: no AI-isms (owner rule, 2026-10-09)

Applies to every model-written text readers see: Editor's Take, pull-quote,
article summaries, email digest, podcast script. The owner's list covers false
contrasts ("it's not X, it's Y"), rule of three, em dashes, colon reveals, tidy
closing lines, stock words (delve, landscape, leverage, navigate...), inflated
significance, trailing "-ing" clauses, hedge stacking, vague attribution,
signposting, flattering openers, and bold/headers/emoji.

`lib/llm/houseStyle.ts` holds the rules as one prompt block
(`HOUSE_STYLE_RULES`), a code check (`findStyleProblems`) and `stripDashes`.
Rule of three and the tidy closing line are prompt-only: no pattern catches
them without flagging good sentences. What each step does on a violation:

| Step | On a violation |
|---|---|
| Pull-quote | candidate dropped before judging |
| Editor's Take | one rewrite pass naming the problems; kept only if cleaner and long enough |
| Article summaries | one retry naming the problems; the cleaner of the two is kept |
| Email digest, podcast script | prompt + dash stripping only (long text; not worth rejecting over one phrase) |

The false-contrast patterns were calibrated on real W37-W40 output: they catch
"X isn't A. It's B", "isn't X; it's Y", "aren't dead. Shoppers are just..." and
", not simply X", and pass ordinary negations ("Growth isn't the same as
strength", "The brand isn't commenting"). Pinned by
`__tests__/llm.houseStyle.test.ts`. The first pull-quote rules (same day)
used false contrasts as their "good" examples; corrected in this change.

Result on W39/W40 regeneration: quote, Take and all 28 W40 summaries passed
the check with no rewrite needed.

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
