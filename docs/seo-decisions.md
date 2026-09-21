# SEO system — decision log

Why the system is shaped the way it is. Each entry says what was decided, why,
what was rejected, and when to reconsider. Read this before undoing something
that looks odd: most odd-looking things here are deliberate.

Current state and next steps: [seo-status.md](seo-status.md). Architecture:
[seo-system.md](seo-system.md).

---

## Timeline

All work landed on `main` between 2026-09-09 and 2026-09-13.

| Date | Commit | What |
|---|---|---|
| 09-09 | `d32a00b` | Stage 1: static audit, scoring, markdown report. No fixes. |
| 09-10 | `6f5d249` | Fixed scoring inversion, unchecked categories scoring 100, duplicated constant |
| 09-11 | `c1a3f0f` | Stage 2: live HTTP audit. Found `/feedback` in the sitemap while `noindex`. |
| 09-11 | `ad4a454`, `53dfe7c` | Stage 3: Search Console client, credential setup script, first real data |
| 09-11 | `7c279f7` | Daily monitor with transition-based email alerts |
| 09-11 | `d85ed72`, `4154123` | Self-repair: policy, six verification gates, ledger, agent invocation |
| 09-11 | `7d0e437` | Automated rollback via Vercel |
| 09-11 | `b0cc516` | URL Inspection + sitemap health. Sitemap found stale for 214 days, resubmitted. |
| 09-11 | `32f1e10` | Best-practice optimiser (opportunities, not defects) |
| 09-11 | `277c953` | JSON-LD entity graph with `@id`s, `llms.txt`, stale claims removed |
| 09-11 | `707552b`, `48f25d5`, `cafc2dd` | Merged. Fixed a stale `NewsArticle` check and 4 over-long titles found live. 0 findings post-deploy. |
| 09-11 | `1db563f` | Authority levels, guardrail tripwire, `docs/seo-system.md` |
| 09-12 | `42b5d67` … `579f971` | Image weight audit found a 94 MB `/archive`. All covers moved to `next/image`. |
| 09-12 | `01cd5bb` | "Audit the auditor": shared `seo/shared/` modules, contract tests |
| 09-12 | `5b9525c` | Repair spend caps, model dropped to Sonnet |
| 09-12 | `47f9e33` | Weekly pass scheduled (indexing, link graph, assets) |
| 09-13 | `4b744fd` | Alert sender was reporting success when Resend rejected the email |
| 09-13 | `0a50694` | Weekly summary email every Sunday; SEO scripts type-checked in `npm test` |

---

## Direction

### D1. An autonomous system, built in stages, not a one-off audit
**Decided:** a system that runs on a schedule, finds problems, fixes what it
safely can, verifies the fix, and only involves the owner when something
genuinely breaks. It should improve SEO from (1) general best practice,
(2) Search Console feedback and, later, (3) click/traffic outcomes. GEO/AEO
is in scope.
**Why:** the owner's explicit goal. It's a pet project, so experimenting and
giving agents real authority is acceptable, as long as guardrails stop them
doing serious damage.
**Rejected:** the first plan (an LLM rewriting meta descriptions into digest
JSON as a step in the weekly pipeline). It optimised the wrong thing, as D2 found.

### D2. Demand, not optimisation, is the bottleneck, so don't over-build optimisation
**Decided:** the stage-1 technical work was completed, but the optimiser agent
and measurement loop are deferred.
**Why:** Search Console showed 177 impressions and 3 clicks per 28 days, with
only two queries above the privacy threshold, both branded. Positions are fine
where pages match anything. Weekly archive pages have almost no search demand.
Optimising titles for queries nobody types moves nothing.
**Revisit:** when non-branded queries appear, or at ~5,000 impressions/month.

### D3. The site's reliability counts as part of SEO
**Decided:** keep the breakage monitor, repair and rollback alongside the SEO
optimisation work.
**Why:** the owner noticed most scenarios were "site is broken", not "SEO
could be better", and asked whether focus had drifted. Answer: a de-indexed
or down site loses all search traffic at once, which outweighs any
optimisation. Kept the best reliability elements, re-centred on SEO signals.

---

## How it runs

### D4. Separate SEO workflows, not a step in the digest pipeline
**Decided:** `seo-monitor.yml` (daily 07:00 UTC) and `seo-weekly.yml` (Sunday
08:00 UTC), independent of `weekly-digest.yml`.
**Why:** an SEO failure must never be able to block or break a content build,
and the cadences differ. The monitor needs to be daily; URL Inspection
(53 calls) and link crawls are too slow and quota-bound for that.
**Rejected:** the originally-agreed "pipeline step + weekly cron".

