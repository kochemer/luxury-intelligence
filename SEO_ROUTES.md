# SEO Routes Implementation

## Files Created

1. **`app/robots.ts`** - Robots.txt route handler
2. **`app/sitemap.ts`** - Sitemap.xml route handler

## Implementation Details

### robots.txt
- Allows all user agents (`*`)
- Allows all paths (`/`)
- References sitemap at `/sitemap.xml`
- Uses `NEXT_PUBLIC_SITE_URL` env var or falls back to production URL

### sitemap.xml
- Dynamically generates entries based on available digest files
- Reads `data/digests/*.json` files at build time
- Filters to only include valid week labels (format: `YYYY-W##`)
- Includes file modification times for week pages

## Sitemap Structure

### Priority and Change Frequency
- **Home page (`/`)**: Priority 1.0, Change frequency: weekly
- **Archive page (`/archive`)**: Priority 0.6, Change frequency: weekly
- **Week pages (`/week/{weekLabel}`)**: Priority 0.8, Change frequency: weekly

### Base URL
- Uses `NEXT_PUBLIC_SITE_URL` environment variable if set
- Falls back to `https://luxury-intelligence.vercel.app` in production
- Falls back to `http://localhost:3000` in development

## Example Sitemap Output

Based on available digest files, the sitemap will include:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://luxury-intelligence.vercel.app/</loc>
    <lastmod>2026-01-08T22:00:00.000Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://luxury-intelligence.vercel.app/archive</loc>
    <lastmod>2026-01-08T22:00:00.000Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://luxury-intelligence.vercel.app/week/2025-W52</loc>
    <lastmod>2025-12-XX...</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://luxury-intelligence.vercel.app/week/2026-W01</loc>
    <lastmod>2026-01-XX...</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://luxury-intelligence.vercel.app/week/2026-W02</loc>
    <lastmod>2026-01-08T22:19:46.824Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

## Validation

### Build Status
✅ Build successful - routes are statically generated at build time

### Available Routes
- `/robots.txt` - Static route
- `/sitemap.xml` - Static route (generated at build time)

### Week Labels Included
Based on current digest files:
- `2025-W52`
- `2026-W01`
- `2026-W02`

Note: Files that don't match the week format (e.g., `2025-11.json`, `2025-12.json`, `2026-01.json`) are automatically filtered out by the regex pattern `/^\d{4}-W\d{1,2}$/`.

## Testing

1. **Development**: Run `npm run dev` and visit:
   - http://localhost:3000/robots.txt
   - http://localhost:3000/sitemap.xml

2. **Production**: After deployment, visit:
   - https://luxury-intelligence.vercel.app/robots.txt
   - https://luxury-intelligence.vercel.app/sitemap.xml

## Environment Variable (Optional)

To customize the base URL, add to `.env.local`:
```
NEXT_PUBLIC_SITE_URL=https://your-custom-domain.com
```


