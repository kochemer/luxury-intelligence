# CUSTOM DOMAIN INDEXING DIAGNOSTIC REPORT (HISTORICAL — RESOLVED)

> ## ⚠️ Snapshot from January 2026. The problem described here is fixed.
>
> The vercel.app fallback that caused it is gone: `lib/utils/siteUrl.ts` now
> defaults to `https://luxury-intel.com` in production with no vercel.app
> branch, and `__tests__/seo.urlInventory.test.ts` asserts every URL is
> absolute and on the canonical host. References below to `utils/siteUrl.ts`
> predate the move to `lib/utils/siteUrl.ts`.
>
> **Do not read this for current state.** Run `npm run seo:indexing` — it asks
> Google directly, so it cannot go stale.

**Original date:** 2026-01-26

**Custom Domain:** luxury-intel.com  
**Vercel Domain:** luxury-intelligence.vercel.app  
**Issue:** Custom domain has 0 indexed pages while Vercel domain has pages indexed

---

## EXECUTIVE SUMMARY

**Root Cause Identified:** ✅ **FIXED**

All site URLs (canonicals, sitemap, robots.txt) were hardcoded to fall back to `luxury-intelligence.vercel.app` when `NEXT_PUBLIC_SITE_URL` environment variable was not set. This caused Google to see vercel.app URLs in canonicals when crawling luxury-intel.com, telling Google that vercel.app is the canonical domain.

**Fix Applied:** Created a shared utility (`utils/siteUrl.ts`) that defaults to `luxury-intel.com` in production, ensuring the custom domain is used even without environment variables.

---

## DETAILED DIAGNOSTIC RESULTS

### 1) Domain Routing + Redirects ⚠️ **NEEDS VERIFICATION**

**Status:** ⚠️ **CANNOT VERIFY WITHOUT PRODUCTION TEST**

**Configuration:**
- ✅ Added redirect in `next.config.ts` to redirect `www.luxury-intel.com` → `luxury-intel.com` (301)
- ⚠️ **Cannot verify actual redirect behavior without production deployment**

**Expected Behavior:**
- `https://luxury-intel.com/` → 200 OK
- `https://www.luxury-intel.com/` → 301 → `https://luxury-intel.com/`
- `https://luxury-intel.com/week/2026-W04` → 200 OK
- `https://www.luxury-intel.com/week/2026-W04` → 301 → `https://luxury-intel.com/week/2026-W04`

**Action Required:**
1. Deploy changes to production
2. Test redirects:
   ```bash
   curl -I https://luxury-intel.com/
   curl -I https://www.luxury-intel.com/
   curl -I https://luxury-intel.com/week/2026-W04
   curl -I https://www.luxury-intel.com/week/2026-W04
   ```
3. Verify:
   - All resolve to 200 OR clean single 301→200
   - No 307/308 loops
   - No redirect to vercel.app
   - Final URL is `https://luxury-intel.com` (non-www)

---

### 2) Canonical Correctness on Custom Domain ✅ **FIXED**

**Status:** ✅ **FIXED**

**Problem Found:**
- All files had hardcoded fallback: `process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app"`
- If `NEXT_PUBLIC_SITE_URL` was not set, canonicals pointed to vercel.app

**Fix Applied:**
- Created `utils/siteUrl.ts` with `getSiteUrl()` function
- Defaults to `https://luxury-intel.com` in production (not vercel.app)
- Updated all files to use the shared utility:
  - `app/layout.tsx`
  - `app/page.tsx`
  - `app/week/[weekLabel]/page.tsx`
  - `app/email-digest/page.tsx`
  - `app/methodology/page.tsx`
  - `app/da/methodology/page.tsx`
  - `app/es/methodology/page.tsx`
  - `app/da/archive/page.tsx`
  - `app/es/archive/page.tsx`

**Expected Result After Deployment:**
- `https://luxury-intel.com/` → `<link rel="canonical" href="https://luxury-intel.com/">`
- `https://luxury-intel.com/week/2026-W04` → `<link rel="canonical" href="https://luxury-intel.com/week/2026-W04">`

**Verification Command:**
```bash
curl https://luxury-intel.com/ | grep -i canonical
curl https://luxury-intel.com/week/2026-W04 | grep -i canonical
```

---

### 3) Sitemap Domain Correctness ✅ **FIXED**

**Status:** ✅ **FIXED**

**Problem Found:**
- `app/sitemap.ts` had hardcoded fallback to `https://luxury-intelligence.vercel.app`
- Sitemap would list vercel.app URLs if `NEXT_PUBLIC_SITE_URL` was not set

