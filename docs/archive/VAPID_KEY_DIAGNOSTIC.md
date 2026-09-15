# VAPID Key Build-Time Replacement Diagnostic

**Date:** 2026-01-26  
**Issue:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` exists in Vercel env vars but NOT in production client bundle

---

## Current Status

### ✅ Server-Side Verification
- Debug endpoint `/api/push/debug` confirms: `NEXT_PUBLIC_VAPID_PUBLIC_KEY: true`
- Variable is accessible server-side

### ❌ Client-Side Verification
- VAPID key NOT found in production JavaScript chunks
- Key prefix `BCfM0u1oqaqSwWM2kOqdNlDVEVPVz92V` not present in any `.js` files

---

## Code Analysis

### Current Implementation
**File:** `app/components/EnableNotificationsButton.tsx`

**Line 120 (checkSupport):**
```typescript
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
if (!vapidPublicKey) {
  setIsSupported(false);
  setIsChecking(false);
  return;
}
```

**Line 185 (handleSubscribe):**
```typescript
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
if (!vapidPublicKey) {
  throw new Error('VAPID public key not configured');
}
```

### Comparison with Working Examples

**AmplitudeInit.tsx (Line 20):**
```typescript
const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || '2f72d6d40500d170bda25421e23d7975';
```
- Uses fallback pattern
- Should work the same way

**FeedbackForm.tsx (Lines 17-40):**
```typescript
const formAction = useMemo(() => {
  let envVar: string | undefined;
  if (typeof process !== 'undefined') {
    try {
      envVar = process.env?.NEXT_PUBLIC_FEEDBACK_FORM_ACTION;
    } catch {
      envVar = undefined;
    }
  }
  // ... fallback logic
}, []);
```
- Uses defensive pattern with `useMemo`
- More complex but shouldn't be necessary

---

## Possible Root Causes

### 1. **Vercel Build Environment Scope** ⚠️ MOST LIKELY
**Issue:** Variable might be set for wrong environment scope
- Check: Vercel Dashboard → Settings → Environment Variables
- Ensure `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set for **Production** (not just Preview/Development)
- Vercel has separate env var scopes: Production, Preview, Development

### 2. **Build Cache Issue**
**Issue:** Vercel might be using cached build artifacts
- Solution: Clear build cache or force fresh build
- Check: Vercel Dashboard → Deployments → Clear cache

### 3. **Next.js Static Replacement Limitation**
**Issue:** Next.js might not be able to statically analyze the code path
- The variable is accessed inside `useEffect` and async functions
- Next.js replaces `NEXT_PUBLIC_*` at build time, but only if it can statically determine the code path

### 4. **Variable Name or Value Issue**
**Issue:** Variable might have whitespace or encoding issues
- Check: Copy-paste the exact value from Vercel dashboard
- Ensure no leading/trailing spaces
- Verify base64url encoding is correct

### 5. **Build-Time vs Runtime Access**
**Issue:** Variable accessed in a way that prevents static replacement
- `process.env.NEXT_PUBLIC_*` should be replaced at build time
- But if accessed conditionally or in a way Next.js can't analyze, it might not work

---

## Recommended Fixes

### Fix 1: Verify Vercel Environment Scope (CRITICAL)
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
3. Verify it's set for **Production** environment (not just Preview/Development)
4. If missing for Production, add it:
   - Key: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - Value: `BCfM0u1oqaqSwWM2kOqdNlDVEVPVz92V_nmz-aH2G_B_zuvFy2Wft4XpsNhcttsf51loRUKPhQW9P3WSx9L0KtU`
   - Environment: **Production** (check the Production checkbox)

### Fix 2: Use Explicit Build-Time Constant Pattern
Modify `EnableNotificationsButton.tsx` to use a pattern that Next.js can definitely statically analyze:

```typescript
// At top of file, outside component
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

// Then use VAPID_PUBLIC_KEY instead of process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
```

This ensures Next.js can statically replace it at build time.

### Fix 3: Add Build-Time Verification
Add a build-time check in `next.config.ts`:

```typescript
// In next.config.ts, before export
if (process.env.NODE_ENV === 'production') {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.warn('[WARNING] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set in production build!');
  } else {
    console.log('[BUILD] NEXT_PUBLIC_VAPID_PUBLIC_KEY is set (length:', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.length, ')');
  }
}
```

### Fix 4: Force Fresh Build
1. In Vercel Dashboard → Deployments
2. Find the latest deployment
3. Click "Redeploy" → "Use existing Build Cache" → **UNCHECK** (force fresh build)

---

## Verification Steps

After applying fixes:

1. **Check Build Logs:**
   - Vercel Dashboard → Deployments → Latest → Build Logs
   - Look for the `[BUILD]` log message confirming key is set

2. **Verify in Production:**
   ```bash
   curl -s https://luxury-intel.com/_next/static/chunks/*.js | grep -q "BCfM0u1oqaqSwWM2kOqdNlDVEVPVz92V" && echo "VAPID key baked" || echo "VAPID key NOT baked"
   ```

3. **Test in Browser:**
   - Open production site
   - Open DevTools Console
   - Click "Enable notifications"
   - Check for `[PUSH DEBUG] VAPID key present: true` log

---

## Most Likely Issue

**Environment Scope Mismatch** - The variable is probably set for Preview/Development but NOT for Production environment in Vercel.

**Action:** Verify and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` specifically for **Production** environment in Vercel Dashboard.
