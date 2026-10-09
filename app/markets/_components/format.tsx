/**
 * Small shared pieces for the Markets pages. No hooks, so both the server
 * page and the client trackers can use them.
 */

export function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatPct(n: number): string {
  const sign = n > 0.05 ? '+' : n < -0.05 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

export function MoveChip({ type }: { type: string }) {
  return (
    <span className="inline-block font-ibm-mono text-[10.5px] tracking-[0.06em] uppercase px-[7px] py-[1px] rounded-[3px] bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-border)] whitespace-nowrap">
      {type}
    </span>
  );
}
