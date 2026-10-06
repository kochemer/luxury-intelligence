/**
 * Anonymous article-click count (client side). Runs for every reader,
 * consent or not: it sends only which article was clicked — no identifier,
 * no cookie, nothing stored in the browser. See recordArticleClick in
 * lib/analytics/visits.ts.
 */
export function countArticleClick(article: { url: string; title?: string; source?: string }): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'development') return;
  try {
    const payload = JSON.stringify({
      u: article.url,
      t: article.title,
      s: article.source,
      w: navigator.webdriver === true,
    });
    if (!navigator.sendBeacon?.('/api/click', payload)) {
      void fetch('/api/click', { method: 'POST', body: payload, keepalive: true }).catch(() => {});
    }
  } catch {
    // Never let counting affect following the link.
  }
}
