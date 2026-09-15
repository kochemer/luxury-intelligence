# SEO DIAGNOSTIC REPORT (HISTORICAL — RESOLVED)

> ## ⚠️ This document is a snapshot from January 2026. Every issue in it is fixed.
>
> It is kept as a record of the original indexing investigation. **Do not treat
> anything below as a current finding.** In particular it describes relative
> canonical URLs, `/week/{weekLabel}` URLs and the `luxury-intelligence.vercel.app`
> domain — all three retired.
>
> | Then | Now |
> |---|---|
> | Relative canonicals (`canonical: '/'`) | Absolute, built from `getSiteUrl()` |
> | `/week/{weekLabel}` URLs | `/digest/{month}-{year}-week-{n}`, old URLs 308 |
> | `luxury-intelligence.vercel.app` | `luxury-intel.com`, no vercel.app fallback |
> | Zero indexed pages | 23 of 52 indexed as of 2026-09-11 |
> | Generic `Article` schema, duplicated entities | `NewsArticle` + `ItemList`, one `@id`-anchored entity graph |
>
> **For the current state, do not read this file — run the tooling:**
>
> ```
> npm run seo:audit      # repo + live-HTML checks
> npm run seo:indexing   # what Google reports per page
> npm run seo:optimize   # best-practice opportunities
> ```
>
> Those read the live site and the Search Console API, so they cannot go stale
> the way this document did. Live reports are written to `data/seo/`.
>
> One caveat on the history below: it concluded relative canonicals were the
> root cause of zero indexed pages. The likelier cause, established later, was
> that the sitemap had not been re-read by Google since 2026-02-09 — see
> `npm run seo:indexing`.

**Original date:** 2026-01-26
**Original site:** luxury-intelligence.vercel.app
**Original issue:** Google Search Console shows zero indexed pages

---

## EXECUTIVE SUMMARY (as written in January 2026 — since resolved)

**Overall Status:** ⚠️ **MOSTLY PASS** with **CRITICAL ISSUE IDENTIFIED**

**Root Cause:** Canonical URLs are **relative** instead of **absolute**, which violates SEO best practices and may cause indexing issues.

---

## DETAILED CHECKLIST RESULTS

### 1) robots.txt ✅ **PASS**

**Status:** ✅ PASS  
**Location:** `app/robots.ts`

**Findings:**
- ✅ File exists and will be served at `/robots.txt`
- ✅ Allows all user agents: `allow: '/'`
- ✅ Does NOT disallow `/`, `/week/*`, or `/email-digest`
- ✅ References sitemap: `${baseUrl}/sitemap.xml`
- ✅ Uses Next.js MetadataRoute (correct implementation)

**Content:**
```
User-agent: *
Allow: /
Sitemap: https://luxury-intelligence.vercel.app/sitemap.xml
```

**Action Required:** None

---

### 2) sitemap.xml ✅ **PASS**

**Status:** ✅ PASS  
**Location:** `app/sitemap.ts`

**Findings:**
- ✅ File exists and will be served at `/sitemap.xml`
- ✅ Contains homepage (`baseUrl`)
- ✅ Contains archive page (`${baseUrl}/archive`)
- ✅ Contains all week pages (`${baseUrl}/week/${weekLabel}`)
- ✅ Uses absolute URLs (correct)
- ✅ Includes `lastModified` dates (from file mtime for week pages)
- ✅ Proper `changeFrequency` and `priority` values
- ✅ Referenced in robots.txt

**Potential Issue:**
- ⚠️ Email digest page (`/email-digest`) is **NOT included** in sitemap
- This is likely intentional if it's a dynamic/transient page

**Action Required:** Consider adding `/email-digest` if it should be indexed

---

### 3) Indexability Headers ⚠️ **NEEDS VERIFICATION**

**Status:** ⚠️ **CANNOT VERIFY WITHOUT RUNTIME TEST**

**Findings:**
- ✅ No `noindex` found in codebase (except in scraped HTML files, which are irrelevant)
- ✅ No `X-Robots-Tag: noindex` headers found in code
- ✅ No environment-specific noindex flags found
- ⚠️ **Cannot verify HTTP response headers without production deployment check**

**Action Required:**
1. **CRITICAL:** Test production URLs with:
   ```bash
   curl -I https://luxury-intelligence.vercel.app/
   curl -I https://luxury-intelligence.vercel.app/week/2026-W04
   ```
2. Verify:
   - Status code is `200` (not 307/308/302)
   - No `X-Robots-Tag: noindex` header
   - Check `<meta name="robots">` in HTML source (should be absent or not contain `noindex`)

---

### 4) Canonical Tags ❌ **FAIL - CRITICAL ISSUE**

**Status:** ❌ **FAIL**  
**Root Cause Identified**

**Findings:**

**Homepage (`app/page.tsx`):**
```typescript
alternates: {
  canonical: '/',  // ❌ RELATIVE URL
}
```

