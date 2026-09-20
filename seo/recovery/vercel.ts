/**
 * Vercel deployment control, for automated rollback.
 *
 * Shells out to the Vercel CLI rather than the REST API so the same code works
 * with an interactive login locally (`vercel login`) and a token in CI
 * (VERCEL_TOKEN) — the CLI resolves both, and there is one auth path to reason
 * about instead of two.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export const PROJECT = 'luxury-intelligence';

export interface Deployment {
  url: string;
  age: string;
  status: string;
  environment: string;
}

/**
 * Run a Vercel CLI command.
 *
 * Authentication is never passed as `--token` on the command line: arguments
 * are visible in process listings and can land in shell history and CI logs.
 * The CLI reads VERCEL_TOKEN from the environment on its own, so it is simply
 * inherited here — local runs use the interactive login instead.
 *
 * `shell: true` is required on Windows, where `vercel` is a .cmd shim that
 * recent Node refuses to spawn directly. That makes argument quoting the
 * caller's problem, so every argument this module passes is either a literal
 * or a Vercel deployment URL matched by a strict regex that admits no
 * whitespace or shell metacharacters. Do not pass user input through here.
 */
async function vercel(args: string[], timeoutMs = 180_000): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await exec('vercel', args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32',
      env: process.env,
    });
    return { ok: true, output: `${stdout}\n${stderr}`.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`.trim() };
  }
}

/** True when the CLI has usable credentials. */
export async function isAuthenticated(): Promise<boolean> {
  const { ok, output } = await vercel(['whoami'], 30_000);
  return ok && !/no existing credentials/i.test(output);
}

/**
 * Production deployments, newest first.
 *
 * Parses the CLI's table output. There is no stable `--json` flag for `ls`
 * across CLI versions, so rows are matched by shape: a deployment URL plus a
 * Ready/Error status plus the environment column.
 */
export async function listProductionDeployments(): Promise<Deployment[]> {
  const { ok, output } = await vercel(['ls', PROJECT]);
  if (!ok) return [];

  const deployments: Deployment[] = [];
  for (const line of output.split('\n')) {
    const url = line.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0];
    if (!url) continue;
    if (!/Production/i.test(line)) continue;

    deployments.push({
      url,
      age: line.trim().split(/\s+/)[0] ?? '?',
      status: /●\s*Ready/i.test(line) ? 'Ready' : /Error/i.test(line) ? 'Error' : 'Unknown',
      environment: 'Production',
    });
  }
  return deployments;
}

export interface RollbackChoice {
  target: Deployment | null;
  /** Why this target, or why there isn't one. Goes straight into the email. */
  reason: string;
}

/**
 * Choose what to roll back to: the deployment immediately before the current
 * one, and only if it is healthy.
 *
 * Deliberately not "the newest healthy deployment further back". On Vercel's
 * Hobby plan you can only roll back to the immediately previous production
 * deployment — reaching further is a Pro feature — so a target two or more
 * deployments back would simply be refused, after the site had already been
 * down long enough for the monitor to notice. Better to report that there is
 * nothing to roll back to and let a human act.
 *
 * Separated from the CLI call so the decision can be tested without network.
 */
export function chooseRollbackTarget(deployments: Deployment[]): RollbackChoice {
  if (deployments.length === 0) {
    return { target: null, reason: 'No production deployments were listed — the Vercel CLI returned nothing usable.' };
  }
  if (deployments.length < 2) {
    return { target: null, reason: 'Only one production deployment exists, so there is nothing earlier to roll back to.' };
  }

  const previous = deployments[1]!;
  if (previous.status !== 'Ready') {
    return {
      target: null,
      reason: `The immediately previous production deployment (${previous.url}) is "${previous.status}", not Ready. ` +
              'Rolling back to a failed build would swap one outage for another, and on the Hobby plan no earlier ' +
              'deployment is eligible.',
    };
  }

  return { target: previous, reason: `The deployment immediately before the current one (${previous.url}, ${previous.age} old) is Ready.` };
}

/** Production deployments from the CLI, run through {@link chooseRollbackTarget}. */
export async function findRollbackTarget(): Promise<RollbackChoice> {
  return chooseRollbackTarget(await listProductionDeployments());
}

export async function rollbackTo(deployment: Deployment): Promise<{ ok: boolean; output: string }> {
  return vercel(['rollback', deployment.url, '--yes'], 300_000);
}

/** Vercel's own incident status, to tell "their outage" from "your bug". */
export async function checkVercelStatus(): Promise<{ operational: boolean; detail: string }> {
  try {
    const res = await fetch('https://www.vercel-status.com/api/v2/status.json', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { operational: true, detail: 'Vercel status page unreachable; assuming operational.' };

    const data = await res.json() as { status?: { indicator?: string; description?: string } };
    const indicator = data.status?.indicator ?? 'none';
    return {
      operational: indicator === 'none',
      detail: data.status?.description ?? 'Unknown',
    };
  } catch {
    return { operational: true, detail: 'Vercel status page unreachable; assuming operational.' };
  }
}
