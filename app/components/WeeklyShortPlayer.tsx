'use client';

import { forwardRef } from 'react';
import Image from 'next/image';

type Props = {
  youtubeId: string | null;
  poster: string;
  title: string;
  durationS: number;
  /** Controlled by the parent so its "Full screen" button can start the video too. */
  playing: boolean;
  onPlay: () => void;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * Click-to-load YouTube Short. Until the reader presses play this is our own
 * poster image: no request goes to YouTube, so nothing third-party loads
 * before consent (see CLAUDE.md, Privacy). On play it swaps in the
 * youtube-nocookie player. The ref is the frame element, which the parent
 * puts into fullscreen (the Shorts embed has no fullscreen button of its own).
 */
const WeeklyShortPlayer = forwardRef<HTMLDivElement, Props>(function WeeklyShortPlayer(
  { youtubeId, poster, title, durationS, playing, onPlay },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative w-full aspect-[9/16] rounded-lg overflow-hidden bg-black shadow-lg ring-1 ring-white/10 [&:fullscreen]:rounded-none [&:fullscreen]:ring-0"
    >
      {playing && youtubeId ? (
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => { if (youtubeId) onPlay(); }}
          className="group absolute inset-0 block w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
          aria-label={`Play the 60-second video: ${title}`}
        >
          <Image
            src={poster}
            alt=""
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 768px) 240px, 140px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden />
          <span className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] md:text-[11px] font-medium text-white tracking-wide" aria-hidden>
            {/* Play cue lives in the chip: a centred play circle covered the poster's headline or caption */}
            <span className="inline-flex items-center gap-1.5 bg-[var(--color-deep)]/90 border border-[var(--color-accent)] rounded-full pl-2 pr-2.5 py-1 tabular-nums text-[11px] md:text-xs transition-colors group-hover:bg-[var(--color-accent)]">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" /></svg>
              {fmt(durationS)}
            </span>
            <span className="bg-black/50 rounded px-1.5 py-0.5">Shorts</span>
          </span>
        </button>
      )}
    </div>
  );
});

export default WeeklyShortPlayer;
