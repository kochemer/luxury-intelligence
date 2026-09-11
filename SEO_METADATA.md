# SEO Metadata

> Updated 2026-09 — the original version of this doc predated the digest
> slug scheme, locale pages, and structured data, and still referenced
> `/week/{weekLabel}` URLs and the `vercel.app` fallback domain. This
> reflects the current implementation.

## Files

1. **`app/layout.tsx`** — site-wide metadata defaults + the root `WebSite`/
   `Organization`/`Person` JSON-LD block
2. **`app/page.tsx`** — homepage canonical + OG/Twitter metadata
3. **`app/archive/page.tsx`** — archive canonical + OG/Twitter metadata
4. **`app/digest/[slug]/page.tsx`** — canonical, dynamic OG image, and
   `Article`/`CollectionPage`/`BreadcrumbList` JSON-LD
5. **`lib/seo/metaText.ts`** — `buildWeekTitle()` / `buildWeekMetaDescription()`,
   shared between the live page and the SEO auditor
6. **`app/{es,da}/...`** — locale variants of the above

## Site-wide defaults (`app/layout.tsx`)

```typescript
metadataBase: new URL(getSiteUrl())
openGraph: { siteName: "Luxury Intelligence", type: "website" }
twitter: { card: "summary_large_image" }
```

Canonical URLs are always built as absolute `${siteUrl}/...` strings per-page
— never a bare relative path — because a relative canonical under
`metadataBase` previously resolved against whatever host served the request,
which leaked `vercel.app` canonicals onto the custom domain (see
`CUSTOM_DOMAIN_INDEXING_DIAGNOSTIC.md`).

## Per-page metadata

### Home page (`/`)
- Canonical: `${siteUrl}/`
- `alternates.languages`: en / es / da / x-default
- OG image: current week's `coverImageUrl`, falling back to `/api/og`

### Archive page (`/archive`)
- Canonical: `${siteUrl}/archive`, same hreflang cluster as above

### Digest page (`/digest/{slug}`)
- Canonical: `${siteUrl}/digest/{slug}` — the canonical slug from
  `weekLabelToSlug()`; a request to a non-canonical slug 308s via
  `permanentRedirect()`
- Title: `buildWeekTitle(dateRange)` from `lib/seo/metaText.ts`
- Description: `buildWeekMetaDescription(digest, dateRange)`, preferring
  `digest.oneSentenceSummary` (155-char cap)
- OG image: `digest.coverImageUrl`, falling back to `/api/og?week={weekLabel}`
- JSON-LD: `Article`, `CollectionPage`, `BreadcrumbList` (see the page body)

### Locale pages (`/es`, `/da`)
Same shape as the English equivalents, with `alternates.languages` pointing
back at the full en/es/da/x-default cluster. Locale utility pages
(`subscribe`/`support`/`feedback`/`competitor-watch`) are marked
`robots: { index: false }` and have no locale alternates.

## Query parameter handling

Canonical URLs never include query parameters — e.g. `/?n=7` still canonicalises
to `${siteUrl}/`. This avoids duplicate-content issues from view-toggle params
like `?n=5` (article count).

## Base URL

`getSiteUrl()` (`lib/utils/siteUrl.ts`) is the single source of truth:
`NEXT_PUBLIC_SITE_URL` override → `https://luxury-intel.com` in production →
`http://localhost:3000` in development. **There is no `vercel.app` fallback** —
that was the root cause of the indexing issue in
`CUSTOM_DOMAIN_INDEXING_DIAGNOSTIC.md`.

## Verifying

- `npm run seo:audit` — automated title/description length + duplicate checks,
  plus sitemap/robots reconciliation. See `data/seo/report-*.md`.
- Manually: view source on a live page and confirm `<link rel="canonical">`
  and `<meta name="description">` resolve to `luxury-intel.com`, not
  `vercel.app` or a relative path.