**Week Pages (`app/week/[weekLabel]/page.tsx`):**
```typescript
alternates: {
  canonical: `/week/${weekLabel}`,  // ❌ RELATIVE URL
}
```

**Email Digest (`app/email-digest/page.tsx`):**
```typescript
alternates: {
  canonical: '/email-digest',  // ❌ RELATIVE URL
}
```

**Root Layout (`app/layout.tsx`):**
```typescript
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),  // ✅ metadataBase is set
  // ...
  alternates: {
    canonical: "/",  // ❌ RELATIVE URL
  },
};
```

**Problem:**
- While `metadataBase` is set in root layout, **Next.js may not always resolve relative canonical URLs to absolute URLs correctly** in all scenarios
- Google's best practice is to use **absolute URLs** for canonical tags
- Relative canonical URLs can cause indexing confusion, especially with multiple domains or subdomains

**Action Required:** **CRITICAL FIX**
- Change all canonical URLs to absolute URLs using `${siteUrl}` or `${baseUrl}`
- Example fix:
  ```typescript
  alternates: {
    canonical: `${siteUrl}/`,  // ✅ ABSOLUTE URL
  }
  ```

---

### 5) SSR vs CSR ✅ **PASS**

**Status:** ✅ PASS

**Findings:**
- ✅ All metadata is defined using Next.js `Metadata` API (SSR)
- ✅ No `useEffect()` or client-side metadata generation found
- ✅ `app/page.tsx`: Uses `export const metadata` (SSR)
- ✅ `app/week/[weekLabel]/page.tsx`: Uses `export async function generateMetadata()` (SSR)
- ✅ `app/email-digest/page.tsx`: Uses `export const metadata` (SSR)
- ✅ All pages are Server Components (no `'use client'` directive on page files)
- ✅ Metadata will be present in initial HTML response

**Action Required:** None

---

### 6) `<head>` Integrity ✅ **PASS**

**Status:** ✅ PASS

**Findings:**

