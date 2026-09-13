# SEO system — where we left off

> **Snapshot taken 2026-09-13.** Everything here was true on that date and will
> drift. Architecture lives in [seo-system.md](seo-system.md), the reasons
> behind each choice in [seo-decisions.md](seo-decisions.md), unscheduled ideas
> in [seo-backlog.md](seo-backlog.md).

The plan was to build the system, leave it running for a few weeks to collect
Search Console data, then come back and decide what to do next based on what
the data says.

---

## Picking back up: do these in order

1. **Read the latest Sunday email**, or `data/seo/weekly-latest.json` plus the
   newest `data/seo/weekly-YYYY-Www.md`. The weekly job commits both.
2. **Compare with the baseline below.** The main question is whether Google
   started crawling the 26 never-crawled pages after the sitemap was
   resubmitted on 2026-09-11. Week 2026-W38 (20 Sep) is the first email to show
   a week-over-week indexing change.
3. **Pull fresh traffic numbers:** `npm run seo:gsc`. Compare impressions,
   clicks and, most importantly, whether any **non-branded** query appears.
4. **Check GitHub Actions for red runs** on *SEO Monitor* and *SEO Weekly*. A
   failed run means the job broke or an email could not be delivered. A green
   run with problems is normal: problems arrive by email.
5. **Check `data/seo/monitor-state.json`.** `openProblemIds: []` and a growing
   `consecutiveHealthyRuns` mean the site has not broken since.
6. **Use the decision guide at the bottom** to pick the next piece of work.

---

## Baseline to compare against

### Traffic: Search Console, 28 days to 2026-09-08 (snapshot pulled 2026-09-11)

| Metric | Last 28 days | Previous 28 days |
|---|---|---|
| Impressions | 177 | 216 |
| Clicks | 3 | 1 |
| CTR | 1.7% | 0.5% |
| Average position | 12.2 | 7.4 |
| Pages with any impressions | 17 | — |
| Queries above Google's privacy threshold | 2, both branded: "luxury intelligence", "luxe intel" | — |

