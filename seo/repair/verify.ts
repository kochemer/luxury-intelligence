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
import { runStaticAudit } from '../audit/staticAudit';
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

/** Files changed relative to the branch point. */
export async function getChangedFiles(baseRef: string): Promise<string[]> {
  const { ok, output } = await run('git', ['diff', '--name-only', baseRef]);
  if (!ok) return [];
  return output.split('\n').map(l => l.trim()).filter(Boolean);
}

function summarise(output: string, lines = 12): string {
  const trimmed = output.split('\n').filter(Boolean);
  return trimmed.slice(-lines).join('\n');
}

export async function verifyRepair(
  finding: Finding,
  baseRef: string,
  baselineFindingIds: Set<string>,
  baseUrl: string
): Promise<VerificationResult> {
  const gates: Gate[] = [];
  let newFindings: Finding[] = [];

  // ── Gate 1: only permitted files touched ────────────────────────────────
  const changed = await getChangedFiles(baseRef);
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
  // Static audit only: the live audit would still be reading the deployed
  // site, which does not yet contain this fix. Live re-verification happens
  // after the change is merged and deployed, via the daily monitor.
  const after = await runStaticAudit(baseUrl);
  const afterIds = new Set(after.findings.map(f => f.id));

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

  newFindings = after.findings.filter(f => !baselineFindingIds.has(f.id));
  gates.push({
    name: 'No new problems introduced',
    passed: newFindings.length === 0,
    detail: newFindings.length === 0
      ? 'No new findings.'
      : `Introduced ${newFindings.length}: ${newFindings.map(f => f.code).join(', ')}`,
  });

  return { passed: gates.every(g => g.passed), gates, newFindings };
}
