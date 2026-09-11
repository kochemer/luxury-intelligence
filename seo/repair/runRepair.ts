/**
 * Repair orchestrator: detect → attempt → verify → ship or discard.
 *
 * The agent never ships its own work. It edits files; this module decides
 * whether those edits survive. On any verification failure the branch is
 * discarded entirely and the working tree restored, so a failed repair leaves
 * no trace beyond a ledger entry.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { runRepairAgent } from './agent';
import { verifyRepair, getChangedFiles, type VerificationResult } from './verify';
import { readLedger, appendAttempt, isCircuitOpen, failureCount } from './ledger';
import { isRepairable, escalationReason, MAX_REPAIRS_PER_RUN, MAX_ATTEMPTS_PER_FINDING } from './policy';
import type { Finding } from '../types';

const exec = promisify(execFile);

async function git(args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout } = await exec('git', args, { maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, out: stdout.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`.trim() };
  }
}

export interface RepairOutcome {
  finding: Finding;
  status: 'shipped' | 'rejected' | 'agent-failed' | 'skipped';
  reason: string;
  branch?: string;
  prUrl?: string;
  verification?: VerificationResult;
  agentSummary?: string;
}

export interface RunRepairOptions {
  findings: Finding[];
  baseUrl: string;
  /** When false, verify everything but discard rather than opening a PR. */
  ship: boolean;
}

export interface RunRepairResult {
  attempted: RepairOutcome[];
  escalations: { finding: Finding; reason: string }[];
}

function branchName(finding: Finding): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = finding.code.toLowerCase().replace(/_/g, '-');
  return `seo/auto-${slug}-${stamp}-${finding.id.split(':')[1] ?? 'x'}`;
}

/** Restore the repo to a clean state on the original branch. */
async function abandon(originalBranch: string, branch: string): Promise<void> {
  await git(['reset', '--hard']);
  await git(['clean', '-fd']);
  await git(['checkout', originalBranch]);
  await git(['branch', '-D', branch]);
}

