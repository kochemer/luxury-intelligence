# /analytics: Amplitude sections and historical insights (design)

Status: built 2026-10-17; differences from this spec: each insight tile's footer also shows its source labels and "added <date>" next to the × (the spec only lists the ×), and the × asks for confirmation before retiring; replay ids may end in `R` after the device UUID (`isValidReplayId` accepts it); the 12-row replay list, the 60-person cap and the 3-hour cache are as specified, and weekly tiles span two columns from 640 px (three tile columns from 900 px).

Owner request (2026-10-16): add returning readers, session replays, pages per
visit and time on site, social-post attribution, web vitals and a "Historical
insights" section kept up to date by a weekly agent. Not now: a subscribe
funnel, article clicks. The owner chose Amplitude as the source wherever it can
answer (asked and confirmed for time on site and web vitals), knowing it only
covers visitors who accept cookies.

The mock that was approved is not in the repo (it holds visitor-level data and
the repo is public). Its layout is described in §4.

## 1. What the data can and can't do (verified 2026-10-16)

Every query below was run against the live account before this design was
written. These findings shaped the design; don't "simplify" them away.

| Finding | Consequence |
|---|---|
| The cookie gate took effect during 5 Oct: Amplitude saw 8 people that day, the counter 9. | Every Amplitude panel starts at `CONSENT_START = 2026-10-06`. A longer period is clamped to it. |
| Amplitude sees about a quarter of visits (6–16 Oct: 9 of the counter's 38 visitor-days). | Each Amplitude panel group shows that coverage line, computed live. |
| Amplitude's `_new` count can exceed `_active` for the same window, with or without filters (week of 28 Sep: 37 vs 35). | Never compute returning = active − new. Returning readers come from per-person data (below). |
| Session replay `sampleRate` is 1, so every consented session has a replay. Since 6 Oct: 9 replays = 9 `session_start` events, 16 `page_view`s either way. | The Session Replay list API is the list of consented sessions. |
| Amplitude's session length is first-to-last tracked event: a one-page read scores 0 s (85% of sessions in a May–June sample). | Time on site = replay length (`end_time − start_time`), which runs to the last scroll or click. |
| The Export API has no `user_creation_time` (null on all events) and is slow (7 days 0.7 s, 28 days 22 s, 90 days 45 s). | Not used. |
| `lib/analytics/attribution.ts` keeps the last UTM a visitor ever clicked in `localStorage`, with no expiry, and stamps it on every later event. A visitor who came direct on 13 Oct carries an April newsletter campaign. All-year `utm_source=newsletter` page views: 14 by event property, 1 real tagged landing. | Attribution uses the landing page's `[Amplitude] Page Location` (full URL, query kept), never the `utm_*` / `acq_*` event props. The attribution bug itself is out of scope (owner to decide). |
| Web vitals were captured until 15 Apr (autocapture default), then switched off. Jan–Mar has 450 LCP samples. | Turn `autocapture.webVitals` on. p75 from per-value counts matched Amplitude's own ratings for all five metrics (e.g. LCP 86.9% good = 391 of 450). |
| Group-by on a numeric property returns one row per distinct value (Jan–Mar LCP: 292 rows). | p75 = walk the sorted value counts. Limit 1000 rows; if hit, say "sampled". |
| Replays are kept 30 days. | Returning readers, engagement and the replay list cover at most the last 30 days. |
| Queries are rate-limited by concurrency (HTTP 429 seen at 4+ parallel). A full refresh is ~22 calls, ~18 s sequential, one segmentation call took 9.9 s. | Concurrency 3 with 429 back-off, 3-hour cache, `maxDuration = 60` on the page. |
| The replay deep link is `https://app.eu.amplitude.com/analytics/<org>/session-replay/project/<projectId>/search/replay?sessionReplayId=<deviceId>%2F<sessionId>`. Project id is 100038173. No API returns the org's URL name. | New env var `AMPLITUDE_ORG` (Vercel). Without it there is no Amplitude link at all: a link to Amplitude's home page (the first mock) is useless. |
| `GET /api/1/session-replays/files?replay_id=` returns presigned S3 URLs (15 min) to gzipped JSON arrays of standard rrweb events (types 2/3/4/5/6). The bucket sends no CORS headers (browser fetch from our origin fails, preflight 403). Sizes: a 41 s visit 187 KB gzipped (1.5 MB JSON, one file); a 45 min visit 157 KB in four files. | Replays play inline: a password-gated route on our server fetches the files and hands them to Amplitude's open-source player (`@amplitude/rrweb-player` 2.1.4, MIT), tested on a real replay on 2026-10-16. |

## 2. Data per section

All Amplitude reads go through `lib/analytics/amplitude.ts` (EU Dashboard REST
and Session Replay APIs, Basic auth with the public key + `AMPLITUDE_SECRET_KEY`,
which is already in Vercel). Bot filtering reuses `HUMAN_FILTERS` from
`seo/analytics/visitors.ts`. Pure maths lives in `lib/analytics/amplitudeStats.ts`
and is unit-tested.

**People and sessions** (feeds three sections). Window = selected period ∩
[`CONSENT_START`, today] ∩ last 30 days.
1. `GET /api/1/session-replays?start_time&end_time&sort_order=desc` → sessions
   (replay id, amplitude id, session id, start, end).
2. One `GET /api/2/useractivity?user=<amplitude_id>&limit=1000` per distinct
   person → `first_used`, and that session's events (page views, landing URL,
   previous page, country, city, device, actions). Bot user agents are dropped.
   Scaling limit: one call per person. Fine below ~60 people a month; above
   that, cap to the most recent 60 and say "sampled", and revisit (a nightly
   Export job is the next step).

