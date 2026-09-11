/**
 * Automated recovery: detect an outage, roll production back, verify.
 *
 * The governing principle is that for infrastructure you automate the
 * *reversal*, not the repair. A code fix can be tested before it ships and
 * undone after; a live site cannot. So this never invents a fix — it returns
 * production to the last deployment that demonstrably worked, then hands over
 * to a human.
 *
 * The bar for acting is deliberately high. A single 404 is not an outage (a
 * page may have been removed on purpose); the site being broadly unreachable
 * is. Rolling back on a false positive would itself cause the outage it is
 * meant to prevent.
 */

import {
  findRollbackTarget,
  rollbackTo,
  checkVercelStatus,
  isAuthenticated,
  type Deployment,
} from './vercel';
import {
  OUTAGE_MIN_FAILED_PAGES,
  OUTAGE_SAMPLE_SIZE,
  RECOVERY_SETTLE_MS,
} from '../config';
import { getIndexableUrls } from '@/lib/seo/urlInventory';

export type RecoveryStatus =
  | 'healthy'            // nothing wrong
  | 'rolled-back'        // outage found, reverted, site recovered
  | 'rollback-failed'    // reverted, but the site is still down
  | 'no-target'          // outage found, but nothing safe to roll back to
  | 'provider-outage'    // Vercel itself is down — a rollback would not help
  | 'not-authenticated'; // cannot act

export interface RecoveryResult {
  status: RecoveryStatus;
  checkedAtISO: string;
  detail: string;
  failedUrls: string[];
  sampledUrls: number;
  rolledBackTo?: Deployment;
  /** Plain-language next step for a human. */
  recommendation: string;
}

interface ProbeResult { url: string; ok: boolean; status: number }

async function probe(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'LuxuryIntelRecovery/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    return { url, ok: res.status === 200, status: res.status };
  } catch {
    return { url, ok: false, status: 0 };
  }
}

/**
 * Sample the site rather than crawling all of it: recovery must be fast, and
 * a systemic outage shows up in any handful of pages. The homepage is always
 * included because it failing is the strongest single signal.
 */
async function sampleSite(baseUrl: string): Promise<ProbeResult[]> {
  const entries = await getIndexableUrls(baseUrl);
  const urls = [baseUrl, ...entries.map(e => e.url).filter(u => u !== baseUrl).slice(0, OUTAGE_SAMPLE_SIZE - 1)];
  return Promise.all(urls.map(probe));
}

export async function runRecovery(baseUrl: string, act: boolean): Promise<RecoveryResult> {
  const checkedAtISO = new Date().toISOString();

  const probes = await sampleSite(baseUrl);
  const failed = probes.filter(p => !p.ok);
  const failedUrls = failed.map(p => `${p.url} (${p.status || 'unreachable'})`);

  const base = {
    checkedAtISO,
    failedUrls,
    sampledUrls: probes.length,
  };

  if (failed.length < OUTAGE_MIN_FAILED_PAGES) {
    return {
      ...base,
      status: 'healthy',
      detail: failed.length === 0
        ? `All ${probes.length} sampled pages returned 200.`
        : `${failed.length} of ${probes.length} sampled pages failed — below the ${OUTAGE_MIN_FAILED_PAGES}-page threshold for an outage. A single broken page is not a reason to roll production back.`,
      recommendation: failed.length === 0
        ? 'No action needed.'
        : 'Investigate the individual page; this is not a site-wide outage.',
    };
  }

  // Is it them or us? Rolling back during a provider outage changes nothing
  // and destroys the evidence of what was actually deployed.
  const vercelStatus = await checkVercelStatus();
  if (!vercelStatus.operational) {
    return {
      ...base,
      status: 'provider-outage',
      detail: `${failed.length}/${probes.length} pages failing, but Vercel reports: ${vercelStatus.detail}`,
      recommendation:
        'This is a Vercel incident, not your deployment. A rollback would not help. ' +
        'Track it at https://www.vercel-status.com and wait.',
    };
  }

  if (!(await isAuthenticated())) {
    return {
      ...base,
      status: 'not-authenticated',
      detail: `${failed.length}/${probes.length} pages failing, but the Vercel CLI has no credentials.`,
      recommendation: 'Run `vercel login`, or set VERCEL_TOKEN, so recovery can act.',
    };
  }

  const target = await findRollbackTarget();
  if (!target) {
    return {
      ...base,
      status: 'no-target',
      detail: `${failed.length}/${probes.length} pages failing, but no earlier healthy production deployment was found.`,
      recommendation:
        'Nothing safe to roll back to — rolling back to a failed deployment would just move the outage. ' +
        'Investigate the deployment manually.',
    };
  }

  if (!act) {
    return {
      ...base,
      status: 'no-target',
      detail: `${failed.length}/${probes.length} pages failing. Would roll back to ${target.url} (${target.age} old), but --act was not set.`,
      recommendation: `Re-run with --act to perform the rollback, or do it manually: vercel rollback ${target.url} --yes`,
    };
  }

  const result = await rollbackTo(target);
  if (!result.ok) {
    return {
      ...base,
      status: 'rollback-failed',
      detail: `Rollback to ${target.url} failed: ${result.output.split('\n').slice(-3).join(' ')}`,
      rolledBackTo: target,
      recommendation: 'The rollback command itself failed. Intervene manually — the site is still down.',
    };
  }

  // Give the change time to propagate before judging whether it worked.
  await new Promise(resolve => setTimeout(resolve, RECOVERY_SETTLE_MS));

  const after = await sampleSite(baseUrl);
  const stillFailing = after.filter(p => !p.ok);

  if (stillFailing.length >= OUTAGE_MIN_FAILED_PAGES) {
    return {
      ...base,
      status: 'rollback-failed',
      detail: `Rolled back to ${target.url}, but ${stillFailing.length}/${after.length} pages are still failing.`,
      rolledBackTo: target,
      recommendation:
        'The previous deployment is not the cause. This is likely DNS, the domain, or the provider — ' +
        'not your code. Do not roll back further; investigate directly.',
    };
  }

  return {
    ...base,
    status: 'rolled-back',
    detail: `Production was failing on ${failed.length}/${probes.length} sampled pages. ` +
            `Rolled back to ${target.url} (${target.age} old). The site now responds normally.`,
    rolledBackTo: target,
    recommendation:
      'The site is back up on the previous deployment. The deployment that broke it has NOT been fixed — ' +
      'find out what shipped and correct it before deploying again.',
  };
}
