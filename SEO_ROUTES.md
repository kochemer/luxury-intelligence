# SEO Routes

> Updated 2026-09 — the original version of this doc described the
> `/week/{weekLabel}` URL scheme and the `vercel.app` fallback domain, both
> retired. This reflects the current implementation.

## Files

1. **`app/robots.ts`** — robots.txt route handler
2. **`app/sitemap.ts`** — thin wrapper around `lib/seo/urlInventory.ts`
3. **`lib/seo/urlInventory.ts`** — single source of truth for every indexable
   URL; shared by the real sitemap and the SEO auditor (`seo/audit/staticAudit.ts`)
   so the two can never disagree about what should be indexed.

## robots.txt

- Allows all user agents on `/`, with an explicit disallow list for noindex
  utility pages (`/search`, and the locale `subscribe`/`support`/`feedback`/
  `competitor-watch` pages — see `app/robots.ts` for the current list).
- A second rule explicitly allows known AI crawlers (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, Applebot, Amazonbot) as a positive GEO signal.
- Sitemap URL always resolves to `https://luxury-intel.com/sitemap.xml` in
  production via `getSiteUrl()` (`lib/utils/siteUrl.ts`).

## sitemap.xml

- Built from `data/digests/*.json` at request time.
- Digest URLs use the human-readable slug scheme: `/digest/{month}-{year}-week-{n}`
  (see `lib/utils/weekSlug.ts`), not the retired `/week/{weekLabel}` scheme —
  old links 308-redirect via `next.config.ts`.
- Static pages (`/about`, `/methodology`, `/subscribe`, `/feedback`, `/support`)
  use a hardcoded `STATIC_PAGE_LAST_MODIFIED` in `lib/seo/urlInventory.ts` —
  bump it when those pages change. Weekly-content pages (homepage, archive,
  email-digest, locale homepages) use the latest digest's `builtAtISO`.
- Locale pages (`/es`, `/da` and their `about`/`archive`/`methodology`
  sub-pages) are included with `hreflang` alternates; locale utility pages
  (`subscribe`/`support`/`feedback`/`competitor-watch`) are excluded —
  they're noindex.
- Base URL always comes from `getSiteUrl()`: `NEXT_PUBLIC_SITE_URL` override →
  `https://luxury-intel.com` in production → `http://localhost:3000` in dev.
  There is no `vercel.app` fallback.

## Verifying

- `npm run seo:audit` runs the automated SEO checker, which includes sitemap/
  digest reconciliation and robots-conflict checks — see `data/seo/report-*.md`
  for the latest results.
- `npm run seo:check-robots` checks the live `/robots.txt`.
- `npm run test:redirects` checks live redirect behaviour.
- Manually: visit `/robots.txt` and `/sitemap.xml` in dev or production.
