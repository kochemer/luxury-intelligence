'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import PodcastPlayer from './PodcastPlayer';
import WeeklyShortPlayer from './WeeklyShortPlayer';
import type { WeeklyShort } from '@/lib/video/weeklyShort';
import { displaySourceName } from '@/lib/utils/sourceName';
import { podcastTitle } from '@/lib/utils/digestStats';

const noSubscribe = () => () => {};

type Podcast = { audioPath: string; duration?: number };

/**
 * The media band at the top of the digest panel: the week's 60-second Short
 * next to the podcast. Without a Short it renders exactly the old
 * podcast-only block, so weeks before the Shorts started look unchanged.
 */
export default function WatchOrListen({ short, podcast }: { short: WeeklyShort | null; podcast: Podcast | null }) {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  // iPhone Safari can't fullscreen a div; there the button stays hidden and
  // the inline player grows to full width on play instead.
  const canFullscreen = useSyncExternalStore(noSubscribe, () => Boolean(document.fullscreenEnabled), () => false);
  const start = () => setPlaying(true);

  const podcastBlock = podcast && (
    <div>
      <PodcastPlayer
        src={podcast.audioPath}
        title={podcastTitle('Weekly Luxury Intelligence', podcast.duration)}
        description="Listen to this week's key ecommerce, jewellery & luxury stories"
        durationSeconds={podcast.duration}
      />
      <p className="mt-3 text-[11px] tracking-[0.12em] uppercase text-[var(--color-text-secondary)]">
        Subscribe in your podcast app:{' '}
        <a href="/podcast/feed.xml" className="underline underline-offset-2 hover:text-[var(--color-accent)]">RSS feed</a>
      </p>
    </div>
  );

  if (!short) {
    return podcastBlock ? (
      <div className="mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700">{podcastBlock}</div>
    ) : null;
  }

  const playAndFullscreen = () => {
    // requestFullscreen must run inside the click itself; the iframe then
    // mounts inside the already-fullscreen frame and autoplays.
    frameRef.current?.requestFullscreen?.().catch(() => {});
    start();
  };

  return (
    <section
      aria-label="Watch or listen"
      className="mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700"
    >
      <span className="text-meta font-medium uppercase tracking-widest text-[var(--color-accent)] block mb-4">
        Watch or listen
      </span>

      {/* Sizes on the h3 are `!` because the unlayered global h3 rule beats utilities. */}
      {/* The Short and its text share one dark stage, matching the podcast player below. */}
      <div className="bg-[var(--color-deep)] rounded-sm p-4 sm:p-5 md:p-6">
        <div className={playing ? 'flex flex-col gap-5 md:flex-row md:items-center md:gap-10' : 'flex items-center gap-4 sm:gap-6 md:gap-10'}>
          <div className={playing ? 'w-full max-w-[340px] mx-auto md:mx-0 md:w-[240px] lg:w-[280px] shrink-0' : 'w-[120px] sm:w-[150px] md:w-[240px] lg:w-[280px] shrink-0'}>
            <WeeklyShortPlayer
              ref={frameRef}
              youtubeId={short.youtubeId}
              poster={short.poster}
              title={short.title}
              durationS={short.durationS}
              playing={playing}
              onPlay={start}
            />
          </div>

          <div className="flex-1 min-w-0 md:max-w-xl">
            {/* The light-theme accent is too dark on navy; this is the dark-theme accent. */}
            <p className="font-mono text-[9px] sm:text-[10px] md:text-[11px] tracking-[0.15em] sm:tracking-[0.2em] uppercase text-[#C9A96E] mb-2 md:mb-3">
              The week in 60 seconds
            </p>
            <h3 className="font-serif text-base! sm:text-2xl! md:text-[2rem]! leading-tight! text-white mb-2 md:mb-4">
              {short.title}
            </h3>
            <p className="text-xs sm:text-sm md:text-base text-white/60 md:mb-6">
              Our hot take on{' '}
              <a href={short.story.url} target="_blank" rel="noopener" className="underline underline-offset-2 text-white/80 hover:text-[var(--color-accent)]">
                {short.story.title}
              </a>
              {' '}· {displaySourceName(short.story.source)}
            </p>
            <div className="hidden sm:flex flex-wrap items-center gap-x-6 gap-y-3 mt-4 md:mt-0">
              {canFullscreen && (
                <button
                  type="button"
                  onClick={playAndFullscreen}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)] px-4 py-2 text-[11px] tracking-[0.12em] uppercase text-white hover:bg-[var(--color-accent)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-deep)] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                  Watch full screen
                </button>
              )}
              <a
                href="https://www.youtube.com/@luxury-intel"
                target="_blank"
                rel="noopener"
                className="text-[11px] tracking-[0.12em] uppercase text-white/60 underline underline-offset-2 hover:text-[var(--color-accent)]"
              >
                New every Monday on YouTube
              </a>
            </div>
          </div>
        </div>
      </div>

      {podcastBlock && <div className="mt-4 md:mt-5">{podcastBlock}</div>}
    </section>
  );
}
