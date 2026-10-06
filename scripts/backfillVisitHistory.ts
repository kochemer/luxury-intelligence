/**
 * One-off: copy Amplitude's daily visit history into visit_history, so the
 * /analytics page shows one continuous series across the switch to the
 * cookieless counter.
 *
 * Until the consent change (2026-10-05, ~07:15 UTC) Amplitude's session
 * tracking saw every visitor, so its bot-filtered daily people are comparable
 * with the counter's daily visitors. After that it only sees people who accept
 * cookies, so history stops at HISTORY_END. The counter recorded no human
 * visit on 5 Oct before Amplitude's last ones, so that day isn't double
 * counted.
 *
 * Idempotent: replaces the whole range each run. Run in CI (the
 * backfill-visit-history workflow) or locally:
 *   npx tsx scripts/backfillVisitHistory.ts [--from=2026-03-01]
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { visitHistory } from '../lib/db/schema';
import { segmentDaily, HUMAN_FILTERS, classifyReferrer } from '../seo/analytics/visitors';
import { HISTORY_END, deviceFromAmplitude } from '../lib/analytics/visits';

type Row = { day: string; dim: string; value: string; n: number };

async function main() {
  const from = process.argv.find(a => a.startsWith('--from='))?.split('=')[1] ?? '2026-03-01';
  const window = { start: new Date(`${from}T00:00:00Z`), end: new Date(`${HISTORY_END}T00:00:00Z`) };
  console.log(`[backfill] Amplitude ${from} → ${HISTORY_END}`);

  const rows = new Map<string, Row>();
  const add = (day: string, dim: string, value: string, n: number) => {
    if (!n) return;
    const key = `${day}|${dim}|${value}`;
    const r = rows.get(key);
    if (r) r.n += n;
    else rows.set(key, { day, dim, value, n });
  };

  const human = await segmentDaily(window, { filters: HUMAN_FILTERS });
  if (!human) throw new Error('AMPLITUDE_SECRET_KEY is not set');
  const everyone = (await segmentDaily(window))!;
  human.days.forEach((day, i) => {
    const people = human.groups[0]?.values[i] ?? 0;
    add(day, 'visitors', '', people);
    add(day, 'bots', '', Math.max(0, (everyone.groups[0]?.values[i] ?? 0) - people));
  });

  // Page views only exist historically if Amplitude ever auto-captured them for everyone.
  try {
    const pv = (await segmentDaily(window, { eventType: '[Amplitude] Page Viewed', metric: 'totals', filters: HUMAN_FILTERS }))!;
    const total = pv.groups[0]?.values.reduce((s, v) => s + v, 0) ?? 0;
    console.log(`[backfill] [Amplitude] Page Viewed: ${total}`);
    pv.days.forEach((day, i) => add(day, 'pageviews', '', pv.groups[0]?.values[i] ?? 0));
  } catch (err) {
    console.log(`[backfill] No automatic page views in Amplitude (${(err as Error).message.slice(0, 80)}) — page views start with the counter.`);
  }

  const byReferrer = (await segmentDaily(window, { filters: HUMAN_FILTERS, groupBy: 'gp:referring_domain' }))!;
  for (const g of byReferrer.groups) {
    const channel = classifyReferrer(g.label);
    const domain = g.label.replace(/^www\./, '');
    byReferrer.days.forEach((day, i) => {
      const n = g.values[i] ?? 0;
      add(day, 'channel', channel, n);
      if (channel !== 'Direct / email') add(day, 'referrer', domain, n);
    });
  }

  const byCountry = (await segmentDaily(window, { filters: HUMAN_FILTERS, groupBy: 'country' }))!;
  for (const g of byCountry.groups) {
    byCountry.days.forEach((day, i) => add(day, 'country', g.label && g.label !== '(none)' ? g.label : '??', g.values[i] ?? 0));
  }

  const byDevice = (await segmentDaily(window, { filters: HUMAN_FILTERS, groupBy: 'device_type' }))!;
  for (const g of byDevice.groups) {
    byDevice.days.forEach((day, i) => add(day, 'device', deviceFromAmplitude(g.label), g.values[i] ?? 0));
  }

  const all = [...rows.values()];
  const db = getDb();
  await db.execute(sql`delete from visit_history where day between ${from}::date and ${HISTORY_END}::date`);
  for (let i = 0; i < all.length; i += 500) {
    await db.insert(visitHistory).values(all.slice(i, i + 500));
  }

  const totals = new Map<string, number>();
  for (const r of all) totals.set(r.dim, (totals.get(r.dim) ?? 0) + r.n);
  console.log(`[backfill] wrote ${all.length} rows:`, Object.fromEntries(totals));
}

main().catch(err => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