**Homepage:**
- ✅ `<title>`: "Weekly AI, Ecommerce & Luxury Industry Digest"
- ✅ `<meta name="description">`: Present
- ✅ `<link rel="canonical">`: Present (but relative - see issue #4)
- ✅ `<meta property="og:title">`: Present
- ✅ `<meta property="og:description">`: Present
- ✅ `<meta property="og:url">`: Present (via metadataBase)
- ✅ `<meta property="og:type">`: Present (via root layout: `type: "website"`)
- ✅ `<meta property="og:image">`: Present

**Week Pages:**
- ✅ `<title>`: Dynamic per week (`Week ${weekLabel} – AI, Ecommerce & Luxury Industry Digest`)
- ✅ `<meta name="description">`: Dynamic per week
- ✅ `<link rel="canonical">`: Present (but relative - see issue #4)
- ✅ All OpenGraph tags present

**Action Required:** Fix canonical URLs (see issue #4)

---

### 7) Internal Linking ✅ **PASS**

**Status:** ✅ PASS

**Findings:**

**Homepage → Other Pages:**
- ✅ Links to `/archive` (in navigation)
- ✅ Links to `/email-digest` (in navigation)
- ⚠️ **No direct link to specific week pages** (only via archive)
- ✅ All links use `<Link href>` (Next.js Link component, which renders as `<a href>`)

**Week Pages → Other Pages:**
- ✅ Links to homepage (`/`) (in navigation)
- ✅ Links to previous/next week pages (in navigation section)
- ✅ Links to `/archive` (in navigation)
- ✅ All links use `<Link href>` (renders as `<a href>`)

**Archive Page:**
- ✅ Links to all week pages (`/week/${weekLabel}`)
- ✅ Links back to homepage (`/`)
- ✅ All links use `<Link href>` (renders as `<a href>`)

**Action Required:** Consider adding a direct link from homepage to latest week page for better crawlability

---

### 8) URL Stability ✅ **PASS**

**Status:** ✅ PASS

**Findings:**
- ✅ Consistent URL structure: `/week/YYYY-W##`
- ✅ No trailing slash inconsistencies found
- ✅ No `/week` vs `/weeks` vs `/2026-W03` mismatches
- ✅ Dynamic params are stable (weekLabel format: `YYYY-W##`)
- ✅ No infinite URL variants detected

**Action Required:** None

---

### 9) Build & Deploy Environment ⚠️ **NEEDS VERIFICATION**

**Status:** ⚠️ **CANNOT VERIFY WITHOUT DEPLOYMENT CHECK**

**Findings:**
- ✅ `next.config.ts` has no noindex flags
- ✅ No `vercel.json` found (no custom headers)
- ✅ No environment-specific noindex found in code
- ⚠️ **Cannot verify production build vs preview without deployment logs**

**Action Required:**
1. Verify in Vercel dashboard:
   - Production deployments are being used (not preview)
   - No custom headers are injecting `X-Robots-Tag: noindex`
   - Environment variables are correct (`NEXT_PUBLIC_SITE_URL`)

---

### 10) Regression Check ✅ **PASS**

**Status:** ✅ PASS

**Findings:**
- ✅ No `noindex` found in app code (only in scraped HTML files, which are irrelevant)
- ✅ No `nofollow` found in app code (only in scraped HTML files)
- ✅ No `X-Robots` headers found in code
- ✅ No `robots` meta tags with `noindex` found

**Action Required:** None

---

## LIKELY ROOT CAUSES

### Primary Issue: **Relative Canonical URLs**

**Impact:** HIGH  
**Probability:** HIGH

Canonical URLs are defined as relative paths (`/`, `/week/${weekLabel}`) instead of absolute URLs. While Next.js should resolve these with `metadataBase`, this is not guaranteed and violates Google's best practices.

**Fix Required:**
1. Update all canonical URLs to absolute URLs
2. Files to fix:
   - `app/page.tsx` (line 19)
   - `app/week/[weekLabel]/page.tsx` (line 29)
   - `app/email-digest/page.tsx` (line 15)
   - `app/layout.tsx` (line 58)

### Secondary Issue: **Missing Email Digest in Sitemap**

**Impact:** LOW  
**Probability:** MEDIUM

The `/email-digest` page is not included in the sitemap. If this page should be indexed, it should be added.

---

## EXACT CODE LOCATIONS TO FIX

### Fix 1: Homepage Canonical (CRITICAL)
**File:** `app/page.tsx`  
**Line:** 19  
**Current:**
```typescript
alternates: {
  canonical: '/',
},
```
**Fix:**
```typescript
alternates: {
  canonical: `${siteUrl}/`,
},
```

### Fix 2: Week Page Canonical (CRITICAL)
**File:** `app/week/[weekLabel]/page.tsx`  
**Line:** 29  
**Current:**
```typescript
alternates: {
  canonical: `/week/${weekLabel}`,
},
```
**Fix:**
```typescript
alternates: {
  canonical: `${siteUrl}/week/${weekLabel}`,
},
```

### Fix 3: Email Digest Canonical (CRITICAL)
**File:** `app/email-digest/page.tsx`  
**Line:** 15  
**Current:**
```typescript
alternates: {
  canonical: '/email-digest',
},
```
**Fix:**
```typescript
alternates: {
  canonical: `${siteUrl}/email-digest`,
},
```

### Fix 4: Root Layout Canonical (CRITICAL)
**File:** `app/layout.tsx`  
**Line:** 58  
**Current:**
```typescript
alternates: {
  canonical: "/",
},
```
**Fix:**
```typescript
alternates: {
  canonical: `${siteUrl}/`,
},
```

### Fix 5: Add Email Digest to Sitemap (OPTIONAL)
**File:** `app/sitemap.ts`  
**Line:** ~68  
**Add:**
```typescript
// Email digest page
const emailDigestEntry: MetadataRoute.Sitemap[0] = {
  url: `${baseUrl}/email-digest`,
  lastModified: new Date(),
  changeFrequency: 'weekly',
  priority: 0.7,
};

return [homeEntry, archiveEntry, emailDigestEntry, ...weekEntries];
```

---

## VERIFICATION STEPS AFTER FIXES

1. **Deploy fixes to production**
2. **Test canonical URLs:**
   ```bash
   curl https://luxury-intelligence.vercel.app/ | grep -i canonical
   curl https://luxury-intelligence.vercel.app/week/2026-W04 | grep -i canonical
   ```
   Should show absolute URLs: `https://luxury-intelligence.vercel.app/...`

3. **Test robots.txt:**
   ```bash
   curl https://luxury-intelligence.vercel.app/robots.txt
   ```

4. **Test sitemap:**
   ```bash
   curl https://luxury-intelligence.vercel.app/sitemap.xml
   ```

5. **Check HTTP headers:**
   ```bash
   curl -I https://luxury-intelligence.vercel.app/
   ```
   Verify no `X-Robots-Tag: noindex`

6. **Submit to Google Search Console:**
   - Request indexing for homepage
   - Request indexing for one week page
   - Submit updated sitemap

---

## SUMMARY

| Check | Status | Priority |
|-------|--------|----------|
| robots.txt | ✅ PASS | - |
| sitemap.xml | ✅ PASS | - |
| Indexability headers | ⚠️ VERIFY | Medium |
| Canonical tags | ❌ **FAIL** | **CRITICAL** |
| SSR metadata | ✅ PASS | - |
| Head integrity | ✅ PASS | - |
| Internal linking | ✅ PASS | - |
| URL stability | ✅ PASS | - |
| Build environment | ⚠️ VERIFY | Medium |
| Regression check | ✅ PASS | - |

**Overall:** 7/10 checks pass, 1 critical failure (canonical URLs), 2 need runtime verification.

**Next Steps:** Fix canonical URLs immediately, then verify production headers.
