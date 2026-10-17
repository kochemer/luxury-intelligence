/**
 * Weekly "Historical insights" agent for the private /analytics page.
 *
 * Builds a pack of aggregate facts (Amplitude history, the visit counter,
 * Search Console, subscribers), asks Claude whether one durable new tile is
 * worth adding, runs the proposal through the automated checks, and stores it
 * only if every check passes. No human reviews the result, so "no change" is a
 * normal outcome and is logged, not treated as a failure.
 *
 * Usage:
 *   npm run analytics:insights                    # decide, check, write
 *   npm run analytics:insights -- --dry-run       # decide and check; write nothing
 *   npm run analytics:insights -- --print-pack    # print the pack as JSON (stdout) and exit
 *   npm run analytics:insights -- --seed file.json [--dry-run]
 *       # a JSON array of proposals ({ eyebrow, hero, unit, summary, detail, chart?, evidence })
 *       # checked against a fresh pack and stored with added_by 'seed'
 *
 * Exit codes: 0 for a change, no change, or a failed check (the reason is
 * logged); 1 for an API, database or setup error. Logs go to stderr so
 * --print-pack output stays clean JSON.
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { readFileSync } from 'node:fs';
import { buildDataPack } from '../lib/analytics/insights/facts';
import { checkProposal } from '../lib/analytics/insights/checks';
import { insertInsight, listActiveRecords, listRemovedInsights } from '../lib/analytics/insights/store';
import { insightsModel, runAgent } from '../lib/analytics/insights/agent';
import type { DataPack, Proposal } from '../lib/analytics/insights/types';

const log = (msg: string) => console.error(`[insights] ${msg}`);

function parseArgs() {
  const args = process.argv.slice(2);
  const seedAt = args.indexOf('--seed');
  return {
    dryRun: args.includes('--dry-run'),
    printPack: args.includes('--print-pack'),
    seedFile: seedAt >= 0 ? args[seedAt + 1] : undefined,
    wantsSeed: seedAt >= 0,
  };
}

async function pack(): Promise<DataPack> {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now();
  const p = await buildDataPack(today);
  log(`pack: ${p.facts.length} facts, ${p.series.length} series, ${p.failedBlocks.length} failed blocks, ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const f of p.failedBlocks) log(`  failed: ${f}`);
  if (p.facts.length === 0) throw new Error('the data pack is empty, every block failed');
  return p;
}

async function seed(file: string, dryRun: boolean) {
  const proposals = JSON.parse(readFileSync(file, 'utf8')) as Proposal[];
  if (!Array.isArray(proposals)) throw new Error('the seed file must be a JSON array of proposals');
  const p = await pack();
  const removed = await listRemovedInsights();
  let active = await listActiveRecords();
  let added = 0, failed = 0;
  for (const [i, proposal] of proposals.entries()) {
    const label = `seed ${i + 1}/${proposals.length} "${String(proposal?.eyebrow ?? '').slice(0, 40)}"`;
    const result = checkProposal(proposal, p, active, removed);
    if (!result.ok) {
      failed++;
      log(`${label} FAILED:`);
      for (const f of result.failures) log(`  - ${f}`);
      continue;
    }
    if (dryRun) { log(`${label} passes (dry run, not stored)`); added++; continue; }
    const id = await insertInsight(result.insight, 'seed', null);
    log(`${label} stored as #${id}`);
    added++;
    active = await listActiveRecords();   // later seeds are checked against this one too
  }
  log(`seed done: ${added} ${dryRun ? 'would be ' : ''}stored, ${failed} failed`);
}

async function weekly(dryRun: boolean) {
  const [active, removed, p] = await Promise.all([listActiveRecords(), listRemovedInsights(), pack()]);
  log(`${active.length} active, ${removed.length} retired`);

  const { decision, model } = await runAgent(active, removed, p);
  log(`decision: ${decision.decision}. ${decision.reason}`);
  if (decision.decision === 'none' || !decision.insight) {
    log('no change');
    return;
  }

  const result = checkProposal({ ...decision.insight, retire: decision.retire }, p, active, removed);
  if (!result.ok) {
    log('the proposal failed its checks, nothing was written:');
    for (const f of result.failures) log(`  - ${f}`);
    return;
  }
  console.error(JSON.stringify({ tile: result.insight.tile, retire: result.insight.retire ?? null, sources: result.insight.sources }, null, 2));
  if (dryRun) { log('dry run: not written'); return; }
  const id = await insertInsight(result.insight, 'agent', model);
  log(`stored as #${id}${result.insight.retire != null ? `, retired #${result.insight.retire}` : ''}`);
}

async function main() {
  const { dryRun, printPack, seedFile, wantsSeed } = parseArgs();
  if (printPack) {
    const p = await pack();
    process.stdout.write(JSON.stringify(p, null, 2) + '\n');
    return;
  }
  if (wantsSeed) {
    if (!seedFile) throw new Error('--seed needs a file path');
    await seed(seedFile, dryRun);
    return;
  }
  log(`model ${insightsModel()}${dryRun ? ' (dry run)' : ''}`);
  await weekly(dryRun);
}

main().catch(err => {
  console.error('[insights] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
