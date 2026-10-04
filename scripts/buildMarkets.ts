/**
 * Build the Markets pages' data (data/markets/{luxury,jewellery}.json).
 *
 * Usage:
 *   npm run markets:build
 *   npm run markets:build -- --market=jewellery
 *   npm run markets:build -- --skipNews        # own sources only
 */

import { loadEnv } from '../lib/env';
loadEnv();

import { buildMarkets } from '../markets/buildMarkets';
import { MARKET_IDS, type MarketId } from '../lib/markets/types';

async function main() {
  const args = process.argv.slice(2);
  const market = args.find(a => a.startsWith('--market='))?.split('=')[1] as MarketId | undefined;
  if (market && !MARKET_IDS.includes(market)) throw new Error(`Unknown market: ${market}`);

  const result = await buildMarkets({ markets: market ? [market] : undefined, skipNews: args.includes('--skipNews') });

  console.log(`\n[Markets] ✓ ${result.weekLabel} · ${result.llmCalls} LLM call(s)`);
  for (const m of result.markets) {
    console.log(`  ${m.market.padEnd(10)} ${m.mentions} mentions · ${m.moves} moves · summary ${m.summary ? 'yes' : 'NO'} · ` +
      `${m.prices} prices${m.stalePrices ? ` (${m.stalePrices} stale)` : ''}`);
  }
}

main().catch(err => {
  console.error('[Markets] ✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
