'use client';

import { useState } from 'react';
import Image from 'next/image';

type Props = {
  youtubeId: string | null;
  poster: string;
  title: string;
  durationS: number;
  /** Called when the reader starts the video, so the parent can widen it on mobile. */
  onPlay?: () => void;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * Click-to-load YouTube Short. Until the reader presses play this is our own
 * poster image: no request goes to YouTube, so nothing third-party loads
 * before consent (see CLAUDE.md, Privacy). On play it swaps in the
 * youtube-nocookie player.
 */
export default function WeeklyShortPlayer({ youtubeId, poster, title, durationS, onPlay }: Props) {
  const [playing, setPlaying] = useState(false);

  if (playing && youtubeId) {
    return (
      <div className="relative w-full aspect-[9/16] rounded-lg overflow-hidden bg-black">
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { if (!youtubeId) return; setPlaying(true); onPlay?.(); }}
      className="group relative block w-full aspect-[9/16] rounded-lg overflow-hidden bg-[var(--color-deep)] border border-black/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
      aria-label={`Play the 60-second video: ${title}`}
    >
      <Image src={poster} alt="" fill sizes="(min-width: 768px) 200px, 132px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden />
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[var(--color-deep)]/85 border-2 border-[var(--color-accent)] flex items-center justify-center text-white transition-transform group-hover:scale-110">
          <svg className="w-5 h-5 md:w-6 md:h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" /></svg>
        </span>
      </span>
      <span className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] md:text-[11px] font-medium text-white tracking-wide" aria-hidden>
        <span className="bg-black/50 rounded px-1.5 py-0.5 tabular-nums">{fmt(durationS)}</span>
        <span className="bg-black/50 rounded px-1.5 py-0.5">Shorts</span>
      </span>
    </button>
  );
}