### D5. Three cadences with different jobs
| Cadence | Asks | Why separate |
|---|---|---|
| Daily monitor | Is anything broken right now? | Must stay fast and narrow so alerts stay trustworthy |
| Weekly pass | What does Google say, what could be better? | Slow, quota-bound |
| On demand (`seo:audit`) | Quick check while working | — |

### D6. Deterministic code for facts, an LLM only for judgement
**Decided:** every check, severity, score, fetch and file write is plain
TypeScript. The LLM appears only in `seo/repair/`, where it reads a defect and
writes a fix.
**Why:** severity and scoring must be reproducible or week-over-week deltas
mean nothing. Deterministic checks are also free and fast.

### D7. Severity carries meaning
**Decided:** `critical`/`high` = the site is **wrong** (alert, repair). `medium`
and below = could be **better** (report only).
**Why:** mixing them either floods the alert channel or lets breakage through
unnoticed. When adding a check, ask "is the site currently incorrect?", not
"how annoying is this?".

### D8. Score by severity band, never report unchecked as clean
**Decided:** the worst severity present sets the score's band, and volume
positions it within the band. A category nobody audited is `null`, not 100.
**Why:** a count-based score rated one critical finding 94/100 and 37 cosmetic
ones 39/100: backwards. Unchecked scoring 100 would present "didn't look" as
"all fine".
**Known consequence:** the weekly score reads 25 purely because of Google
indexing findings, so the weekly email leads with three plain numbers instead
(D17).

---

## Search Console

### D9. Service account, URL-prefix property, read and write clients split
**Decided:** a service account with access to the property
`https://luxury-intel.com/` (URL-prefix, trailing slash). `webmasters.readonly`
for everything; a separate client with `webmasters` scope used only to submit
the sitemap.
**Why:** `sc-domain:` was tried first and was the wrong property type. Keeping
write scope in its own client means read paths can't write by accident.
**Lesson:** Google's stored sitemap copy had been stale for 214 days (10 URLs).
One resubmit fixed it within seconds. The weekly job now flags a sitemap
unread for 30+ days.

### D10. What Google leaves out is not a defect
**Decided:** `PAGE_FETCH_STATE_UNSPECIFIED` means "never fetched", not
"fetch failed". Canonicals are compared after normalising trailing slashes.
`alt=""` is correct for decorative images.
**Why:** each shipped once as a false positive (up to 40 at a time).

---

## Agents and safety

### D11. Authority levels, set by a repo variable
**Decided:** `SEO_AGENT_AUTHORITY` = `observe` → `propose` (repair opens PRs)
→ `recover` (+ rollback) → `autonomy` (+ merge own PRs, revert commits). Set
to **`recover`** on 2026-09-11. Anything unrecognised resolves to `observe`.
**Why:** revoking authority should not need a code change or deploy. Levels
are ordered by how hard each action is to undo.
**Note:** the `autonomy` merge grant is not implemented yet (see status doc).

### D12. Guardrails are separate from authority and hold at every level
**Decided:** at every level, agents are denied credentials (`.env*`), the
database, payments, CI (`.github/`), everything that defines URLs
(`next.config.ts`, `weekSlug.ts`, `middleware.ts`), `package.json`,
published digests, and the policy file itself. No `rm`, `git push/reset/checkout/rebase`,
`gh pr merge`, or network tools. `assertGuardrails()` throws if these lists
have been weakened.
**Why:** the owner wants agents to have big authority "but not delete the
entire project". Authority widens what an agent may **decide**, never what it
may **reach**.

### D13. Repair: Claude Code headless, Sonnet, hard spend caps, six gates
**Decided:** the orchestrator spawns `claude -p` with an allow/deny tool list,
`--model sonnet`, `--max-budget-usd 2`. One repair per run, two attempts per
finding before the circuit breaker opens, $15 per rolling 30 days. The agent
never commits: six gates decide (permitted files, tsc, tests, build, finding
gone, no new findings) and the orchestrator ships a PR.
**Why:**
- Claude Code gives the agent real file tools behind a CLI-enforced permission
  list, instead of building a tool loop by hand. It needs an Anthropic key.
  The existing OpenAI key can't be reused.
- Sonnet, not the most capable model, at the owner's request. The fixes are
  small and the gates are the quality control.
- The per-run cap is enforced by the CLI, so it holds even if this repo's code
  has a bug.
- The re-audit runs in a subprocess because Node's module cache would
  otherwise audit the pre-edit code.

**Known gap:** not operational in CI yet (see status doc).