**Fix Applied:**
- Updated `app/sitemap.ts` to use `getSiteUrl()` from shared utility
- Now defaults to `https://luxury-intel.com` in production

**Expected Result After Deployment:**
- `https://luxury-intel.com/sitemap.xml` → All URLs use `https://luxury-intel.com`
- No vercel.app URLs in sitemap

**Verification Command:**
```bash
curl https://luxury-intel.com/sitemap.xml | head -n 40
curl -s https://luxury-intel.com/sitemap.xml | grep -i "vercel"
# Should return no results (no vercel URLs)
```

---

### 4) robots.txt on Custom Domain ✅ **FIXED**

**Status:** ✅ **FIXED**

**Problem Found:**
- `app/robots.ts` had hardcoded fallback to `https://luxury-intelligence.vercel.app`
- robots.txt sitemap reference would point to vercel.app if `NEXT_PUBLIC_SITE_URL` was not set

**Fix Applied:**
- Updated `app/robots.ts` to use `getSiteUrl()` from shared utility
- Now defaults to `https://luxury-intel.com` in production

**Expected Result After Deployment:**
- `https://luxury-intel.com/robots.txt` → `Sitemap: https://luxury-intel.com/sitemap.xml`
- No `Disallow: /` rules

**Verification Command:**
```bash
curl https://luxury-intel.com/robots.txt
```

**Expected Output:**
```
User-agent: *
Allow: /
Sitemap: https://luxury-intel.com/sitemap.xml
```

---

### 5) Single Source of Truth for Site Origin ✅ **FIXED**

**Status:** ✅ **FIXED**

**Implementation:**
- Created `utils/siteUrl.ts` as single source of truth
- Priority order:
  1. `NEXT_PUBLIC_SITE_URL` environment variable (explicit override)
  2. Production default: `https://luxury-intel.com` (custom domain)
  3. Development default: `http://localhost:3000`

**Files Updated:**
- ✅ `utils/siteUrl.ts` (NEW - shared utility)
- ✅ `app/layout.tsx`
- ✅ `app/page.tsx`
- ✅ `app/week/[weekLabel]/page.tsx`
- ✅ `app/email-digest/page.tsx`
- ✅ `app/methodology/page.tsx`
- ✅ `app/da/methodology/page.tsx`
- ✅ `app/es/methodology/page.tsx`
- ✅ `app/da/archive/page.tsx`
- ✅ `app/es/archive/page.tsx`
- ✅ `app/robots.ts`
- ✅ `app/sitemap.ts`

**Hardcoded vercel.app References Removed:**
- ✅ All hardcoded `luxury-intelligence.vercel.app` fallbacks removed from app code
- ✅ Only remaining references are in documentation files (SEO_DIAGNOSTIC_REPORT.md, etc.)

---

### 6) Vercel Config Check ⚠️ **NEEDS MANUAL VERIFICATION**

**Status:** ⚠️ **REQUIRES VERCEL DASHBOARD CHECK**

**Action Required:**
1. Verify in Vercel project settings:
   - `luxury-intel.com` is added as a domain
   - `www.luxury-intel.com` is added as a domain (if applicable)
   - Primary domain is set to `luxury-intel.com` (non-www preferred)
   - Redirect from www to non-www is enabled (or vice versa if www is preferred)

2. Verify environment variables:
   - `NEXT_PUBLIC_SITE_URL` should be set to `https://luxury-intel.com` (or left unset to use default)
   - Ensure it's set for **production** environment (not just preview)

3. Verify DNS:
   - `luxury-intel.com` A record points to Vercel
   - `www.luxury-intel.com` CNAME points to Vercel (if using www)

---

### 7) Redirect Configuration ✅ **ADDED**

**Status:** ✅ **FIXED**

**Implementation:**
- Added redirect in `next.config.ts` to redirect `www.luxury-intel.com` → `luxury-intel.com` (301)
- This ensures a single canonical domain (non-www)

**Note:** If `www.luxury-intel.com` is the preferred canonical domain, reverse the redirect in `next.config.ts`.

---

## ROOT CAUSE

**Primary Issue:** Hardcoded fallback to `luxury-intelligence.vercel.app`

When `NEXT_PUBLIC_SITE_URL` environment variable was not set (or not set correctly), all canonicals, sitemaps, and robots.txt pointed to `luxury-intelligence.vercel.app`. When Google crawled `luxury-intel.com`, it saw:
- Canonical tags pointing to `luxury-intelligence.vercel.app`
- Sitemap URLs using `luxury-intelligence.vercel.app`
- robots.txt sitemap reference pointing to `luxury-intelligence.vercel.app`

