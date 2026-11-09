'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getMessages, detectLocaleFromPathname } from '@/lib/i18n/messages';
import SearchBar from '@/app/components/SearchBar';
import ArticleCard from '@/app/components/ArticleCard';
import { formatDisplayDate } from '@/lib/utils/formatDisplayDate';

type SearchResult = {
  id?: string;
  title: string;
  url: string;
  source?: string;
  published_at?: string;
  snippet?: string;
};

function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const locale = detectLocaleFromPathname(pathname);
  const t = getMessages(locale);

  const [articles, setArticles] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setArticles([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`)
      .then((res) => res.json())
      .then((data) => {
        setArticles(data.articles || []);
        setTotal(data.total ?? 0);
      })
      .catch(() => setError('Search failed'))
      .finally(() => setLoading(false));
  }, [q]);

  if (!q) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-text-primary)] mb-4">
          Search
        </h1>
        <p className="text-[var(--color-text-secondary)] mb-8">
          Search across all articles in the Luxury Intelligence archive.
        </p>
        <div className="max-w-md mx-auto">
          <SearchBar defaultValue="" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <SearchBar defaultValue={q} />
      </div>

      {loading && (
        <p className="text-[var(--color-text-secondary)] text-sm">Searching…</p>
      )}

      {error && (
        <p className="text-red-600 dark:text-red-400">{error}</p>
      )}

      {!loading && !error && q.length >= 2 && (
        <>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {total === 0
              ? t.search.noResults
              : t.search.resultsCount.replace('{count}', String(total))}
          </p>

          {articles.length > 0 ? (
            <ul className="space-y-6">
              {articles.map((a) => (
                <li key={a.id || a.url}>
                  <ArticleCard
                    title={a.title}
                    url={a.url}
                    source={a.source}
                    date={a.published_at}
                    summary={a.snippet}
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--color-text-secondary)]">{t.search.noResults}</p>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-16 text-center text-[var(--color-text-secondary)]">Loading…</div>}>
        <SearchResults />
      </Suspense>
    </main>
  );
}
