# Documentation: map and maintenance rules

This repo is worked on by several AI agents (Claude Code, Codex, Cursor) across
many sessions, with no shared memory between them. **The repo is the only memory
they share.** If a fact about this project lives only in someone's chat history
or in one agent's private memory, the next agent will not know it.

Every agent that changes this repo follows the rules below.

---

## 1. Where each kind of knowledge goes

One fact, one home. Everywhere else links to it.

| Kind of knowledge | Home | Notes |
|---|---|---|
| Orientation: what the project is, commands, directory map, invariants that are easy to break | `CLAUDE.md` | Loaded into every Claude session. Keep it stable, no dated numbers, no changelog. Aim for under ~250 lines; link out for detail. |
| Pointer for non-Claude agents | `AGENTS.md` | Pointer to `CLAUDE.md` only. Never put content here. |
| How a subsystem works | `docs/<area>-system.md` or `docs/<area>.md` | Architecture plus a "Things that will bite you" list. |
| Current state of a subsystem: dated numbers, what is live and what is only built | `docs/<area>-status.md` | Every claim carries a date. Replace stale numbers, don't append. |
| Why a choice was made, what was rejected | `docs/<area>-decisions.md` | Check here before undoing something that looks odd. Owner decisions about the product go here too. |
| Deploy, CI, re-runs, incidents, platform limits | `docs/operations.md` | |
| Design of a feature before it is built | `docs/superpowers/specs/YYYY-MM-DD-<name>.md` | A frozen record. After shipping, add one `Status:` line at the top noting where the build differs from the spec. Don't rewrite it. |
| Work not done yet | One backlog per scope (see §4) | Mark `[DONE]` / `[DROPPED]` with the commit hash. Don't delete. |
| Finished one-off reports, investigations, superseded docs | `docs/archive/` | Never create new diagnostic `.md` files at the repo root. |
| Why a specific line of code is the way it is | A code comment next to it | |
| An invariant that must not break | A test, with the doc pointing at it | Docs drift; tests fail loudly. |
| Owner's personal preferences, open questions to the owner, session-to-session context | The agent's private memory (e.g. `~/.claude/.../memory/`) | **Never the only home of a fact about the code, the infra or a decision.** If you find one there, move it into the repo and reduce the memory to a pointer. |

The SEO docs (`seo-system` / `seo-status` / `seo-decisions` / `seo-backlog`)
are the model to copy when a new subsystem grows big enough to need more than a
section in `CLAUDE.md`.

## 2. When to update what (same commit as the code change)

| You changed… | Update |
|---|---|
| An npm script, top-level directory, env var, GitHub workflow or public route | `CLAUDE.md` (commands / directory table / env table) |
| A pipeline step: added, removed, reordered or made critical/non-critical | `docs/pipeline.md` and the data-flow block in `CLAUDE.md` |
| What a page emits (metadata, JSON-LD, sitemap, robots) | The SEO check that asserts it, and `docs/seo-system.md` if the rule changed |
| Deploy config, Vercel limits, CI behaviour | `docs/operations.md` |
| Shipped or dropped a backlog or roadmap item | Mark it `[DONE]` / `[DROPPED]` with the commit hash and a one-line note |
| The owner made a product or design decision | The relevant `*-decisions.md`, or the spec's `Status:` line |
| You lost an hour or more to something non-obvious | Add it to that area's "Things that will bite you" list |
| You measured something (traffic, costs, counts) | The area's `*-status.md`, dated. Never in `CLAUDE.md`. |

A docs-only change is a normal commit and gets pushed like any other.

## 3. How to write

- **Absolute dates** (`2026-10-05`), never "last week" or "recently".
- **Date every claim about state**: "As of 2026-10-04, repair can act in CI."
- **Replace, don't append.** When a fact changes, edit the old sentence. A doc
  that keeps both the old and the new version is worse than one that is a bit out of date.
- **Point at code by path** (`markets/brands.ts`), and at commits by short hash
  when the history matters.
- **Say what is not done.** "Built, not yet rehearsed end to end" is useful.
  "Done" when it isn't is harmful.
- **Write for an agent arriving cold**: state the trap, why it happens, and what
  to do instead.

## 4. Backlogs: which one is authoritative

| File | Scope | Tracked? |
|---|---|---|
| `luxury-intel-roadmap-2026-09.md` | Owner's product roadmap (F1.x–F3.x, N1–N5). Sets the order of work. | **Untracked on purpose.** Exists only in the owner's working copy, so don't assume other clones have it. |
| `IMPROVEMENTS.md` | General product, GEO and infrastructure ideas | Yes |
| `docs/improvement-plan.md` | Codebase-simplification and selection-quality phases | Yes |
| `docs/seo-backlog.md` | SEO system work | Yes |

When an item appears in more than one, the roadmap wins on priority and the
others should link to it instead of restating it.

## 5. Verify before you trust, fix when you find

Docs here are written by agents and do drift. Before acting on a doc claim that
matters (a command, a path, "X is disabled"), check it against the code.
If it's wrong:

- Small fix → correct it in the same task.
- Big rewrite needed → add a dated `> Stale as of YYYY-MM-DD: …` banner at the
  top saying what is wrong, and tell the owner.

When you finish a task, before committing, ask: *would the next agent hit the
same thing I just hit?* If yes, write it down in its home from §1.

## 6. How this is enforced

