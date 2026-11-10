# Pipeline decisions: models

Why each weekly-pipeline step uses the model it does, what was measured, and
what was rejected. Check here before changing a model back. Tier defaults are
in `lib/llm/models.ts`; per-step env overrides are in `docs/operations.md`.

## Current models (2026-10-14)

| Step | Code | Model | Since |
|---|---|---|---|
| Story selection (discovery ranking) | `discovery/selectTop.ts`, tier `rank` | `gpt-6.1-sol` | 2026-10-09 (was `o4-mini`) |
| The Week in Context (was Editor's Take) | `digest/generateEditorialTake.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Pull-quote generator + judge | `digest/generateThemes.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Cover scene director | `digest/sceneDirector.ts`, tier `polish` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Podcast script | `podcast/buildWeeklyPodcast.ts`, tier `script` | `gpt-6.1-sol` | 2026-10-09 (was `gpt-4.1`) |
| Podcast voice | `podcast/buildWeeklyPodcast.ts` | `gpt-realtime-2.1-mini` (Realtime API), voice `alloy`; `gpt-4o-mini-tts` fallback until 2027-01-06 | 2026-10-14 (was `gpt-4o-mini-tts` with `tts-1` fallback) |
| Cover image | `digest/generateCoverImage.ts` | `gpt-image-2.5-sunburst`; `gpt-image-2` fallback | 2026-10-09 (was `gpt-image-2`) |
| Article summaries, email digest | tier `summarize` | `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1`) |
| Selection funnel: triage (all articles) | `selection/triage.ts` | `gpt-6-luna`, effort `none` | 2026-11-10 |
| Selection funnel: quality judge + editor pick | `selection/judge.ts`, `selection/editorPick.ts` | `gpt-6.1-sol`, effort `low` | 2026-11-10 |
| Selection funnel: story clusters | `selection/cluster.ts` | `text-embedding-3-small` | 2026-11-10 |
| Reranker (legacy path, fallback only) | `digest/rerankArticles.ts` | `gpt-6.1-sol`, criteria "hard news first"; fallback `gpt-6-luna`, effort `none` | 2026-10-14 (was `gpt-4.1`) |
| Markets pages | tier `markets` | `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1`) |
| Themes, translations | tier `classify` | `gpt-6-luna`, effort `none`; translation fallback `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1-mini`) |
| Discovery queries (query-delta) | tier `triage` | `gpt-6.1-sol` | 2026-10-14 (was `gpt-4.1-mini`) |

Owner approved the 2026-10-09 switches after the measurements below.

### Selection funnel v2 model choices (2026-11-10)

- **Triage on `gpt-6-luna`, effort `none`.** It reads every in-week article that
  passes the hard filters (~2,100 a week, 40 per call), so it must be cheap. The task
  is labelling (category, type, significance, ad risk), which Luna handles; the
  shortlist is not final, so a mislabel costs a slot, not the digest.
- **Judge and editor on `gpt-6.1-sol`.** They see ~100 full texts and 4 shortlists, so
  cost is cents, and spotting hidden ads and ranking for significance is where
  quality matters (Sol beat Luna 4.67 vs 3.83 on the reranker test above).
- **`gpt-6.1-sol` rejects `reasoning_effort: none`** (400), so the judge and editor
  use `low` (`getReasoningFor('rank') ?? 'low'`). Luna accepts `none`.
- Overrides: `SELECTION_TRIAGE_MODEL`, `SELECTION_JUDGE_MODEL`, `SELECTION_EDITOR_MODEL`.
  Measured token usage of the first full run is recorded in the spec's Cost section.

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
6. Cleanup. [DONE 2026-10-16, one item left] `__tests__/llm.retiredModels.test.ts`
   fails if code names a retiring model (`gpt-4o-mini-tts` is allowed as the
   voice fallback until 2027-01-06; after that the test fails until the
   fallbacks in `podcast/buildWeeklyPodcast.ts` and `video-short/src/voice.ts`
   are removed). `digest/generateIntro.ts` deleted: never called, and its
   sentence trimming cut "$11.6 billion" into "$11. 6". `/methodology` names
   the current models (owner: naming models is fine, 2026-10-16), kept in sync
   by `__tests__/methodology.models.test.ts`. Left: those voice fallbacks after
   2027-01-06.