export async function runRepair(options: RunRepairOptions): Promise<RunRepairResult> {
  const { findings, baseUrl, ship } = options;

  const escalations: { finding: Finding; reason: string }[] = [];
  const attempted: RepairOutcome[] = [];

  // A dirty tree would make "what did the agent change?" unanswerable.
  const status = await git(['status', '--porcelain']);
  if (status.out.length > 0) {
    throw new Error(
      'Working tree is not clean. Repair needs a clean tree to attribute changes to the agent.\n' +
      status.out
    );
  }

  const originalBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out;
  const baseRef = (await git(['rev-parse', 'HEAD'])).out;
  const ledger = await readLedger();

  // Baseline: the findings that already exist, so gate 6 can tell "new" from
  // "was already there".
  const baselineIds = new Set(findings.map(f => f.id));

  const queue: Finding[] = [];
  for (const finding of findings) {
    const escalate = escalationReason(finding.code);
    if (escalate) {
      escalations.push({ finding, reason: escalate });
      continue;
    }
    if (!isRepairable(finding.code)) {
      escalations.push({ finding, reason: `${finding.code} is not in the repairable set.` });
      continue;
    }
    if (isCircuitOpen(ledger, finding.id)) {
      escalations.push({
        finding,
        reason: `Circuit breaker: ${failureCount(ledger, finding.id)} failed repair attempt(s), ` +
                `at the limit of ${MAX_ATTEMPTS_PER_FINDING}. Needs a human.`,
      });
      continue;
    }
    queue.push(finding);
  }

  for (const finding of queue.slice(0, MAX_REPAIRS_PER_RUN)) {
    const branch = branchName(finding);
    console.log(`\n[Repair] ${finding.code} — ${finding.url ?? 'site-wide'}`);
    console.log(`[Repair] Branch: ${branch}`);

    const created = await git(['checkout', '-b', branch]);
    if (!created.ok) {
      attempted.push({ finding, status: 'agent-failed', reason: `Could not create branch: ${created.out}` });
      continue;
    }

    console.log('[Repair] Invoking agent...');
    const agentRun = await runRepairAgent(finding, baseUrl);

    if (!agentRun.ok) {
      await abandon(originalBranch, branch);
      const outcome: RepairOutcome = {
        finding, status: 'agent-failed',
        reason: agentRun.error ?? 'Agent failed.',
        agentSummary: agentRun.output.slice(-800),
      };
      attempted.push(outcome);
      await appendAttempt({
        findingId: finding.id, code: finding.code, url: finding.url,
        attemptedAtISO: new Date().toISOString(),
        outcome: 'agent-failed', detail: outcome.reason, branch,
      });
      continue;
    }

    const changed = await getChangedFiles(baseRef);
    if (changed.length === 0) {
      // A deliberate no-change outcome — the agent judged it unrepairable.
      await abandon(originalBranch, branch);
      const outcome: RepairOutcome = {
        finding, status: 'skipped',
        reason: 'Agent made no changes — it judged this not safely repairable in code.',
        agentSummary: agentRun.output.slice(-1200),
      };
      attempted.push(outcome);
      escalations.push({ finding, reason: outcome.reason });
      await appendAttempt({
        findingId: finding.id, code: finding.code, url: finding.url,
        attemptedAtISO: new Date().toISOString(),
        outcome: 'rejected', detail: outcome.reason, failedGate: 'no-change', branch,
      });
      continue;
    }

    console.log(`[Repair] Agent changed ${changed.length} file(s). Verifying...`);
    const verification = await verifyRepair(finding, baseRef, baselineIds, baseUrl);

    for (const gate of verification.gates) {
      console.log(`  ${gate.passed ? '✓' : '✗'} ${gate.name}: ${gate.detail.split('\n')[0]}`);
    }

    if (!verification.passed) {
      const failed = verification.gates.find(g => !g.passed);
      await abandon(originalBranch, branch);
      const outcome: RepairOutcome = {
        finding, status: 'rejected',
        reason: `Failed gate "${failed?.name}": ${failed?.detail}`,
        verification,
        agentSummary: agentRun.output.slice(-1200),
      };
      attempted.push(outcome);
      await appendAttempt({
        findingId: finding.id, code: finding.code, url: finding.url,
        attemptedAtISO: new Date().toISOString(),
        outcome: 'rejected', detail: outcome.reason,
        failedGate: failed?.name, branch, filesChanged: changed,
      });
      continue;
    }

    if (!ship) {
      console.log('[Repair] ✓ All gates passed — discarding (dry run, --ship not set).');
      await abandon(originalBranch, branch);
      attempted.push({
        finding, status: 'skipped',
        reason: 'Verified successfully but not shipped (dry run).',
        verification, agentSummary: agentRun.output.slice(-1200),
      });
      continue;
    }

    // ── Ship: commit, push, open a PR for review ─────────────────────────
    await git(['add', ...changed]);
    const commitMessage =
      `seo: auto-repair ${finding.code}\n\n${finding.title}\n\n` +
      `${finding.detail}\n\n` +
      `Verified: typecheck, tests, production build, and a re-audit showing no\n` +
      `new findings. Opened for review rather than merged.\n\n` +
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`;
    await git(['commit', '-m', commitMessage]);

    const pushed = await git(['push', '-u', 'origin', branch]);
    let prUrl: string | undefined;

    if (pushed.ok) {
      const body =
        `Automated repair of a defect found by the SEO monitor.\n\n` +
        `**Defect:** \`${finding.code}\` — ${finding.title}\n` +
        (finding.url ? `**Page:** ${finding.url}\n` : '') +
        `\n${finding.detail}\n\n` +
        `### Verification\n\n` +
        verification.gates.map(g => `- ${g.passed ? '✅' : '❌'} **${g.name}** — ${g.detail.split('\n')[0]}`).join('\n') +
        `\n\n### Files changed\n\n${changed.map(f => `- \`${f}\``).join('\n')}\n\n` +
        `### Agent summary\n\n${agentRun.output.slice(-1500)}\n\n` +
        `🤖 Generated with [Claude Code](https://claude.com/claude-code)`;

      try {
        const { stdout } = await exec('gh', [
          'pr', 'create',
          '--title', `seo: auto-repair ${finding.code}`,
          '--body', body,
        ], { maxBuffer: 4 * 1024 * 1024 });
        prUrl = stdout.trim().split('\n').pop();
      } catch (err) {
        console.warn('[Repair] ⚠ Branch pushed but PR creation failed:', (err as Error).message);
      }
    }

    await git(['checkout', originalBranch]);

    attempted.push({
      finding, status: 'shipped',
      reason: 'Verified and opened for review.',
      branch, prUrl, verification,
      agentSummary: agentRun.output.slice(-1200),
    });
    await appendAttempt({
      findingId: finding.id, code: finding.code, url: finding.url,
      attemptedAtISO: new Date().toISOString(),
      outcome: 'shipped', detail: 'Verified and opened for review.',
      branch, prUrl, filesChanged: changed,
    });
  }

  return { attempted, escalations };
}
