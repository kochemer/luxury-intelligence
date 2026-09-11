/**
 * The verification gauntlet.
 *
 * This is what makes unattended repair trustworthy rather than reckless. A fix
 * ships only if every gate passes; any failure discards the work entirely.
 *
 * The gates, in order of how cheaply they fail:
 *   1. Only permitted files were touched   (cheapest, and a policy breach)
 *   2. TypeScript compiles
 *   3. Tests pass
 *   4. Production build succeeds
 *   5. The finding that triggered the repair is actually gone
 *   6. No NEW findings were introduced
 *
 * Gate 6 matters as much as gate 5: a "fix" that resolves one problem while
 * quietly creating two others is worse than the original defect, and is
 * exactly the failure mode an eager agent produces.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { isPathAllowed } from './policy';
import type { Finding } from '../types';

const exec = promisify(execFile);

export interface Gate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerificationResult {
  passed: boolean;
  gates: Gate[];
  /** Findings that exist now but did not before the repair. */
  newFindings: Finding[];
}

async function run(command: string, args: string[], timeoutMs = 300_000): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await exec(command, args, {
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
    return { ok: true, output: `${stdout}\n${stderr}`.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`.trim() };
  }
}

/** Untracked files present right now, as a set of repo-relative paths. */
export async function snapshotUntracked(): Promise<Set<string>> {
  const { ok, output } = await run('git', ['ls-files', '--others', '--exclude-standard']);
  if (!ok) return new Set();
  return new Set(output.split('\n').map(l => l.trim()).filter(Boolean));
}

/**
 * Everything the agent touched: tracked modifications plus files it newly
 * created.
 *
 * `git diff` alone is not enough — it only reports tracked files, so a brand
 * new file written outside the allowlist would slip past the policy gate
 * entirely. Newly-untracked files are diffed against a snapshot taken before
 * the agent ran, so pre-existing clutter in the working directory is ignored
 * while anything the agent added is caught.
 */
export async function getChangedFiles(baseRef: string, untrackedBefore?: Set<string>): Promise<string[]> {
  const tracked = await run('git', ['diff', '--name-only', baseRef]);
  const files = tracked.ok
    ? tracked.output.split('\n').map(l => l.trim()).filter(Boolean)
    : [];

  if (untrackedBefore) {
    const now = await snapshotUntracked();
    for (const file of now) {
      if (!untrackedBefore.has(file)) files.push(file);
    }
  }

  return [...new Set(files)];
}

function summarise(output: string, lines = 12): string {
  const trimmed = output.split('\n').filter(Boolean);
  return trimmed.slice(-lines).join('\n');
}

export async function verifyRepair(
  finding: Finding,
  baseRef: string,
  baselineFindingIds: Set<string>,
  baseUrl: string,
  untrackedBefore?: Set<string>
): Promise<VerificationResult> {
  const gates: Gate[] = [];
  let newFindings: Finding[] = [];

  // ── Gate 1: only permitted files touched ────────────────────────────────
  const changed = await getChangedFiles(baseRef, untrackedBefore);
  const illegal = changed.filter(f => !isPathAllowed(f));

  gates.push({
    name: 'Permitted files only',
    passed: changed.length > 0 && illegal.length === 0,
    detail: changed.length === 0
      ? 'No files were changed — the agent produced no fix.'
      : illegal.length > 0
        ? `Wrote to forbidden path(s): ${illegal.join(', ')}`
        : `Changed: ${changed.join(', ')}`,
  });
  if (!gates[0]!.passed) return { passed: false, gates, newFindings };

  // ── Gate 2: typecheck ───────────────────────────────────────────────────
  const tsc = await run('npx', ['tsc', '--noEmit']);
  gates.push({
    name: 'TypeScript compiles',
    passed: tsc.ok,
    detail: tsc.ok ? 'No type errors.' : summarise(tsc.output),
  });
  if (!tsc.ok) return { passed: false, gates, newFindings };

  // ── Gate 3: tests ───────────────────────────────────────────────────────
  const tests = await run('npm', ['test']);
  gates.push({
    name: 'Tests pass',
    passed: tests.ok,
    detail: tests.ok ? 'All tests pass.' : summarise(tests.output),
  });
  if (!tests.ok) return { passed: false, gates, newFindings };

  // ── Gate 4: production build ────────────────────────────────────────────
  const build = await run('npm', ['run', 'build'], 600_000);
  gates.push({
    name: 'Production build succeeds',
    passed: build.ok,
    detail: build.ok ? 'Build compiled.' : summarise(build.output),
  });
  if (!build.ok) return { passed: false, gates, newFindings };

  // ── Gates 5 & 6: the finding is gone, and nothing new appeared ──────────
  //
  // The re-audit runs in a SUBPROCESS, not in this one. Node caches modules,
  // and this process imported the audit code before the agent edited it — an
  // in-process re-audit would keep running the pre-repair code and could never
  // observe the fix. A fresh process re-imports from disk.
  //
  // Static audit only: the live audit reads the deployed site, which does not
  // yet contain this fix. Live re-verification happens after merge and deploy,
  // via the daily monitor.
  const audit = await run('npx', ['tsx', 'scripts/auditJson.ts', `--baseUrl=${baseUrl}`]);

  let afterIds = new Set<string>();
  let afterFindings: { id: string; code: string; severity: string; url: string | null }[] = [];
  try {
    const parsed = JSON.parse(audit.output.slice(audit.output.indexOf('{'))) as {
      findings: typeof afterFindings;
    };
    afterFindings = parsed.findings;
    afterIds = new Set(afterFindings.map(f => f.id));
  } catch {
    gates.push({
      name: 'Re-audit completed',
      passed: false,
      detail: `Could not re-audit after the change: ${summarise(audit.output)}`,
    });
    return { passed: false, gates, newFindings };
  }

  const staticallyCheckable = finding.code.startsWith('STATIC_');
  gates.push({
    name: 'Original finding resolved',
    passed: staticallyCheckable ? !afterIds.has(finding.id) : true,
    detail: staticallyCheckable
      ? (afterIds.has(finding.id)
          ? 'The finding is still present after the change.'
          : 'The finding no longer appears.')
      : 'Live finding — re-verified after deploy by the daily monitor, not here.',
  });

  const introduced = afterFindings.filter(f => !baselineFindingIds.has(f.id));
  newFindings = introduced as unknown as Finding[];
  gates.push({
    name: 'No new problems introduced',
    passed: introduced.length === 0,
    detail: introduced.length === 0
      ? 'No new findings.'
      : `Introduced ${introduced.length}: ${[...new Set(introduced.map(f => f.code))].join(', ')}`,
  });

  return { passed: gates.every(g => g.passed), gates, newFindings };
}
