/**
 * Invokes Claude Code headlessly to attempt one repair.
 *
 * Uses the `claude -p` CLI as a subprocess rather than the Agent SDK, because
 * the same command works in both places this needs to run: locally against the
 * developer's existing subscription (no API key, no per-run cost), and in CI
 * with ANTHROPIC_API_KEY set. The SDK would require a key in both.
 *
 * The tool allow/deny lists come from policy.ts and are enforced by Claude Code
 * itself before the model acts. The prompt below explains intent; the flags are
 * what actually constrain it.
 */

import { spawn } from 'child_process';
import { buildAllowedTools, buildDisallowedTools } from './policy';
import type { Finding } from '../types';

export interface AgentRunResult {
  ok: boolean;
  output: string;
  error?: string;
}

/**
 * The repair brief.
 *
 * Findings are passed as structured fields rather than pasted page HTML. The
 * auditor reads live pages whose content originates from third-party RSS
 * feeds, so raw page text is untrusted input; keeping it out of the prompt
 * removes the obvious injection path. The tool policy would hold regardless,
 * but there's no reason to invite the attempt.
 */
export function buildRepairBrief(finding: Finding, baseUrl: string): string {
  return `You are repairing one specific SEO defect in this repository. Work only on this defect.

## The defect

- Code:        ${finding.code}
- Severity:    ${finding.severity}
- Page:        ${finding.url ?? '(site-wide)'}
- Summary:     ${finding.title}
- Detail:      ${finding.detail}
- Suggested:   ${finding.recommendation}
${finding.evidence ? `- Evidence:    ${JSON.stringify(finding.evidence)}` : ''}

## How this site works

The site is ${baseUrl}, a Next.js 16 App Router weekly digest.

- Every indexable URL comes from \`lib/seo/urlInventory.ts\`. \`app/sitemap.ts\` is a
  thin wrapper over it, so the sitemap is edited by editing the inventory.
- Page-level indexing signals (canonical, robots, metadata) live in each route's
  \`generateMetadata\` or exported \`metadata\`.
- \`app/robots.ts\` holds the disallow list and the AI-crawler allow block.
- Titles and descriptions for digest pages come from \`lib/seo/metaText.ts\`.
- The SEO checks that produced this finding live in \`seo/audit/\`.

## Rules

1. Fix the root cause, not the symptom. Removing a URL from the sitemap is a
   legitimate fix when the page genuinely should not be indexed; it is not a
   legitimate fix for a page that should be indexed but is misconfigured.
   Decide which case this is, and say why in your summary.
2. Change as little as possible. One defect, the smallest correct fix.
3. Add or update a test under \`__tests__/seo.*\` when the defect is one a test
   could have caught.
4. Leave a brief comment at the change site explaining why, when the reason is
   not obvious from the code.
5. Do not edit anything outside the SEO system and the files named above. Many
   paths are blocked outright; do not attempt to work around that.
6. Do not commit, push, or open a pull request. Leave the working tree dirty —
   the orchestrator verifies and ships.

## Verifying your work

Run \`npx tsc --noEmit\` and \`npm test\`. Both must pass. Your change will then be
put through a build and a re-audit; if it introduces any new problem it is
discarded entirely, so prefer a conservative fix.

If you conclude this defect cannot be safely repaired by editing code — for
example because it needs a human decision about whether a page should exist —
make no changes and explain why. That is a valid and useful outcome.

## Report back

End with a short summary: what was wrong, what you changed, and why that is the
root cause rather than the symptom.`;
}

export async function runRepairAgent(
  finding: Finding,
  baseUrl: string,
  timeoutMs = 600_000
): Promise<AgentRunResult> {
  const args = [
    '-p', buildRepairBrief(finding, baseUrl),
    '--permission-mode', 'acceptEdits',
    '--allowedTools', buildAllowedTools().join(','),
    '--disallowedTools', buildDisallowedTools().join(','),
    '--output-format', 'text',
  ];

  return new Promise<AgentRunResult>((resolve) => {
    const child = spawn('claude', args, {
      cwd: process.cwd(),
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({ ok: false, output: stdout, error: `Agent timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        output: stdout,
        error: `Could not start the claude CLI: ${err.message}. Is Claude Code installed and on PATH?`,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        output: stdout.trim(),
        error: code === 0 ? undefined : `claude exited with code ${code}: ${stderr.trim()}`,
      });
    });
  });
}
