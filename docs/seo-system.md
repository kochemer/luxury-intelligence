# SEO system architecture

An automated system that audits the site's SEO, tells you when it breaks,
repairs code defects itself, and rolls production back when a deploy goes bad.

Almost all of it is ordinary deterministic TypeScript. Exactly one component
uses an LLM. That division is deliberate and explained under
[Why so little of this is AI](#why-so-little-of-this-is-ai).

| Doc | Read it for |
|---|---|
| this file | how the system works |
| [seo-status.md](seo-status.md) | current numbers, what is live vs. built, how to pick back up |
| [seo-decisions.md](seo-decisions.md) | why it is built this way, and what was rejected |
| [seo-backlog.md](seo-backlog.md) | ideas not scheduled |

---

## The shape of it

```
                        ┌──────────────────────────────┐
  data/digests/*.json ──▶│ lib/seo/urlInventory.ts      │──▶ app/sitemap.ts
  (read at runtime)      │ every indexable URL, once    │    (thin wrapper)
                        └──────────────┬───────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐           ┌──────────────────┐          ┌────────────────────┐
│ staticAudit   │           │ liveAudit        │          │ indexingAudit      │
│ repo + digest │           │ fetches the 52   │          │ asks Google what   │
│ data, no net  │           │ live pages       │          │ it did per page    │
└───────┬───────┘           └────────┬─────────┘          └─────────┬──────────┘
        │                            │                              │
        │      ┌─────────────────────┴──────┐                       │
        │      │ optimize/linkGraph+assets  │                       │
        │      │ opportunities, not defects │                       │
        │      └─────────────┬──────────────┘                       │
        └────────────────────┴──────────────┬────────────────────────┘
                                            ▼
                                     Finding[]  ← the common currency
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              ▼                             ▼                             ▼
     ┌─────────────────┐          ┌──────────────────┐          ┌──────────────────┐
     │ report/         │          │ monitor/         │          │ repair/          │
     │ scored markdown │          │ daily, alerts on │          │ LLM writes a fix,│
     │ + WoW delta,    │          │ *changes* only   │          │ 6 gates decide   │
     │ Sunday email    │          │                  │          │                  │
     └─────────────────┘          └────────┬─────────┘          └──────────────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │ recovery/        │
                                  │ roll production  │
                                  │ back, revert git │
                                  └──────────────────┘
```

### Why `Finding` is the spine

Four very different producers — repo data, live HTML, Google's API, a link
graph — all emit the same `Finding` shape (`seo/types.ts`). That is what lets
them compose into one ranked report, one alert channel and one repair queue
without each consumer knowing where a finding came from.

`severity` carries load-bearing meaning:

| Severity | Means | Monitor alerts? | Repair acts? |
|---|---|---|---|
| `critical`, `high` | something is **wrong** | yes | yes |
| `medium`, `low`, `info` | could be **better** | no | no |

Mixing those up either floods the alert channel or lets real breakage pass
unnoticed. When adding a check, the question is not "how annoying is this" but
"is the site currently incorrect".

---

## Commands

```bash
npm run seo:audit       # static + live checks → data/seo/report-{week}.md
npm run seo:monitor     # is anything broken right now? (what CI runs daily)
npm run seo:indexing    # what Google reports per page + sitemap health
npm run seo:optimize    # best-practice opportunities (link graph, headings)
npm run seo:gsc         # pull + store a Search Console snapshot
npm run seo:repair      # find breakage, let an agent fix it, verify
npm run seo:recover     # detect an outage, roll production back
npm run seo:setup-gsc   # convert a service-account key into env vars
npm run seo:weekly      # full pass: audit + indexing + links + assets, emails a summary
npm run typecheck:seo   # type-check the SEO system, scripts/ included
```

Every one is safe to run: `seo:repair` and `seo:recover` default to
preview-only regardless of authority unless authority explicitly grants more.
Pass `--no-email` to `seo:weekly` when running it locally.

---

## What you receive

Two emails, both to `SEO_ALERT_EMAIL`, with opposite rules:

| Email | Sent by | When | Why that rule |
|---|---|---|---|
| **Weekly summary** | `seo-weekly.yml`, Sundays 08:00 UTC | **every week**, even when all is clear | it is the weekly job's deliverable; silence would be indistinguishable from the job not running |
| **Daily alert** | `seo-monitor.yml`, daily 07:00 UTC | **only** when a problem appears or clears | an alert that also says "still fine" gets filtered, and is then useless on the day it matters |

The weekly summary leads with three numbers rather than the score: **site
health** (`STATIC_*`/`LIVE_*` findings), **Google indexes N of M** (with the
change since last week) and **improvement ideas** (`OPT_*`). The score alone
misleads: a week where the site is spotless but Google has not crawled half of
it scores 25/100.

Both go through `seo/shared/email.ts`. A send counts as delivered only with no
error **and** a Resend message id. If either email cannot be delivered, its
workflow fails (exit 2), so GitHub notifies you instead. A failed daily alert
also leaves monitor state unchanged, so the next run retries it.

To check alerting end to end: Actions → SEO monitor → Run workflow → tick
`test_alert`, or locally `npm run seo:monitor -- --test-alert`.

---

## Authority

`seo/authority.ts`. Set by the `SEO_AGENT_AUTHORITY` repo variable, so it can
be changed without a deploy — the moment you want to revoke authority is
rarely the moment you want to be editing code.

| Level | Grants |
|---|---|
| `observe` | reports only, writes nothing **(default, and what a typo resolves to)** |
| `propose` | repair may open pull requests |
| `recover` | + recovery may roll back a bad production deployment |
| `autonomy` | + repair may merge its own PRs; recovery may revert commits |

Levels are ordered by how hard the action is to undo, and are additive.

Two caveats, both detailed in [seo-status.md](seo-status.md):

- **The `autonomy` merge grant is declared but not implemented.** Repair opens
  a PR at every level above `observe`. Rollback and commit reverts do read
  their grants.
- **A grant is not the same as being able to act in CI.** As of 2026-09-13 the
  monitor workflow doesn't install Claude Code or the Vercel CLI and has no
  `VERCEL_TOKEN`. At `recover` (the current level) repair and rollback would
  trigger but fail to act.

### Guardrails, which are not part of authority

`assertGuardrails()` runs before any agent does anything and **throws** if the
limits have been weakened. It is re-verified every run rather than trusted,
because the failure it defends against is the policy itself being edited.

Unreachable at every level, including `autonomy`:

- `.env*` — credentials
- `lib/db/`, `lib/stripe/`, `app/api/stripe/` — database and payments
- `.github/` — CI, including the agents' own workflows
- `next.config.ts`, `lib/utils/weekSlug.ts`, `middleware.ts` — every URL on the site
- `package.json` — dependencies
- `data/digests/` — published content
- `seo/repair/policy.ts` — **the limits themselves**

No `rm`, no `git push`/`reset`/`checkout`/`rebase`, no `gh pr merge`, no
network tools. Max 1 repair per run. Circuit breaker after 2 failed attempts
on the same finding.

Authority widens what the agent may **decide**. It never widens what the agent
may **reach**.

---

## The six gates

`seo/repair/verify.ts`. A repair ships only if all six pass; any failure
discards the branch entirely and leaves nothing behind but a ledger entry.

1. **Only permitted files touched** — checked against the policy, including
   files the agent newly created (`git diff` alone misses those)
2. **TypeScript compiles**
3. **Tests pass**
4. **Production build succeeds**
5. **The original finding is actually gone**
6. **No new findings introduced**

Gate 6 matters as much as gate 5: a fix that resolves one problem while
creating two others is worse than the defect. Gates 5 and 6 re-audit in a
**subprocess**, because Node caches modules and an in-process re-audit would
keep running the code as it was before the agent edited it.

### Cost controls

`seo/config.ts` and `seo/repair/spend.ts`.

| Control | Value | Enforced by |
|---|---|---|
| Model | `sonnet` | `--model` flag |
| Per run | $2 | the Claude CLI (`--max-budget-usd`), so it holds even if this repo has a bug |
| Rolling 30 days | $15 | `checkBudget()` before invoking, from `data/seo/repair-spend.json` |
| Repairs per run | 1 | `MAX_REPAIRS_PER_RUN` |
| Attempts per finding | 2, then escalate to a human | circuit breaker in `data/seo/repair-ledger.json` |

The 30-day cap and the circuit breaker rely on those two JSON files persisting
between runs. The monitor workflow doesn't commit them yet, so in CI only the
per-run cap currently holds. An Anthropic Console spend limit is the backstop.

---

## Why so little of this is AI

The dividing line is **facts versus judgement**.

Counting, comparing, fetching, validating, scoring, and every file write are
facts — deterministic code does them faster, free, and identically every time.
An LLM appears in exactly one place: `seo/repair/` , where it reads a defect
and writes a fix, because that needs judgement about root cause.

This is not squeamishness. Severity and scoring must be deterministic or the
week-over-week delta is meaningless — "three new problems since last week"
stops meaning anything if the grading drifts between runs.

---

## Scoring

`seo/report/buildReport.ts`. Worst severity present picks a **band**; finding
volume positions the score inside it. Bands never overlap.

This ordering is the whole point. A count-only score rated one critical
finding (a de-indexed site) at 94/100 while 37 cosmetic title findings scored
39/100 — exactly backwards, and dangerous for a number that gates decisions.

A category nobody audited scores `null` ("not checked"), never 100. An
unchecked area must not read as a clean bill of health.

---

## Things that will bite you

**`getSiteUrl()` is not production.** It resolves `NEXT_PUBLIC_SITE_URL`, which
is `http://localhost:3000` in local dev. The monitor and recovery use a
hardcoded `CANONICAL_URL` and refuse local URLs — an early version checked
localhost, found no dev server, and reported the live site as 52-times broken.
Same reasoning as `CANONICAL_URL` in `lib/email/transactional.ts`.

**Change a check when you change what it asserts.** Twice now, an
implementation moved and its check silently went stale: the title check
re-derived the layout's suffix after titles became `absolute`, and the JSON-LD
check expected `Article` after the schema became `NewsArticle` (37 false
positives). Prefer calling the same function the page calls.

**Absent data is not a defect.** `alt=""` is the *correct* marker for a
decorative image. `PAGE_FETCH_STATE_UNSPECIFIED` means Google never fetched
the page, not that fetching failed. Both shipped as false positives and both
now have regression tests.

**A Vercel rollback does not revert git.** It changes which build serves
traffic; the bad commit stays on `main` and the next push redeploys it. That
is why `autonomy` also grants `canRevertCommits`.

**`data/seo/` must stay in the weekly workflow's commit allowlist** or the
digest pipeline hard-fails on files it did not expect.

**Resend does not throw when it rejects an email.** An unverified domain, bad
key or rate limit comes back as `{ error }` on a resolved promise. The first
alert sender ignored that and logged success while nothing arrived. Use
`deliverEmail()` in `seo/shared/email.ts`; don't call Resend directly.

**`npx tsc --noEmit` does not check `scripts/`.** The root `tsconfig.json`
excludes it, and `tsx` runs scripts without type-checking. A string broken
across two lines in `scripts/runSeoWeekly.ts` passed both. `tsconfig.seo.json`
covers the SEO scripts, and `__tests__/seo.typecheck.test.ts` runs it inside
`npm test`, so the repair gates cover it too.

**Don't commit `data/seo/monitor-state.json` from a local run.** CI writes and
commits it after every daily run, so committing a local copy guarantees a
rebase conflict. It has to stay tracked — transition-based alerting depends on
it persisting between runs — so the answer is to leave it to CI. If you do hit
the conflict, take CI's version (`git checkout --ours`): it reflects the last
run against production, which yours does not.

---

## Where things live

| Path | What |
|---|---|
| `lib/seo/urlInventory.ts` | every indexable URL — the source `app/sitemap.ts` wraps |
| `lib/seo/metaText.ts` | digest titles and descriptions |
| `lib/seo/jsonLd.ts` | structured data, `@id`-anchored entity graph |
| `seo/audit/` | static, live and indexing checks |
| `seo/optimize/` | best-practice opportunities |
| `seo/monitor/` | daily breakage detection + alerting |
| `seo/report/weeklyEmail.ts` | the Sunday summary email |
| `seo/shared/` | one copy each of finding ids, page fetching, email delivery |
| `seo/repair/` | the agent, its policy, and the six gates |
| `seo/recovery/` | outage detection and rollback |
| `seo/gsc/` | Search Console client, queries, snapshots |
| `seo/authority.ts` | what the agents may do, plus the guardrail tripwire |
| `data/seo/` | reports, GSC snapshots, monitor and repair state |
| `.github/workflows/seo-monitor.yml` | the daily run |
| `.github/workflows/seo-weekly.yml` | the Sunday run |

---

## Structured data

One entity graph, declared once in `app/layout.tsx` via `buildRootGraphLd()`,
with `@id`s that other pages reference rather than re-declare:

- `{siteUrl}/#website` — WebSite
- `{siteUrl}/#organization` — Organization (publisher)
- `{siteUrl}/#editor` — Person (author)

Before this, Organization and Person were declared separately in the layout
and the digest page with no `@id`, so nothing connected an article's publisher
to the organisation running the site — three anonymous entities sharing a
name. Entity resolution is the foundation of GEO/AEO: an answer engine cannot
attribute a claim to a publisher it cannot identify.

Digest pages emit `NewsArticle` + `ItemList` + `BreadcrumbList`. `/archive`
emits `CollectionPage` + `ItemList`. `/about` has a `FAQPage`.
`/llms.txt` describes the publication for AI crawlers and is generated, so its
edition count cannot go stale.

`sameAs` is deliberately absent from the Organization — no social profiles
exist, and inventing URLs would be worse than omitting the property. A test
enforces that.