**Returning readers.** People; had visited before (`first_used` before the
window); first visit (`first_used` in the window); came back another day (2+
distinct days); new readers back within 7 days (of people first seen ≥ 7 days
before today, how many had a session on days 1–7 after). Shows "–" with a reason
when nobody is old enough.

**Engagement.** Visits (sessions), pages per visit (page views ÷ sessions),
median visit (replay length), visits over 3 min, and an ordered distribution
(under 10 s, 10–30 s, 30 s–1 min, 1–3 min, 3–10 min, over 10 min).

**Session replays.** The 12 most recent: Copenhagen time, visitor letter and
"since <first seen>" or "first visit", pages (consecutive repeats merged,
digest slugs shown as "Digest W41"), came from, place, device, action badges
(subscribed, read the digest, opened an article), length, page count, a Play
button and, when `AMPLITUDE_ORG` is set, an "Open in Amplitude" link.
Play expands the row into the player: `GET /analytics/replay?id=<deviceId/sessionId>`
(route handler, checks the `/analytics` session cookie and the id's format, lists the
replay's files, fetches them, merges the events in time order, returns them gzipped,
`Cache-Control: private`, 413 above 4 MB with a pointer to Amplitude). The client
component loads the player library only when Play is pressed, sizes it to the row,
and restyles its controls to the site's accent colour.
"Came from" = landing URL tags if any, else the external previous page's domain
through `classifyReferrer`, else "Direct / email / app".

**Social posts.** Segmentation on `page_view` filtered to `[Amplitude] Page
Location` contains `utm_`, grouped by Page Location, uniques and totals, from
`CONSENT_START`. Parsed: `utm_medium=social` rows become "channel · week · post"
(e.g. "X · W42 · story Tue"); other tagged links (newsletter, ChatGPT) are listed
below. Empty state until posts are clicked.

**Web vitals.** `autocapture.webVitals: true` in `AmplitudeInit.tsx` (still
consent-gated). For LCP, INP, CLS, FCP, TTFB: group `[Amplitude] Web Vitals` by
`[Amplitude] <M>.value` → p75, share good / needs work / poor by Google's
thresholds (LCP 2.5/4 s, INP 200/500 ms, CLS 0.1/0.25, FCP 1.8/3 s, TTFB
0.8/1.8 s), sample count. Window = selected period (not clamped). "No
measurements yet" until data arrives.

**Coverage line** (Amplitude group header): sum of daily `_active` uniques
(bots filtered) ÷ the counter's visitor-days, over the clamped window.

## 3. Historical insights

**Storage.** New table `analytics_insights`:
`id`, `tile` (jsonb: eyebrow, hero, unit, summary, detail, chart with values
resolved at write time), `evidence` (jsonb: fact ids and values), `sources`
(text[]), `added_on` (date), `added_by` (`seed` | `agent`), `retired_on`,
`retired_by` (`agent` | `owner`), `model`. Never in the repo: insight text
carries traffic facts and the repo is public. The page shows active rows, max 6,
newest first.

**Tile.** Big number + unit, one-line summary, detail line, at most one chart
from a fixed set: `weekly` (a series fact, one highlighted bar, labelled), `share`
(part and whole facts), `bars` (up to 5 labelled facts). Weekly tiles span two
columns. Each tile has a × (server action, password-gated) that retires it with
`retired_by = owner`.

