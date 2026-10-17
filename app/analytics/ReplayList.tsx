'use client';

import { useState } from 'react';
import ReplayPlayer from './ReplayPlayer';

/** Everything a row shows, already formatted on the server. Holds no person id. */
export interface ReplayRow {
  replayId: string;
  when: string;
  visitor: string;
  firstVisit: boolean;
  since: string | null;
  pages: string;
  from: string;
  fromNote: string | null;
  fromTitle: string | null;
  place: string;
  device: string | null;
  badges: string[];
  length: string;
  pageCount: string;
  amplitudeUrl: string | null;
}

const DIM = 'text-[var(--color-text-secondary)]';

/** The replay rows. One player is open at a time; Play expands it under its row. */
export default function ReplayList({ rows }: { rows: ReplayRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul>
      {rows.map((r, idx) => {
        const isOpen = open === r.replayId;
        const panelId = `replay-panel-${idx}`;
        // Each segment stays on one line and carries its own separator, so a line never starts with "·".
        const segments = [
          r.fromNote ? { key: 'from', node: <><span title={r.fromTitle ?? undefined}>{r.from}</span> <span>{r.fromNote}</span></> } : { key: 'from', node: <span title={r.fromTitle ?? undefined}>{r.from}</span> },
          { key: 'place', node: <>{r.place}</> },
          ...(r.device ? [{ key: 'device', node: <>{r.device}</> }] : []),
        ];
        return (
          <li
            key={r.replayId}
            className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[11rem_minmax(0,1fr)_6.5rem_auto] gap-x-4 gap-y-1.5 py-3 border-t border-[var(--color-border)] first:border-t-0 first:pt-0 text-[13px] items-start"
          >
            <div className="col-span-2 md:col-span-1">
              <p className="font-semibold tabular-nums text-[var(--color-text-primary)]">{r.when}</p>
              <p className={DIM}>
                {r.visitor}
                {r.firstVisit && <> · <b className="font-semibold text-[var(--color-text-primary)]">first visit</b></>}
                {r.since && <> · {r.since}</>}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[var(--color-text-primary)]">{r.pages}</p>
              <p className={DIM}>
                {segments.map((s, i) => (
                  <span key={s.key}>
                    <span className="inline-block whitespace-nowrap">{s.node}{i < segments.length - 1 ? ' ·' : ''}</span>
                    {i < segments.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </p>
              {r.badges.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {r.badges.map(b => (
                    <span key={b} className="text-[11px] border border-[var(--color-border)] rounded-[2px] px-1.5 text-[var(--color-text-primary)]">{b}</span>
                  ))}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums text-[var(--color-text-primary)]">{r.length}</p>
              <p className={DIM}>{r.pageCount}</p>
            </div>
            <div className="col-span-2 md:col-span-1 flex md:flex-col items-center md:items-end gap-3 md:gap-1 md:self-center">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => setOpen(isOpen ? null : r.replayId)}
                className={`text-[13px] border border-[var(--color-accent)] rounded-[2px] px-2.5 py-1 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                  isOpen
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : 'text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-on-accent)]'
                }`}
              >
                {isOpen ? '■ Close' : '▶ Play'}
              </button>
              {r.amplitudeUrl && (
                <a
                  href={r.amplitudeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-[12px] underline underline-offset-2 whitespace-nowrap hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${DIM}`}
                >
                  Open in Amplitude ↗
                </a>
              )}
            </div>
            {isOpen && (
              <div className="col-span-2 md:col-span-4">
                <ReplayPlayer replayId={r.replayId} panelId={panelId} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