Owner decisions 2026-10-14: tiers as recommended below; the reranker should
favour hard news (deals, results, launches, leadership, strategy) over
analysis and opinion. 2026-10-16: `/methodology` names the models.

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

## The Week in Context: neutral voice, rotating formats, plain language (owner decision, 2026-11-09)

The weekly take (field `editorialTake`, was "Editor's Take") changed on
2026-11-09. Why: the W39-W45 takes had one structure (thesis, evidence plus
"the strongest objection", then "Next quarter, I would..." advice to an
unnamed operator), 6 of 7 opened with "I think", it posed as a human editor
with a consulting background, and it was dense with consultant and ecommerce
jargon ("spending permissions are becoming a merchandising decision").

- **Name and signature.** Section "The Week in Context"; signature "Written by
  AI from this week's selected sources." (page, email HTML and text). The About
  page's "The Editor" card and the JSON-LD `Person` "The Editor" describe the
  human curator and were left alone.
- **Voice.** Neutral, no persona, never first or second person, no advice to a
  group, no mandatory recommendation. Opens with a company, number or event.
- **Formats.** `connection`, `number`, `split`, `what-changed`, `open-question`,
  `watch` (`TAKE_FORMATS` in `digest/takeChecks.ts`). The model picks one, minus
  the formats of the previous 2 published weeks; a bad or excluded format gets
  one retry. The previous 3 takes go into the prompt as "do not reuse".
- **Plain language everywhere.** The rules (short sentences, everyday words, no
  jargon list) are in `HOUSE_STYLE_RULES`, so they reach all model-written text.
  The automatic jargon (`findJargon`) and readability checks run only on the
  take, because `findStyleProblems` gates social posts and summaries where
  words like "checkout" are fine. Do not add jargon to `findStyleProblems`.
- **Readability threshold** (`MAX_FK_GRADE` 10.5, `MAX_AVG_SENTENCE_WORDS` 17):
  calibrated on W35-W45. Old takes scored FK grade 10.6-15.1 and 15-30 words per
  sentence; the owner's target example scored 5.9 and 11.1. First set at 9, then
  raised to 10.5 the same day: brand names inflate the syllable count, so plainly
  written round-2 samples scored 9.3-10.0 and the fix pass churned on them.
  Numbers are in the comment in `takeChecks.ts`.
- **New weeks only.** No committed digest was regenerated. Old takes keep their
  text; only the label and signature changed, because they come from components.
  Guard: an existing digest with a take and no `editorialTakeFormat` is kept on
  a rebuild, so bumping `TAKE_VERSION` ('4.0') does not rewrite past weeks.
  Only `scripts/regenEditorialTake.ts` (explicit) replaces one.
