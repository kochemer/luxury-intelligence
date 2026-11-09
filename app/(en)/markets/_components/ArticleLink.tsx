'use client';

/** Outbound article link that keeps the cookieless click count. */

import type { ReactNode } from 'react';
import { countArticleClick } from '@/lib/analytics/beacon';

export default function ArticleLink({
  url, title, source, className, children,
}: { url: string; title: string; source: string; className?: string; children: ReactNode }) {
  const count = () => countArticleClick({ url, title, source });
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={count}
      onAuxClick={e => { if (e.button === 1) count(); }}
      className={className}
    >
      {children}
    </a>
  );
}
