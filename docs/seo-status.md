# SEO system — where we left off

> **Snapshot taken 2026-09-13.** Everything here was true on that date and will
> drift. Architecture lives in [seo-system.md](seo-system.md), the reasons
> behind each choice in [seo-decisions.md](seo-decisions.md), unscheduled ideas
> in [seo-backlog.md](seo-backlog.md).

The plan was to build the system, leave it running for a few weeks to collect
Search Console data, then come back and decide what to do next based on what
the data says.

> **Update 2026-09-18** (content-side fixes, outside the SEO system itself —
> see `luxury-intel-roadmap-2026-09.md`, Phase 1 + F2.3):
> - Every digest page now has a real meta description and keywords: the weekly
>   insight (`oneSentenceSummary`) and `keyThemes` had been null since W04
>   because the pipeline never called their generator. Wired in, made blocking
>   in the content-quality gate, and backfilled for every week on disk.
> - Article summaries rewritten with a new prompt and gpt-4.1 (no more
>   "The article from X dated Y…"), backfilled W52–W36.
> - `/es` and `/da` pages are `noindex`, out of the sitemap, and the hreflang
>   cluster is gone (backlog #8 resolved the `noindex` way). GSC had 0 clicks /
>   0 impressions for every locale URL. robots.txt unchanged so Google can
>   crawl them and see the tag.
> Expect the weekly indexing score to move only after Google re-crawls; the
> W37 report (indexing 25) is the baseline.

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
| Search traffic tracking | ✅ | ✅ weekly since 2026-10-04: snapshot committed, impressions lead the email | preview rendered with real data; first scheduled run 4 Oct |
| Static + live audit | ✅ | inside both jobs | 0 defects on 53 pages |
| Indexing audit (URL Inspection, sitemap health) | ✅ | weekly | produces the 23/53 figure |
| Link graph, image weight | ✅ | weekly | found and fixed the 94 MB archive |
| **Repair agent** (Claude fixes code defects, opens a PR) | ✅ | ✅ **able to act in CI since 2026-10-04** (triggers on repairable critical/high findings) | each part verified in CI separately; no end-to-end rehearsal yet |
| **Recovery** (roll production back) | ✅ | ✅ **live in CI since 2026-09-21** (triggers when the monitor finds problems) | token verified in CI; never exercised against a real outage |
| Optimiser agent (acts on improvement ideas) | ❌ | — | deliberately not built yet |
| Measurement loop (did a change help?) | ❌ | — | deferred until ~5,000 impressions/month |

**So today (updated 2026-10-04):** if the site breaks, the monitor detects it
and **emails you**. If at least 3 of 8 sampled pages are failing, recovery
**rolls production back** to the previous deployment and emails the outcome.
If the problem is a code defect on the repairable list, the repair agent
writes a fix, the six gates check it, and it is opened as a **pull request for
you to review** — never merged automatically. Neither step has been triggered
by a real incident; the site has been healthy every day.

**After an automatic rollback, deploys are frozen.** Vercel stops putting new
pushes live, including the Sunday digest, until you press **Undo Rollback**
on the project page or run `vercel promote <url>`. Do that once the fix is
deployed. The recovery email says this in its subject line.

GitHub runs scheduled jobs late. Observed delays were 4–5 hours (the Sunday
08:00 job ran at 13:13). Expect alerts that day, not that minute.

### Repair: able to act (2026-10-04)

The four blockers found on 2026-09-13, and how each was closed:

1. **Claude Code wasn't installed in CI.** The repair step now installs
   `@anthropic-ai/claude-code@2`.
2. **It couldn't open a PR.** Fixed 2026-09-24: `GH_TOKEN`,
   `pull-requests: write`, and the repo setting allowing Actions to create PRs.
3. **Its ledgers weren't saved.** "Persist SEO state" now commits
   `repair-ledger.json` (circuit breaker) and `repair-spend.json` ($15/30
   days), runs even when repair fails, and returns to `main` first if a crash
   left the repair branch checked out.
4. **Discarding a failed repair wiped the monitor's state** (`git reset
   --hard`), which would have caused a duplicate alert every day. It now
   discards only outside `data/seo/`, which the agent can't write, and
   unstages first so a file the agent `git add`ed isn't carried to `main`.

Also on 2026-10-04: the `ANTHROPIC_API_KEY` secret was replaced. The old one
was rejected by the API ("not scoped to a workspace"), so every repair would
have failed even with the CLI installed. The new key is the one in
`.env.local`.

**Check it:** Actions → *SEO Monitor* → Run workflow → tick
`check_repair_agent` (installs the CLI, one call, ~$0.01) or
`check_repair_pr` (opens and closes a draft PR).

### Recovery: now live (2026-09-20/21)

- `VERCEL_TOKEN` secret added by the owner on 2026-09-18. Verified in CI: it
  lists production deployments. Its scope and expiry are whatever was chosen
  at creation; see [vercel.com/account/tokens](https://vercel.com/account/tokens).
- The Vercel CLI (`vercel@50`) is installed in the recovery step.
- Every outcome except "healthy" is emailed (`seo/recovery/notify.ts`).
- Rollback targets only the deployment live before the current one: the only
  one Hobby allows.
- **Check the token:** Actions → *SEO Monitor* → Run workflow → tick
  `check_recovery_auth`. It changes nothing. Run it after changing the token,
  and before its expiry date (an expired token fails silently until an outage).
- **Known limitation:** `vercel ls` doesn't say which deployment is live, so
  "live" is inferred as the newest Ready one. While deploys are frozen after a
  rollback, that's wrong: a second outage would target the deployment already
  serving, and report `rollback-failed`. That errs toward emailing you rather
  than doing damage.

Two bugs were caught by the first CI credential check, before any incident
depended on them. The workflow step never ran (a boolean input compared to the
string `'true'`). And in-progress builds at the top of the list were treated as
live.

### Remaining for repair

- [ ] Rehearse end to end: introduce a repairable defect on a branch, confirm
      the agent fixes it, the gates run in CI, and a PR appears. Each part has
      been verified separately; the whole chain hasn't.

`.github/` is on the agents' deny list, so this is human work by design.

---

## Known issues (small, none urgent)

- **`autonomy` does not merge anything yet.** `seo/authority.ts` grants
  "repair may merge its own PR" at `autonomy`, but nothing reads that grant:
  `runRepair` opens a PR at every level above `observe`. Rollback and commit
  reverts *are* wired to authority. Implement the merge, or drop the grant,
  before ever raising the level to `autonomy`.
- ~~**Repairable-code drift.**~~ Fixed 2026-10-04, with a contract test that
  every code the policy names is one some check emits.
- ~~**Favicon noise in the image audit.**~~ Fixed 2026-10-04: favicons declare
  16px, and images declared ≤ 64px are skipped.
- **The repairable JSON-LD codes never reach repair.** They're `medium`
  severity, and only `critical`/`high` findings are passed to repair.
  Harmless, but they're effectively decorative entries in the policy.
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
| Rollback | secret `VERCEL_TOKEN` | added 2026-09-18, verified in CI 2026-09-21. Scope and expiry: see vercel.com/account/tokens |
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
