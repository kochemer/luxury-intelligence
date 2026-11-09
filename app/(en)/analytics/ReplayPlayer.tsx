'use client';

import { useEffect, useRef, useState } from 'react';
import '@amplitude/rrweb-player/dist/style.css';
import './replayPlayer.css';

type Status = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

interface RrwebEvent { type: number; data?: { width?: number; height?: number } }

interface PlayerInstance { $destroy?: () => void; getReplayer?: () => { destroy?: () => void } }

const MESSAGES: Record<number, string> = {
  401: 'Your session has expired. Reload the page and sign in again.',
  404: 'No recording found. Amplitude may already have deleted it (recordings are kept 30 days).',
  413: 'This recording is too large to play here. Use “Open in Amplitude” instead.',
};

/**
 * Plays one session recording inside its row. The player library is loaded
 * only now (dynamic import), and the events come from our own route because
 * Amplitude's storage sends no CORS headers.
 */
export default function ReplayPlayer({ replayId, panelId }: { replayId: string; panelId?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let player: PlayerInstance | null = null;
    const controller = new AbortController();
    const hostEl = host.current;

    (async () => {
      try {
        const res = await fetch(`/analytics/replay?id=${encodeURIComponent(replayId)}`, {
          signal: controller.signal,
          credentials: 'same-origin',
        });
        if (!res.ok) {
          throw new Error(MESSAGES[res.status] ?? `Couldn’t load the recording (error ${res.status}).`);
        }
        const events = (await res.json()) as RrwebEvent[];
        if (!Array.isArray(events) || events.length < 2) throw new Error('This recording has too little in it to play.');
        const { default: Player } = await import('@amplitude/rrweb-player');
        if (cancelled || !host.current || !panel.current) return;

        const meta = events.find(e => e.type === 4)?.data;
        const portrait = !!meta?.width && !!meta?.height && meta.height > meta.width;
        const width = Math.max(240, Math.min(panel.current.clientWidth - 24, 760));
        const height = portrait ? Math.round(Math.min(560, width * 0.9)) : Math.round(width * 0.56);
        const inactiveColor = getComputedStyle(document.documentElement).getPropertyValue('--color-bar').trim() || '#D9D1BF';

        player = new Player({
          target: host.current,
          props: {
            events: events as never,
            width,
            height,
            autoPlay: true,
            skipInactive: true,
            speedOption: [1, 2, 4, 8],
            mouseTail: false,
            inactiveColor,
          },
        }) as PlayerInstance;
        setStatus({ state: 'ready' });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Couldn’t load the recording.' });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      try {
        if (player?.$destroy) player.$destroy();
        else player?.getReplayer?.().destroy?.();
      } catch { /* already gone */ }
      if (hostEl) hostEl.innerHTML = '';
    };
  }, [replayId]);

  return (
    <div ref={panel} id={panelId} className="replay-panel mt-2.5 border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-bg)] overflow-hidden">
      {status.state === 'loading' && <p className="text-[13px] text-[var(--color-text-secondary)]">Loading recording…</p>}
      {status.state === 'error' && <p role="alert" className="text-[13px] text-[var(--color-down)]">{status.message}</p>}
      <div ref={host} />
    </div>
  );
}
