'use client';

import { useState } from 'react';
import PodcastPlayer from './PodcastPlayer';
import WeeklyShortPlayer from './WeeklyShortPlayer';
import type { WeeklyShort } from '@/lib/video/weeklyShort';

type Podcast = { audioPath: string; duration?: number };

/**
 * The media band at the top of the digest panel: the week's 60-second Short
 * next to the podcast. Without a Short it renders exactly the old
 * podcast-only block, so weeks before the Shorts started look unchanged.
 */
export default function WatchOrListen({ short, podcast }: { short: WeeklyShort | null; podcast: Podcast | null }) {
  const [expanded, setExpanded] = useState(false);

  const podcastBlock = podcast && (
    <div>
      <PodcastPlayer
        src={podcast.audioPath}
        title="Weekly Luxury Intelligence · ~12 minutes"
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

  return (
    <section
      aria-label="Watch or listen"
      className="mb-5 sm:mb-6 md:mb-8 pb-5 sm:pb-6 md:pb-8 border-b border-gray-200 dark:border-gray-700"
    >
      <span className="text-meta font-medium uppercase tracking-widest text-[var(--color-accent)] block mb-4">
        Watch or listen
      </span>

      <div className={expanded ? 'flex flex-col gap-5 md:flex-row md:gap-8' : 'flex gap-4 sm:gap-6 md:gap-8'}>
        {/* The Short: phone-shaped, 9:16. Small beside the text on mobile until played. */}
        <div className={expanded ? 'w-full max-w-[340px] mx-auto md:mx-0 md:w-[220px] shrink-0' : 'w-[132px] sm:w-[160px] md:w-[200px] shrink-0'}>
          <WeeklyShortPlayer
            youtubeId={short.youtubeId}
            poster={short.poster}
            title={short.title}
            durationS={short.durationS}
            onPlay={() => setExpanded(true)}
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <p className="font-mono text-[10px] md:text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] mb-2">
            The week in 60 seconds
          </p>
          <h3 className="font-serif text-xl sm:text-2xl md:text-[1.75rem] leading-tight text-[var(--color-text-primary)] mb-3">
            {short.title}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Our hot take on{' '}
            <a href={short.story.url} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-[var(--color-accent)]">
              {short.story.title}
            </a>
            {' '}· {short.story.source}
          </p>
          <a
            href="https://www.youtube.com/@luxury-intel"
            target="_blank"
            rel="noopener"
            className="hidden sm:inline-block self-start text-[11px] tracking-[0.12em] uppercase text-[var(--color-text-secondary)] underline underline-offset-2 hover:text-[var(--color-accent)]"
          >
            New every Monday on YouTube
          </a>

          {/* Desktop: the podcast sits under the video's text, filling the column. */}
          {podcastBlock && <div className="hidden md:block mt-auto pt-6">{podcastBlock}</div>}
        </div>
      </div>

      {/* Mobile: the podcast gets the full width under the row. */}
      {podcastBlock && <div className="md:hidden mt-5">{podcastBlock}</div>}
    </section>
  );
}
