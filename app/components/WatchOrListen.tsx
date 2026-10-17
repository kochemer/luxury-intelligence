'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import PodcastPlayer from './PodcastPlayer';
import WeeklyShortPlayer from './WeeklyShortPlayer';
import type { WeeklyShort } from '@/lib/video/weeklyShort';
import { displaySourceName } from '@/lib/utils/sourceName';
import { podcastTitle } from '@/lib/utils/digestStats';
import { PROFILES } from '@/lib/socialProfiles';

const noSubscribe = () => () => {};

type Podcast = { audioPath: string; duration?: number };

/**
 * The week's 60-second Short next to the podcast. Without a Short it renders
 * exactly the old podcast-only block, so weeks before the Shorts started look
 * unchanged.
 *
 * layout="band" (issue page): one wide dark stage, poster beside the text;
 * pressing play grows the player inline.
 * layout="sidebar" (homepage, owner 2026-10-16: media must show before the
 * articles without pushing them down): a column beside the Spotlight, poster
 * beside text. Pressing play opens the Short in a centred pop-up player
 * (<dialog>) instead of growing inline: an inline 9:16 player took over the
 * whole column. Escape, the close button or a click on the backdrop closes it
 * and unmounts the iframe, which stops playback.
 */
export default function WatchOrListen({
  short,
  podcast,
  layout = 'band',
}: {
  short: WeeklyShort | null;
  podcast: Podcast | null;
  layout?: 'band' | 'sidebar';
}) {
  const sidebar = layout === 'sidebar';
  const [playing, setPlaying] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // iPhone Safari can't fullscreen a div; there the button stays hidden and
  // the inline player grows to full width on play instead.
  const canFullscreen = useSyncExternalStore(noSubscribe, () => Boolean(document.fullscreenEnabled), () => false);
  const start = () => setPlaying(true);

  // Keep the page behind the pop-up from scrolling while it is open.
  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [modalOpen]);

  const podcastBlock = podcast && (
    <div>
      <PodcastPlayer
        src={podcast.audioPath}
        title={podcastTitle('Weekly Luxury Intelligence', podcast.duration)}
        description="Listen to this week's key ecommerce, jewellery & luxury stories"
        durationSeconds={podcast.duration}
      />
      <p className="mt-3 text-[11px] tracking-[0.12em] uppercase text-[var(--color-text-secondary)]">
        Follow the podcast:{' '}
        <a href={PROFILES.spotify} target="_blank" rel="noopener" className="inline-flex items-center min-h-11 px-1 underline underline-offset-2 hover:text-[var(--color-accent)]">Spotify</a>
        {' · '}
        <a href="/podcast/feed.xml" className="inline-flex items-center min-h-11 px-1 underline underline-offset-2 hover:text-[var(--color-accent)]">RSS feed</a>
      </p>
    </div>
  );

  if (!short) {
    return podcastBlock ? (
      <div className={sidebar ? '' : 'mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700'}>{podcastBlock}</div>
    ) : null;
  }

  const openModal = () => {
    dialogRef.current?.showModal();
    setModalOpen(true);
  };
  const closeModal = () => dialogRef.current?.close();

  const playAndFullscreen = () => {
    // requestFullscreen must run inside the click itself; the iframe then
    // mounts inside the already-fullscreen frame and autoplays.
    frameRef.current?.requestFullscreen?.().catch(() => {});
    start();
  };

  const inlinePlaying = !sidebar && playing;

  return (
    <section
      aria-label="Watch or listen"
      className={sidebar ? '' : 'mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700'}
    >
      <span className="text-meta font-medium uppercase tracking-widest text-[var(--color-accent)] block mb-4">
        Watch or listen
      </span>

      {/* Sizes on the h3 are `!` because the unlayered global h3 rule beats utilities. */}
      {/* The Short and its text share one dark stage, matching the podcast player below. */}
      <div className="bg-[var(--color-deep)] rounded-sm p-4 sm:p-5 md:p-6">
        <div className={inlinePlaying ? 'flex flex-col gap-5 md:flex-row md:items-center md:gap-10' : `flex items-center gap-4 sm:gap-6 ${sidebar ? 'lg:gap-6' : 'md:gap-10'}`}>
          <div className={
            inlinePlaying
              ? 'w-full max-w-[340px] mx-auto md:mx-0 md:w-[240px] lg:w-[280px] shrink-0'
              : sidebar
                ? 'w-[120px] sm:w-[150px] lg:w-[140px] xl:w-[160px] shrink-0'
                : 'w-[120px] sm:w-[150px] md:w-[240px] lg:w-[280px] shrink-0'
          }>
            <WeeklyShortPlayer
              ref={frameRef}
              youtubeId={short.youtubeId}
              poster={short.poster}
              title={short.title}
              durationS={short.durationS}
              playing={inlinePlaying}
              onPlay={sidebar ? openModal : start}
            />
          </div>

          <div className={sidebar ? 'flex-1 min-w-0' : 'flex-1 min-w-0 md:max-w-xl'}>
            {/* The light-theme accent is too dark on navy; this is the dark-theme accent. */}
            <p className="font-mono text-[9px] sm:text-[10px] md:text-[11px] tracking-[0.15em] sm:tracking-[0.2em] uppercase text-[#C9A96E] mb-2 md:mb-3">
              The week in 60 seconds
            </p>
            <h3 className={sidebar
              ? 'font-serif text-base! sm:text-xl! leading-tight! text-white mb-2 md:mb-3'
              : 'font-serif text-base! sm:text-2xl! md:text-[2rem]! leading-tight! text-white mb-2 md:mb-4'}>
              {short.title}
            </h3>
            <p className={sidebar ? 'text-xs sm:text-sm text-white/70' : 'text-xs sm:text-sm md:text-base text-white/60 md:mb-6'}>
              Our hot take on{' '}
              <a href={short.story.url} target="_blank" rel="noopener" className="underline underline-offset-2 text-white/80 hover:text-[var(--color-accent)]">
                {short.story.title}
              </a>
              {' '}· {displaySourceName(short.story.source)}
            </p>
            <div className={sidebar ? 'hidden sm:flex flex-wrap items-center gap-x-5 gap-y-3 mt-4' : 'hidden sm:flex flex-wrap items-center gap-x-6 gap-y-3 mt-4 md:mt-0'}>
              {(sidebar || canFullscreen) && (
                <button
                  type="button"
                  onClick={sidebar ? openModal : playAndFullscreen}
                  className="inline-flex items-center gap-2 whitespace-nowrap min-h-11 rounded-full border border-[var(--color-accent)] px-4 py-2 text-[11px] tracking-[0.12em] uppercase text-white hover:bg-[var(--color-accent)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-deep)] transition-colors"
                >
                  {sidebar ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7L8 5z" /></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  )}
                  {sidebar ? 'Watch the Short' : 'Watch full screen'}
                </button>
              )}
              <a
                href={PROFILES.youtube}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center min-h-11 text-[11px] tracking-[0.12em] uppercase text-white/60 underline underline-offset-2 hover:text-[var(--color-accent)]"
              >
                New every Monday on YouTube
              </a>
            </div>
          </div>
        </div>
      </div>

      {podcastBlock && <div className="mt-4 md:mt-5">{podcastBlock}</div>}

      {/* Pop-up player (sidebar only). Native <dialog>: focus is trapped while
          open, Escape closes it, and the backdrop dims the page. */}
      {sidebar && (
        <dialog
          ref={dialogRef}
          aria-label={`Video: ${short.title}`}
          onClose={() => setModalOpen(false)}
          onClick={(e) => { if (e.target === dialogRef.current) closeModal(); }}
          className="m-auto p-0 bg-transparent overflow-visible backdrop:bg-black/80 backdrop:backdrop-blur-sm"
          style={{ maxWidth: 'none', maxHeight: 'none' }}
        >
          <div className="relative flex items-center justify-center">
            <div style={{ width: 'min(92vw, calc(86vh * 9 / 16))' }}>
              {modalOpen && (
                <WeeklyShortPlayer
                  youtubeId={short.youtubeId}
                  poster={short.poster}
                  title={short.title}
                  durationS={short.durationS}
                  playing
                  onPlay={() => {}}
                />
              )}
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close video"
              className="absolute -top-14 right-0 sm:-right-14 sm:top-0 w-11 h-11 rounded-full bg-white text-[var(--color-deep)] flex items-center justify-center shadow-lg hover:bg-[var(--color-accent-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
