'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

const SPEEDS = [1, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type PodcastPlayerProps = {
  src: string;
  title: string;
  description?: string;
  /** Duration in seconds (from podcast.json), used as fallback before metadata loads */
  durationSeconds?: number;
};

export default function PodcastPlayer({
  src,
  title,
  description,
  durationSeconds,
}: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const speed = SPEEDS[speedIndex];

  const updateTime = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (loaded && duration <= 0 && el.duration && Number.isFinite(el.duration)) {
      setDuration(el.duration);
    }
  }, [loaded, duration]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onLoadedMetadata = () => {
      if (el.duration && Number.isFinite(el.duration)) setDuration(el.duration);
      setLoaded(true);
    };
    const onEnded = () => setPlaying(false);
    const onTimeUpdate = updateTime;
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [updateTime]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = ratio * duration;
    el.currentTime = t;
    setCurrentTime(t);
  };

  const cycleSpeed = () => {
    setSpeedIndex((i) => (i + 1) % SPEEDS.length);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-[var(--color-deep)] rounded-sm p-5 flex items-center gap-5">
      {/* Play / Pause */}
      <button
        type="button"
        onClick={togglePlay}
        className={`flex-shrink-0 w-12 h-12 rounded-full border-2 border-[var(--color-accent)] flex items-center justify-center text-white hover:bg-[var(--color-accent)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-deep)] transition-all ${playing ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''}`}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        )}
      </button>

      {/* Info + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-2">
          <p className="font-serif text-white text-sm truncate">{title}</p>
          {description && (
            <p className="text-[11px] text-white/40 truncate hidden sm:block">{description}</p>
          )}
        </div>

        {/* Progress bar — padded wrapper for larger touch target on mobile */}
        <div
          className="py-3 -my-3 cursor-pointer"
          onClick={seek}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
          onKeyDown={(e) => {
            const el = audioRef.current;
            if (!el || !duration) return;
            const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
            if (step) {
              e.preventDefault();
              const t = Math.max(0, Math.min(duration, el.currentTime + step));
              el.currentTime = t;
              setCurrentTime(t);
            }
          }}
        >
          <div className="relative h-[2px] bg-white/20 rounded-full pointer-events-none">
            <div
              className="h-full bg-[var(--color-accent)] rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-white/50 font-sans tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Speed toggle */}
      <button
        type="button"
        onClick={cycleSpeed}
        className="flex-shrink-0 min-w-11 min-h-11 text-[11px] font-medium border border-white/20 rounded-full px-2 py-1 text-white/60 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-deep)] transition-colors"
        aria-label={`Playback speed ${speed}x`}
      >
        {speed}x
      </button>

      <audio ref={audioRef} preload="metadata" className="sr-only">
        <source src={src} type="audio/mpeg" />
      </audio>
    </div>
  );
}