### D14. Recovery automates the reversal, never the repair
**Decided:** only when 3 of 8 sampled pages fail, and only after checking that
Vercel itself is up: roll back to the **immediately previous** deployment, if
it is healthy. `git revert` (never reset) of the bad commit only at `autonomy`.
Every outcome except "healthy" is emailed.
**Why:** a single 404 is often deliberate. Rolling back during a provider
outage fixes nothing and destroys evidence. Hobby can only roll back one
deployment, so aiming further back would just be refused.
**Consequence to remember (corrected 2026-09-21):** a rollback turns off
Vercel's auto-assignment of production domains, so **no push goes live**
until someone undoes the rollback (`vercel promote` or the dashboard button).
The original entry here said the next push would redeploy the bad commit;
Vercel's docs say otherwise. So recovery never undoes the freeze itself: that
would put the broken build back. It emails you instead, with the freeze called
out in the subject line.
**Not automated, deliberately:** DNS/registrar changes (untestable, 48h
propagation, would take down email and payments) and reconsideration requests.

---

## Reporting and email

### D15. Two emails, opposite rules
**Decided:** the daily alert emails **only** when a problem appears or clears.
The weekly summary emails **every** Sunday, even when all is clear.
**Why:** the owner's call: "weekly run should absolutely send me an email… I
can live without a daily, only if something is wrong". An alert that also says
"still fine" gets filtered. A weekly report that goes silent is
indistinguishable from a broken job.

### D16. Delivery is only "delivered" with a message id, and a failed send fails the job
**Decided:** both emails go through `seo/shared/email.ts`. Delivered = no error
**and** a Resend id. An undelivered weekly summary exits 2, failing the
workflow. An undelivered daily alert also leaves monitor state untouched, so the
next run retries.
**Why:** Resend resolves with `{ error }` instead of throwing. The first alert
sender logged success on rejection. The owner noticed no emails arrived, and
nothing had flagged it.
**Also:** `--test-alert` flag and a `test_alert` workflow input, because a
healthy site never alerts, so silence proves nothing.

### D17. The weekly email leads with three numbers, not the score
**Decided:** site health (`STATIC_*`/`LIVE_*`), Google indexes N of M (with
the weekly change), improvement ideas (`OPT_*`). Repeated findings collapse
to one line with a count.
**Why:** "25/100" for a spotless site that Google has partly not crawled is
alarming and doesn't describe anything fixable.

---

## Site changes made along the way

| Decision | Why |
|---|---|
| `/feedback` removed from the sitemap | It was `noindex` — telling Google two opposite things |
| `lib/seo/urlInventory.ts` is the only list of indexable URLs; `app/sitemap.ts` wraps it | The auditor and the sitemap cannot disagree |
| Digest titles use `title.absolute`: `{date range} · AI, Ecommerce & Luxury Intelligence` | Layout suffix was pushing titles past 60 chars. The auditor calls the same function (`renderedWeekTitle`). |
| `NewsArticle` + `ItemList` + `BreadcrumbList` on digests; `CollectionPage` on archives | Richer, more accurate types than `Article` |
| One `@id`-anchored entity graph (`#website`, `#organization`, `#editor`) | Answer engines must resolve who published a claim before citing it (GEO/AEO) |
| No `sameAs`, enforced by a test | No social profiles exist; fabricated structured data is worse than none |
| `/llms.txt` generated from data | Describes the publication for AI crawlers; edition count can't go stale |
| Covers via `next/image` (WebP/AVIF, `sizes`, `priority` on heroes) | 38 PNGs averaged 2.52 MB; `/archive` was ~94 MB. Card now ~20 KB. |
| Source favicons lazy-loaded | Third-party requests off the critical path |
| Category nav cards `h3` → `span` | They duplicated the `h2` section headings, causing an h1 → h3 skip on every digest page |

---

## Engineering hygiene

### D18. Fix the class of bug, not just the instance
Repeated mistakes in this build led to these rules:

- **One implementation per concern.** Five copies of `makeFinding` and three of
  the fetch helpers had already diverged. Now in `seo/shared/`.
- **Checks call the same function the page calls.** Twice, a page changed and
  its check didn't (title suffix, `Article` → `NewsArticle`). Contract tests
  now pin them together.
- **Prove a test can fail.** Break the guard, confirm the test goes red, then
  restore it. Three tests in this build were caught passing for the wrong reason.
- **Production means `CANONICAL_URL`, never `getSiteUrl()`.** The latter is
  localhost in dev. The first monitor run reported 52 false critical errors.
- **`scripts/` is outside the root tsconfig.** `tsconfig.seo.json` and
  `seo.typecheck.test.ts` cover it, after a broken string literal passed `tsc`.
- **CI owns `data/seo/monitor-state.json`.** Never commit a local copy; on a
  rebase conflict take CI's version.

### D19. Backlog, not now
Social-media ideas for SEO/GEO/AEO, Core Web Vitals field data, a schema depth
pass, the optimiser agent and the measurement loop are recorded in
[seo-backlog.md](seo-backlog.md), not built. The owner parked socials
explicitly. The rest waits on data (D2).