Rules alone drift, so the checkable parts are checked by `scripts/checkDocs.mjs`
(`npm run docs:check`). It runs in three places:

| Where | When | Effect |
|---|---|---|
| `.githooks/commit-msg` | Every local commit, by any agent or human (installed by `npm install` via the `prepare` script) | Blocks the commit |
| `.github/workflows/docs-check.yml` | Every push to `main` and every PR | Red ✗ on the commit and a GitHub email. Doesn't stop the Vercel deploy |
| `npm test` (`__tests__/docs.check.test.ts`) | Whenever tests run | Test failure |

**What it checks (fails):** every env var used in code is documented; every
npm script, top-level directory, app route, API route, DB table and workflow is
mentioned in the docs; every `.md` file is in the doc map below; every
repo-rooted path cited in the core docs exists.

**Co-change rule (commit hook only):** a commit that touches an area with a
home doc must also touch that doc, or carry a trailer explaining why not:

```
Docs-Skip: prompt wording tweak, no documented behaviour changed
```

| Code touched | Home doc(s), any one satisfies the rule |
|---|---|
| `pipeline/` | `docs/pipeline.md` |
| `ingestion/`, `discovery/`, `classification/`, `digest/`, `scoring/`, `podcast/`, `email/` | `docs/pipeline.md`, `RANKING_METHODOLOGY.md`, `DISCOVERY_USAGE.md`, `docs/PAYWALL_AWARE_SELECTION.md` |
| `.github/workflows/`, `next.config.ts` | `docs/operations.md` |
| `seo/`, `lib/seo/` | any `docs/seo-*.md` |
| `markets/`, `lib/markets/` | `CLAUDE.md` or the markets spec |
| `video-short/src/`, `video-short/template/` | `video-short/README.md` |
| `lib/db/schema.ts`, `middleware.ts`, `lib/env.ts` | `CLAUDE.md` |

The trailer is the escape hatch, and it's meant to make "no doc needed" a
decision someone wrote down, not something nobody thought about. Don't write a
reason that isn't true.

**Warns:** a doc whose "Checked" date in the map is over 120 days old.

**Not checkable:** whether what a doc *says* is still true. That depends on
agents following §5. When the checker fails on something you didn't cause,
fix it anyway: it means an earlier commit skipped the hook. **Never commit with
`--no-verify`** to get past it.

When you add a new subsystem with its own home doc, add a row to the
`CO_CHANGE` table in `scripts/checkDocs.mjs` and to the table above.

---

## Doc map

Status: **current** = maintained, trust it but verify; **reference** = accurate
in substance when last checked, details may lag; **historical** = context only,
don't act on it.

"Checked" = the last date someone verified the doc against the code. Update it
when you verify or rewrite a doc.

| Doc | Purpose | Status | Checked |
|---|---|---|---|
| `CLAUDE.md` | Orientation for every agent | current | 2026-10-05 |
| `docs/README.md` | This file: doc rules and map | current | 2026-10-05 |
| `docs/operations.md` | Deploy, CI, re-runs, platform limits | current | 2026-10-05 |
| `docs/pipeline.md` | Weekly pipeline modules, artifacts, caches, change recipes | reference (markets step 9, editorial take and podcast feed not covered) | 2026-10-05 |
| `docs/automation.md` | GitHub Actions setup and secrets | reference | 2026-09-13 |
| `docs/seo-system.md` | SEO system architecture, read first for SEO | current | 2026-10-04 |
| `docs/seo-status.md` | SEO dated state, resume checklist | current | 2026-10-04 |
| `docs/seo-decisions.md` | SEO design reasoning | current | 2026-09-21 |
| `docs/seo-backlog.md` | SEO remaining work | current | 2026-10-04 |
| `docs/superpowers/specs/2026-10-04-markets-pages-design.md` | Markets pages design | current | 2026-10-04 |
| `docs/improvement-plan.md` | Simplification / selection / cover-image phases | reference (Area 1 Phase 1 done; Phase 2 not started as of 2026-10-05) | 2026-10-05 |
| `docs/analytics/measurement-plan.md` | Analytics events and attribution | reference | — |
| `docs/PAYWALL_AWARE_SELECTION.md` | Paywall detection in selection | reference | 2026-01-18 |
| `docs/PODCAST_SCRIPT_LENGTH_IMPROVEMENTS.md` | Jan 2026 problem analysis for podcast length | historical | 2026-01-18 |
| `RANKING_METHODOLOGY.md` | Selection and rerank method | reference (predates F1.4 model change and F2.x) | 2026-01-27 |
| `DISCOVERY_USAGE.md` | Web discovery (Tavily) usage | reference | 2026-01-12 |
| `SEO_METADATA.md`, `SEO_ROUTES.md` | Per-file SEO metadata and routes | current | 2026-09-09 |
| `IMPROVEMENTS.md` | Product / GEO / infra backlog | current | 2026-09-18 |
| `video-short/README.md` | Weekly 60s short video tool | current | 2026-10-05 |
| `assets/audio/README.md` | Podcast source audio | reference | — |
| `tools/ffmpeg/README.md` | Bundled FFmpeg | reference | — |
| `docs/archive/*` | Finished one-off reports | historical | — |

Generated reports under `data/` (e.g. `data/seo/weekly-*.md`) are pipeline
output, not docs, and aren't listed here.
