import { promises as fs } from 'fs';
import path from 'path';
import type { MarketData, MarketId } from './types';

/** The built data for one market, or null if the build hasn't run yet. */
export async function loadMarket(market: MarketId): Promise<MarketData | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'markets', `${market}.json`), 'utf-8');
    const data = JSON.parse(raw) as MarketData;
    // Version 1 files predate signals and attention; the page needs both.
    return data.version === 2 ? data : null;
  } catch {
    return null;
  }
}
