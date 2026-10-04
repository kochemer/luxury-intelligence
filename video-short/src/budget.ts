/**
 * Weekly spend cap for the short video.
 *
 * Every paid call goes through `spend()`: it prices the call's WORST case
 * (max_tokens of output, every character of TTS) before sending, refuses if
 * that could push the week past the cap, then records the actual cost from
 * the provider's usage numbers. Re-runs of the same week share one ledger, so
 * retrying until something works can't quietly exceed the cap.
 *
 * The ledger lives in data/weeks/<week>/video-short/spend.json (gitignored).
 */
import { promises as fs } from 'fs';
import path from 'path';

export const WEEKLY_CAP_USD = Number(process.env.VIDEO_SHORT_CAP_USD ?? 2);

/** USD per 1M tokens. Claude prices from the claude-api skill (cached 2026-09-25). */
const CLAUDE_PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-4-8': { in: 5, out: 25 },
};
/** A server-side fallback can answer on a model we didn't price: assume the most expensive tier. */
const UNKNOWN_CLAUDE = { in: 10, out: 50 };

export function claudePrice(model: string) {
  return CLAUDE_PRICES[model] ?? UNKNOWN_CLAUDE;
}

/**
 * OpenAI audio. gpt-4o-mini-tts bills text-in at $0.60/1M tokens plus
 * audio-out at about $0.015 per minute; whisper-1 is $0.006 per minute. Rounded up.
 */
export const TTS_USD_PER_MINUTE = 0.02;
export const WHISPER_USD_PER_MINUTE = 0.006;

interface Entry { at: string; step: string; model: string; reservedUsd: number; actualUsd: number; detail?: unknown }
interface Ledger { week: string; capUsd: number; entries: Entry[] }

export class Budget {
  private constructor(private file: string, private ledger: Ledger) {}

  static async open(weekDir: string, week: string): Promise<Budget> {
    const file = path.join(weekDir, 'spend.json');
    let ledger: Ledger = { week, capUsd: WEEKLY_CAP_USD, entries: [] };
    try {
      ledger = JSON.parse(await fs.readFile(file, 'utf8'));
      ledger.capUsd = WEEKLY_CAP_USD;
    } catch { /* first run this week */ }
    return new Budget(file, ledger);
  }

  get spentUsd() {
    return this.ledger.entries.reduce((s, e) => s + e.actualUsd, 0);
  }

  get remainingUsd() {
    return WEEKLY_CAP_USD - this.spentUsd;
  }

  /**
   * Run `call` only if `worstCaseUsd` fits in what's left. `call` returns the
   * result plus its actual cost. If the call throws we still book the worst
   * case: a request that failed mid-stream may have been billed.
   */
  async spend<T>(
    step: string,
    model: string,
    worstCaseUsd: number,
    call: () => Promise<{ result: T; actualUsd: number; detail?: unknown }>,
  ): Promise<T> {
    if (worstCaseUsd > this.remainingUsd) {
      throw new Error(
        `[budget] ${step}: worst case $${worstCaseUsd.toFixed(3)} exceeds remaining ` +
        `$${this.remainingUsd.toFixed(3)} of the $${WEEKLY_CAP_USD} weekly cap. Not sending.`,
      );
    }
    const at = new Date().toISOString();
    try {
      const { result, actualUsd, detail } = await call();
      await this.record({ at, step, model, reservedUsd: worstCaseUsd, actualUsd, detail });
      console.log(`[budget] ${step}: $${actualUsd.toFixed(4)} (week total $${this.spentUsd.toFixed(4)} / $${WEEKLY_CAP_USD})`);
      return result;
    } catch (err) {
      await this.record({ at, step, model, reservedUsd: worstCaseUsd, actualUsd: worstCaseUsd, detail: { error: String(err) } });
      throw err;
    }
  }

  private async record(entry: Entry) {
    this.ledger.entries.push(entry);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.ledger, null, 2));
  }
}
