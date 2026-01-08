# SEO Metadata Implementation

## Files Changed

1. **`app/layout.tsx`** - Added site-wide metadata defaults
2. **`app/page.tsx`** - Added canonical URL and OG/Twitter metadata
3. **`app/archive/page.tsx`** - Added canonical URL and OG/Twitter metadata
4. **`app/week/[weekLabel]/page.tsx`** - Added canonical URL and dynamic OG image
5. **`public/og-default.svg`** - Created fallback OG image (1200x630)

## Site-Wide Defaults (app/layout.tsx)

```typescript
metadataBase: new URL(siteUrl)
openGraph: {
  siteName: "Luxury Intelligence",
  type: "website",
}
twitter: {
  card: "summary_large_image",
}
alternates: {
  canonical: "/", // Default for layout
}
```

## Per-Page Metadata

### Home Page (`/`)
- **Canonical**: `/` (no query params)
- **OG Image**: `/og-default.svg`
- **Title**: "Weekly AI, Ecommerce & Luxury Industry Digest"
- **Description**: 136 characters

### Archive Page (`/archive`)
- **Canonical**: `/archive` (no query params)
- **OG Image**: `/og-default.svg`
- **Title**: "Archive – Weekly AI & Luxury Industry Digests"
- **Description**: 157 characters

### Week Page (`/week/{weekLabel}`)
- **Canonical**: `/week/{weekLabel}` (no query params)
- **OG Image**: Uses cover image if available (`/weekly-images/{weekLabel}.png`), else fallback (`/og-default.svg`)
- **Title**: "Week {weekLabel} – AI, Ecommerce & Luxury Industry Digest"
- **Description**: 145 characters

## Example HTML Output

### Home Page
```html
<link rel="canonical" href="https://luxury-intelligence.vercel.app/" />
<meta property="og:title" content="Weekly AI, Ecommerce & Luxury Industry Digest" />
<meta property="og:description" content="A weekly curated digest covering AI & strategy, ecommerce and retail technology, luxury and jewellery industry news. Updated every week." />
<meta property="og:image" content="https://luxury-intelligence.vercel.app/og-default.svg" />
<meta property="og:site_name" content="Luxury Intelligence" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Weekly AI, Ecommerce & Luxury Industry Digest" />
<meta name="twitter:description" content="A weekly curated digest covering AI & strategy, ecommerce and retail technology, luxury and jewellery industry news. Updated every week." />
<meta name="twitter:image" content="https://luxury-intelligence.vercel.app/og-default.svg" />
```

### Week Page (with cover image)
```html
<link rel="canonical" href="https://luxury-intelligence.vercel.app/week/2026-W02" />
<meta property="og:title" content="Week 2026-W02 – AI, Ecommerce & Luxury Industry Digest" />
<meta property="og:description" content="Curated overview of the most relevant AI, ecommerce, luxury and jewellery industry news for week 2026-W02. Handpicked articles with AI summaries." />
<meta property="og:image" content="https://luxury-intelligence.vercel.app/weekly-images/2026-W02.png" />
<meta property="og:site_name" content="Luxury Intelligence" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Week 2026-W02 – AI, Ecommerce & Luxury Industry Digest" />
<meta name="twitter:description" content="Curated overview of the most relevant AI, ecommerce, luxury and jewellery industry news for week 2026-W02. Handpicked articles with AI summaries." />
<meta name="twitter:image" content="https://luxury-intelligence.vercel.app/weekly-images/2026-W02.png" />
```

## Query Parameter Handling

✅ **Canonical URLs exclude query parameters**
- `/week/2026-W02?n=5` → Canonical: `/week/2026-W02`
- `/archive?page=2` → Canonical: `/archive`
- `/?n=7` → Canonical: `/`

This prevents duplicate content issues when users navigate with query parameters (e.g., `?n=5` for article count).

## Fallback OG Image

- **File**: `public/og-default.svg`
- **Size**: 1200x630 (recommended OG image size)
- **Content**: Purple gradient with "Luxury Intelligence" branding
- **Used when**: Week page doesn't have a cover image yet

## Environment Variable

Uses `NEXT_PUBLIC_SITE_URL` if set, otherwise falls back to:
- Production: `https://luxury-intelligence.vercel.app`
- Development: `http://localhost:3000`

## Validation

✅ Build successful - All metadata exports compile correctly
✅ Type safety - Uses Next.js `Metadata` type
✅ No query params in canonical URLs
✅ Dynamic OG images for week pages (uses cover image when available)