- **One point, a luxury or jewellery consequence, no restating ending
  (round 2, 2026-11-09).** The first samples were plain but were fact lists
  with no point. Now every take states one point in its first two sentences,
  uses 2-3 stories that serve it, says what it means for a luxury or jewellery
  business (a consequence, not advice) and ends on something new. Format
  descriptions are stricter (`number` = one figure leads; `open-question` =
  question first, evidence for each side; and so on). Code checks add filler
  words (`findFiller`: concerns, developments, "is changing too", "also
  finding"), take-only. A judge model call (`judgeTake`, temperature 0) checks
  point, consequence, format, round-up and restating ending; each failure is a
  problem label for the single fix pass (`judgeProblems`). If the judge call
  fails it is skipped. The fix pass is kept only if it has fewer problems.
- **JSON-LD author.** On digest pages the NewsArticle `author` is the
  Organization, not the "The Editor" Person (owner rule 2026-10-13: issues are
  automated). The Person stays declared in the root graph for /about.
- **Checks never drop a take.** Style, pronoun, banned-phrase, repeated-opening
  (first 3 words vs the previous 4 takes), jargon and readability problems feed
  one rewrite, kept only if it has fewer problems; leftovers are logged.
- **Dry run.** `scripts/regenEditorialTake.ts --dry-run --from= --to= --out=`
  writes a comparison file and touches neither `data/` nor the take cache.

### Earlier length history (owner decisions, superseded by the above)

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

Applies to every model-written text readers see: The Week in Context, pull-quote,
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
| The Week in Context | one rewrite pass naming the problems (house style plus take-only checks); kept only if it has fewer problems and is long enough |
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

## Cover scene director v9 (2026-10-12)

The 2026-W41 cover was a white delivery van with a packing-tape wheel. Three
causes: the cover only saw Ecommerce top 2 + Jewellery top 1 (never Luxury);
Ecommerce #1 was hard-wired as the "lead story", which that week was an Indian
festive-sales total; and nothing in the prompt said the cover belongs to a
luxury publication, while the setting list suggested garages and car
dashboards. It also cropped badly: the hero uses `object-cover object-bottom`,
which drops the top third on desktop and keeps only the middle half of the
width on phones, and the gag sat at the left edge.

v9 changes:

- Input is Luxury top 2, Jewellery top 1, Ecommerce top 1 (`digest/coverArticles.ts`).
- No forced lead. The model picks the story and records `chosenStory` and
  `whyThisStory` in `cover-scene.json`.
- A brand rule (the scene must belong on a luxury-industry cover; logistics,
  vans, parcels, supermarkets fail) and a luxury-only setting list.
- Framing: one small focal object, centred left-to-right, in the lower half,
  calm top third. Said both in the scene prompt and in the fixed text that
  `generateCoverImage.ts` appends to every image prompt.
- `cover-input.json` is rewritten on each generation. Before, a regenerated
  cover kept the old file's article list.

Shipped 2026-10-16; the first live v9 cover is the next weekly run. W41's
live cover was kept. Local W41 re-run (mock/ only): it chose the European-fashion sizing
story and rendered couture trousers in a boutique fitting room, fully inside
the crop. On-brand and well framed, but the joke (a tiny waistband) is hard to
read. Not added yet, use if v9 covers stay weak: generate three concepts and
have a second call score brand fit and how fast the joke reads; a vision call
that stores a focal point for `objectPosition`.

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

## Selection funnel v2: editorial rules (2026-11-10)

The W45 v2 trial showed four problems, each now a rule in `selection/`:
one outlet (two WWD sections) took 4 of 7 Luxury slots, so picks are capped at 2 per web domain
per category; the editor chose an analysis of Pandora's turnaround over the results reports
themselves, so hard news wins over analysis of the same event and Pandora and direct-peer
results are significance 4+ (`PEER_COMPANIES` in `selection/types.ts`); Ecommerce picked fashion
sourcing and green-claims regulation, so its triage definition is limited to digital commerce
topics; Anthropic held 4 of the top 5 in AI, so at most 2 of ranks 1-5 may share a `mainCompany`.
Two parts of one series (same domain, same title prefix before ':') count as one story.

## Selection funnel v2: tuning round 3 (2026-11-10)

W45 Ecommerce shortlisted Walmart/Symbotic, Zalando, Asos and JD.com/Ceconomy (independence 3, "company-sourced but factual") but ranked a duty-free operator, Hong Kong retail sales and an Indian gig-worker levy above them: the bar needed independence >= 4 and `validatePicks` re-sorted by bar then quality. Now the bar is significance >= 4, quality >= 3.4, independence >= 3 (hiddenAd, excluded types and adRisk high still block), the editor's order is primary (a failing pick is swapped down only if a passer can replace it), and the editor returns `sameEvent` groups (one pick per group) because embeddings missed the WWD/FashionUnited Ralph Lauren pair. Triage/judge prompts send travel retail and duty free to Luxury and rate single-country policy or local statistics significance <= 3 (prompt versions bumped).
Cluster thresholds measured on W45 (2,197 articles): 0.86/0.80 gave 2,132 clusters (52 multi-member); 0.82/0.78 gives 2,052 (100 multi, 82 multi-source) and the merged pairs read as same event (results, appointments, launches); false merges were rare and harmless (Hodinkee auction preview parts 1/2, Bloomberg daily market wraps); 0.80/0.76 gives 2,017 (114) and was not adopted. Of 227 different-source pairs at cosine 0.78-0.86, nearly all are the same event, so the editor's `sameEvent` still covers the rest (e.g. two Pandora Q3 reports at 0.80).
