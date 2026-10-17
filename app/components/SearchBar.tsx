'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getMessages, detectLocaleFromPathname } from '@/lib/i18n/messages';

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

type SearchBarProps = {
  /** Compact: smaller padding, for inline use */
  compact?: boolean;
  /** Default value from URL */
  defaultValue?: string;
  /** Called when search is submitted */
  onSubmit?: (query: string) => void;
};

export default function SearchBar({ compact, defaultValue = '', onSubmit }: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue);
  const router = useRouter();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const locale = detectLocaleFromPathname(pathname);
  const t = getMessages(locale);
  const prefix = locale === 'en' ? '' : `/${locale}`;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      if (onSubmit) {
        onSubmit(q);
      } else {
        router.push(`${prefix}/search?q=${encodeURIComponent(q)}`);
      }
    },
    [query, onSubmit, router, prefix]
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {/* Width comes from the parent: header slot (192px on desktop), full row on phones, /search column. */}
      <label htmlFor="header-search" className="sr-only">
        {t.search.placeholder}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] pointer-events-none">
          <SearchIcon />
        </span>
        <input
          id="header-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search.placeholder}
          className={`w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[3px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent ${compact ? 'pl-9 pr-3 py-2 text-sm' : 'pl-10 pr-4 py-2.5 text-sm md:text-base'}`}
          aria-label={t.search.placeholder}
        />
      </div>
    </form>
  );
}