Positions are respectable where pages match something. Almost nothing matches.
**Demand, not technical SEO, is the constraint** (see
[seo-backlog.md](seo-backlog.md#first-the-standing-constraint)).

### Indexing: weekly report 2026-W37 (13 Sep)

| State | Pages |
|---|---|
| Indexed | **23 of 53** |
| Never crawled by Google | 26: 18 digests plus `/about`, `/methodology`, `/email-digest`, `/subscribe`, `/support`, `/es`, `/da`, `/es/methodology` |
| Crawled, currently not indexed | 4: `/es/about`, `/da/methodology`, `/digest/february-2026-week-6`, `/digest/june-2026-week-24` |

Sitemap: Google's copy had gone unread for 214 days and held 10 URLs. It was
resubmitted 2026-09-11, Google re-read it within seconds, and it now holds
the full set. The weekly job flags it if it goes stale again (over 30 days).

### Site health: 13 Sep

- **0 technical defects** across static checks and all 53 live pages.
- Daily monitor: 8 consecutive healthy runs, no open problems.
- Weekly score **25/100**. Every finding pulling it down is a Google indexing
  finding (26 never crawled + 4 not indexed, all `high`), not a site defect.
- Minor: 2 `low` and 1 `info` improvement ideas. Two are noise from Google's
  32px favicon images; see *Known issues*.
- Images: before this work, 38 cover PNGs averaged 2.52 MB and `/archive`
  weighed ~94 MB. Now served via `next/image`: an archive card is ~20 KB WebP.

---

## What is running, and what only looks like it is

| Component | Built | Runs automatically | Verified |
|---|---|---|---|
| Daily monitor + alert email | ✅ | ✅ every day, 07:00 UTC | test alert delivered from CI, Resend id `57744023…` |
| Weekly pass + summary email | ✅ | ✅ Sundays, 08:00 UTC | two real summaries delivered 13 Sep (`ff19b548…`, `e9dc7097…`) |
| Static + live audit | ✅ | inside both jobs | 0 defects on 53 pages |
| Indexing audit (URL Inspection, sitemap health) | ✅ | weekly | produces the 23/53 figure |
| Link graph, image weight | ✅ | weekly | found and fixed the 94 MB archive |
| **Repair agent** (Claude fixes code defects) | ✅ | ⚠️ **step exists, cannot act in CI** | drilled locally on Windows only |
| **Recovery** (roll production back) | ✅ | ⚠️ **step exists, cannot act in CI** | never exercised against a real outage |
| Optimiser agent (acts on improvement ideas) | ❌ | — | deliberately not built yet |
| Measurement loop (did a change help?) | ❌ | — | deferred until ~5,000 impressions/month |

**So today:** if the site breaks, the monitor detects it and **emails you**,
autonomously. Nothing gets **fixed** automatically yet. Repair and recovery
have never been triggered, because the site has been healthy every day. If
they were, they would fail for the reasons below and you would fix it by hand
from the alert.

GitHub runs scheduled jobs late. Observed delays were 4–5 hours (the Sunday
08:00 job ran at 13:13). Expect alerts that day, not that minute.

### Why repair cannot act in CI

Confirmed by reading `seo-monitor.yml` and `seo/repair/`. Never observed in a
run, because the step has never been triggered.

1. **Claude Code is not installed** in the workflow, and not a dependency. The
   agent spawns `claude`, the spawn fails, and the attempt is recorded as
   `agent-failed`.
2. **It could not open a PR** even if it ran: the step gets no `GH_TOKEN`, and
   the job lacks `pull-requests: write`.
3. **Its ledgers are not saved.** `data/seo/repair-ledger.json` (the
   two-attempts-per-finding circuit breaker) and `data/seo/repair-spend.json`
   (the $15/30-day cap) are written in the runner and discarded. Only
   `monitor-state.json` is committed. The **$2 per-run cap still holds**,
   because the Claude CLI enforces it. The monthly cap and circuit breaker
   would not survive between runs.
4. **Discarding a failed repair wipes the monitor's unsaved state.** `abandon()`
   runs `git reset --hard`, which reverts `monitor-state.json` before the
   workflow commits it. The same problem would then look new every day and
   re-alert daily.

### Why recovery cannot act in CI

1. **No Vercel credentials.** The Vercel CLI is not installed and there is no
   `VERCEL_TOKEN` secret, so recovery stops at `not-authenticated`.
2. **Its outcome is not emailed.** The result is only in the run log. The
   monitor's alert still arrives.

### Enabling both (a task for when you're back)

- [ ] **You:** create a Vercel access token and add it as the `VERCEL_TOKEN` repo secret.
- [ ] Install the Vercel CLI and Claude Code in `seo-monitor.yml`.
- [ ] Give the repair step `GH_TOKEN: ${{ github.token }}` and the job `pull-requests: write`.
- [ ] Commit `repair-ledger.json` and `repair-spend.json` alongside `monitor-state.json`.
- [ ] Stop `abandon()` from resetting `data/seo/` (or persist state before repair runs).
- [ ] Email the recovery outcome.
- [ ] Rehearse: break something on a branch, confirm a PR appears and the gates run in CI.

`.github/` is on the agents' deny list, so this is human work by design.

---

## Known issues (small, none urgent)

- **`autonomy` does not merge anything yet.** `seo/authority.ts` grants
  "repair may merge its own PR" at `autonomy`, but nothing reads that grant:
  `runRepair` opens a PR at every level above `observe`. Rollback and commit
  reverts *are* wired to authority. Implement the merge, or drop the grant,
  before ever raising the level to `autonomy`.
- **Repairable-code drift.** `REPAIRABLE_CODES` in `seo/repair/policy.ts`
  lists `LIVE_JSONLD_MISSING_ARTICLE`, but the check now emits
  `LIVE_JSONLD_MISSING_NEWSARTICLE` after the `NewsArticle` switch.
  `STATIC_SITEMAP_URL_MISMATCH` is emitted by no check at all. No practical
  effect today: JSON-LD findings are `medium`, and only `critical`/`high` reach
  repair. Fix it together with a contract test asserting every repairable code
  is emitted somewhere.
- **Favicon noise in the image audit.** `OPT_IMAGE_NOT_RESPONSIVE` counts 56
  Google-favicon images (32px) as needing `srcset`, and `OPT_ASSET_SIZE_UNKNOWN`
  flags the same service for sending no `Content-Length`. Exempt tiny images
  and the favicon service.
- **Stale comment.** `seo-monitor.yml` says it runs "an hour after the Sunday
  digest build". GitHub's cron delays make that unreliable.
- **Root `tsc` skips `scripts/`.** Handled: `npm run typecheck:seo` covers the
  SEO scripts and runs inside `npm test`.

---

## Open decisions (yours)

| Decision | Context |
|---|---|
| Enable repair + recovery in CI? | Checklist above. Means an unattended agent opening PRs, and rollback acting on production. |
| **Rotate the Anthropic API key** | It was pasted in plain text into a chat session during setup. Also set a monthly spend limit in the Anthropic Console, since the in-repo 30-day cap does not yet persist in CI. |
| Named author instead of "The Editor"? | E-E-A-T and AEO citability versus deliberate anonymity. Either is legitimate. Backlog #3. |
| Do social profiles exist? | Only real ones go in `sameAs`. A test enforces its absence until then. Backlog #1. |
| The 4 crawled-not-indexed pages | Probably thin locale translations. The right answer may be `noindex`, not more content. Backlog #8. |

---

## Configuration in place

No secret values here, only where things are.

| What | Where | Value / note |
|---|---|---|
| Agent authority | repo **variable** `SEO_AGENT_AUTHORITY` | `recover` (set 2026-09-11) |
| Search Console | secrets `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY_B64`, `GSC_SITE_URL` | URL-prefix property `https://luxury-intel.com/` (not `sc-domain:`). Also in `.env.local`. |
| Alert/summary recipient | secret `SEO_ALERT_EMAIL` | the owner's Gmail |
| Email sending | secrets `RESEND_API_KEY`, `EMAIL_FROM` | shared with the digest emails |
| Repair agent | secret `ANTHROPIC_API_KEY` | model `sonnet`, $2/run, $15/30 days (`seo/config.ts`) |
| Rollback | secret `VERCEL_TOKEN` | **missing** |
| Vercel | project `luxury-intelligence` | legacy duplicate project deleted by the owner, Sept 2026 |

---

## Decision guide for the next phase

Start from the numbers in step 2 and 3 of *Picking back up*.

| If you see… | It probably means | Do next |
|---|---|---|
| Indexed count clearly rising (23 → 35+) | Resubmitting the sitemap worked; crawl was the blocker | Let it run. Move to content that targets real searches. |
| Never-crawled pages unchanged after 4+ weeks | Crawl budget: Google deprioritises low-traffic sites | Request indexing by hand in Search Console for the ~5 most important pages. Strengthen internal links to older digests. Backlog #4 (social posts as a discovery path). |
| Crawled-not-indexed count growing | Google judges pages thin or duplicative | Decide `noindex` vs richer content for locale utility pages (backlog #8). |
| Impressions still ≲ 500 / 28 days, queries still branded | No search demand for weekly archives | Evergreen or topic pages people actually search for. More optimisation won't move this. |
| Any non-branded query with impressions | The first real demand signal | Look at which page ranks for it and build more around that topic. |
| Impressions ≥ ~5,000 / month | Enough signal to measure changes | Build the measurement loop (backlog #10), then the optimiser agent. |
| Red runs in Actions | A job broke or email failed | Fix that first; the rest depends on it. |