This told Google that `luxury-intelligence.vercel.app` is the canonical domain, not `luxury-intel.com`, causing Google to index only the Vercel domain.

---

## FIXES APPLIED

### 1. Created Shared Site URL Utility
**File:** `utils/siteUrl.ts` (NEW)
- Single source of truth for site URL
- Defaults to `https://luxury-intel.com` in production
- Can be overridden with `NEXT_PUBLIC_SITE_URL` environment variable

### 2. Updated All Site URL References
**Files Updated:**
- `app/layout.tsx`
- `app/page.tsx`
- `app/week/[weekLabel]/page.tsx`
- `app/email-digest/page.tsx`
- `app/methodology/page.tsx`
- `app/da/methodology/page.tsx`
- `app/es/methodology/page.tsx`
- `app/da/archive/page.tsx`
- `app/es/archive/page.tsx`
- `app/robots.ts`
- `app/sitemap.ts`

**Change:** Replaced `process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app"` with `getSiteUrl()` from shared utility.

### 3. Added WWW Redirect
**File:** `next.config.ts`
- Added redirect from `www.luxury-intel.com` → `luxury-intel.com` (301)
- Ensures single canonical domain

---

## VERIFICATION COMMANDS

After deploying the fixes, run these commands to verify:

### 1. Check Redirects
```bash
curl -I https://luxury-intel.com/
curl -I https://www.luxury-intel.com/
curl -I https://luxury-intel.com/week/2026-W04
curl -I https://www.luxury-intel.com/week/2026-W04
```

**Expected:**
- `luxury-intel.com` → 200 OK
- `www.luxury-intel.com` → 301 → `luxury-intel.com`

### 2. Check Canonicals
```bash
curl https://luxury-intel.com/ | grep -i canonical
curl https://luxury-intel.com/week/2026-W04 | grep -i canonical
```

**Expected:**
- `<link rel="canonical" href="https://luxury-intel.com/">`
- `<link rel="canonical" href="https://luxury-intel.com/week/2026-W04">`
- **NO** `luxury-intelligence.vercel.app` in canonicals

### 3. Check Sitemap
```bash
curl https://luxury-intel.com/sitemap.xml | head -n 40
curl -s https://luxury-intel.com/sitemap.xml | grep -i "vercel"
```

**Expected:**
- All URLs use `https://luxury-intel.com`
- **NO** `luxury-intelligence.vercel.app` URLs in sitemap
- `grep` should return no results

### 4. Check robots.txt
```bash
curl https://luxury-intel.com/robots.txt
```

**Expected:**
```
User-agent: *
Allow: /
Sitemap: https://luxury-intel.com/sitemap.xml
```

**NO** `luxury-intelligence.vercel.app` in robots.txt

### 5. Check HTTP Headers
```bash
curl -I https://luxury-intel.com/
```

**Expected:**
- Status: 200 OK (or 301 if redirecting)
- **NO** `X-Robots-Tag: noindex` header

---

## NEXT STEPS

1. **Deploy fixes to production**
2. **Verify all checks above pass**
3. **Update Vercel environment variables (optional but recommended):**
   - Set `NEXT_PUBLIC_SITE_URL=https://luxury-intel.com` in Vercel project settings
   - This ensures explicit control, but the code now defaults correctly
4. **Submit to Google Search Console:**
   - Add `luxury-intel.com` as a property (if not already added)
   - Submit updated sitemap: `https://luxury-intel.com/sitemap.xml`
   - Request indexing for homepage: `https://luxury-intel.com/`
   - Request indexing for one week page: `https://luxury-intel.com/week/2026-W04`
5. **Monitor indexing:**
   - Check Google Search Console for indexing status
   - Verify pages are being indexed under `luxury-intel.com` (not vercel.app)

---

## SUMMARY

| Check | Status | Notes |
|-------|--------|-------|
| Redirects | ⚠️ VERIFY | Added redirect config, needs production test |
| Canonicals on custom domain | ✅ FIXED | All now use shared utility, default to luxury-intel.com |
| Sitemap hostnames | ✅ FIXED | Now uses shared utility, defaults to luxury-intel.com |
| Robots.txt | ✅ FIXED | Now uses shared utility, defaults to luxury-intel.com |
| Primary domain config | ⚠️ VERIFY | Requires Vercel dashboard check |
| Single source of truth | ✅ FIXED | Created `utils/siteUrl.ts` |

**Overall:** 4/6 checks fixed, 2 require production verification

**Root Cause:** Hardcoded vercel.app fallbacks causing canonicals to point to wrong domain

**Fix Applied:** Shared utility defaults to custom domain in production