**Weekly agent** (`npm run analytics:insights`, `scripts/analyticsInsights.ts`,
logic in `lib/analytics/insights/`):
1. Build a data pack of aggregates only, as flat facts `{ id, label, period,
   value }`: Amplitude history (weekly and monthly people, first referrers
   grouped into families such as LinkedIn = linkedin.com + com.linkedin.android
   + lnkd.in and Viva Engage = web.yammer.com + engage.cloud.microsoft, overall and
   for the three biggest weeks, languages, countries, browsers, devices, D7
   return by cohort month, dead/rage clicks by element with the text normalised
   to the topic name in any locale from `lib/i18n/messages.ts`, top pages, tagged
   landings, vitals p75 by month), the counter (weekly visitors, channels, pages,
   countries, devices), Search Console (28 days vs previous, top queries and
   pages) and subscribers (counts by plan, sign-ups by month). No replays, no
   per-person rows, no raw events. Facts are built at the granularity a sentence
   needs, because the checks accept no arithmetic beyond a percentage.
2. One Claude Messages API call (`INSIGHTS_MODEL`, default `claude-opus-5-5`,
   key `ANTHROPIC_API_KEY`, already a GitHub secret) with the active insights,
   the removed ones and the pack. Structured output: `{ decision: "add" | "none",
   reason, insight?: { tile, evidence: factId[] }, retire?: id }`.
3. Checks (pure, `checks.ts`), all must pass or nothing is written:
   - every evidence id exists in the pack; chart values are fact references, never free numbers;
   - every number in the text equals a cited fact's value, or a percentage of two cited facts, at the precision written; dates in the text fall within a cited fact's period;
   - length limits (eyebrow 32, hero 8, unit 16, summary 90, detail 180 characters);
   - not a near-duplicate: evidence overlap ≤ 50% with any active or owner-removed insight;
   - `retire` is required when 6 are active and must name an active insight;
   - at most one add and one retire per run.
4. Write, log the decision and reason. A failed check logs which one and exits 0
   (no change is a valid outcome); an API or database error exits 1.

`--dry-run` prints the decision without writing. `--seed <file>` inserts tiles
from a local JSON file through the same checks (used once for the starting five;
the file stays out of the repo).

**Schedule.** `.github/workflows/weekly-analytics.yml`, Sundays 09:00 UTC (after
`seo-weekly`), with `DATABASE_URL`, `AMPLITUDE_SECRET_KEY`, `ANTHROPIC_API_KEY`
and the three `GSC_*` secrets. Separate from the digest workflows so it can't
affect them.

**Starting set** (re-checked 2026-10-16): biggest week (weekly chart), return
visits within a week (share), dead clicks on topic tiles Jan–Mar (bars),
English share of visitors (share), first visits from AI assistants (no chart).
They go in with `--seed` through the same checks against a fresh pack. If one
fails, the pack is missing a fact; fix the pack, not the check.

## 4. Page layout

Order: Historical insights (tiles) · Visitors (unchanged) · Amplitude group
header (eyebrow, coverage line, one period picker for the group) · Returning
readers · Engagement · Session replays · Social posts · Web vitals · Google
search (unchanged) · Subscribers (unchanged).

Same visual language as today (cards, mono eyebrow labels, stat tiles, accent
bars). Status colours for vitals always come with an icon and a label. Context
bars use `--color-bar`, highlights `--color-accent`; key values are always
labelled, the rest are on hover.

Code layout: the page is ~400 lines, so shared pieces (Shell, Section, Stat,
BarList, Table, RangePicker, ErrorNote) move to `app/analytics/ui.tsx`; new
sections go in `app/analytics/sections/`; the replay route is
`app/analytics/replay/route.ts` (inside `/analytics`, so robots and the password
gate already cover it) and the player is one client component. Each section loads through the existing
`settle()` pattern, so one failing source shows an error note and the rest of the
page still renders.

## 5. Privacy

No change to the privacy notice: everything new from visitors comes from
Amplitude, which runs only after consent and is already described (including
session recordings). Web vitals are page-speed timings, collected under the same
consent. Replays pass through our server to the owner's browser and are not
stored (private, browser-only cache). The agent sends only aggregates to the
Claude API.

## 6. Tests

`node:test` suites for: p75 and rating shares; returning, D7 and engagement maths
(including the "none old enough" case); session building from replays plus user
activity; came-from and tagged-URL parsing; page names; replay id validation and event
merging in the replay route; and the insight checks
(grounded and ungrounded numbers, percentages, dates, duplicates, retire rules).
The checks are the only review the agent's output gets, so they get the most tests.

## 7. Not in this build

Subscribe funnel; article clicks; fixing the sticky UTM attribution in
`lib/analytics/attribution.ts`; counter-based time on site; PageSpeed/CrUX lab
checks.

## 8. Owner actions after shipping

Optional: set `AMPLITUDE_ORG` in Vercel (the word after `/analytics/` in the
Amplitude URL) to get "Open in Amplitude" links next to Play.
