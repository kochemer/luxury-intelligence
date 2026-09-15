# Web Push "Enable notifications" Diagnostic Report

**Date:** 2026-01-26  
**Issue:** Button stuck on "Enabling..." - subscription flow never completes

---

## A) Production Asset Checks ✅

### Results:
1. **manifest.webmanifest**
   - Status: **200 OK**
   - Content-Type: `application/manifest+json; charset=utf-8`
   - Size: 367 bytes
   - ✅ **LIVE**

2. **sw.js**
   - Status: **200 OK**
   - Content-Type: `application/javascript; charset=utf-8`
   - Size: 9,480 bytes
   - ✅ **Contains `importScripts("/push-sw.js")`**
   - ✅ **LIVE**

3. **push-sw.js**
   - Status: **200 OK**
   - Content-Type: `application/javascript; charset=utf-8`
   - Size: 2,145 bytes
   - ✅ **LIVE**

**Conclusion:** All required PWA assets are live and accessible in production.

---

## B) Service Worker Registration + Control

### Diagnostic Code Added:
Temporary debug logging added to `EnableNotificationsButton.tsx`:
- Logs `navigator.serviceWorker.controller` state
- Logs `navigator.serviceWorker.ready` resolution time
- Logs registration active/waiting/installing states

### Manual Verification Required:
**Browser Console Instructions:**
```javascript
// Check SW controller
console.log('SW Controller:', navigator.serviceWorker.controller ? 'exists' : 'null');

// Check SW ready
const start = Date.now();
navigator.serviceWorker.ready.then(reg => {
  console.log('SW Ready after:', Date.now() - start, 'ms');
  console.log('Registration state:', {
    active: reg.active?.state,
    waiting: reg.waiting?.state,
    installing: reg.installing?.state,
  });
});
```

**Expected Behavior:**
- `navigator.serviceWorker.controller` should be non-null when SW is controlling the page
- `navigator.serviceWorker.ready` should resolve quickly (< 100ms if already active)
- Registration should have `active.state === 'activated'`

**Conclusion:** ⚠️ **VERIFICATION PENDING** - Requires browser console testing

---

## C) Environment Variables

### Client-Side (NEXT_PUBLIC_VAPID_PUBLIC_KEY):
**Location:** `app/components/EnableNotificationsButton.tsx` lines 120, 185
```typescript
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
```

**Next.js Behavior:**
- `NEXT_PUBLIC_*` variables are replaced at **build time** in the client bundle
- They are **NOT** available at runtime via `process.env` in the browser
- They must be present during `npm run build` to be included

**Potential Issue:** ⚠️ **CRITICAL**
- If `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is not set during build, it will be `undefined` at runtime
- The code checks `if (!vapidPublicKey)` but this check happens AFTER `await navigator.serviceWorker.ready`
- If the key is missing, `pushManager.subscribe()` will fail silently or hang

**Verification Method:**
Check the built client bundle for the VAPID key:
```bash
# Search for VAPID key in built JS
grep -r "BCfM0u1oqaqSwWM2kOqdNlDVEVPVz92V_nmz-aH2G_B_zuvFy2Wft4XpsNhcttsf51loRUKPhQW9P3WSx9L0KtU" .next/
```

### Server-Side Environment Variables:
**Debug Endpoint Created:** `/api/push/debug` (not yet deployed)

**Expected Variables:**
- `VAPID_PRIVATE_KEY` - ✅ Set (send-test endpoint works)
- `VAPID_SUBJECT` - ✅ Set (send-test endpoint works)
- `PUSH_ADMIN_SECRET` - ✅ Set (send-test endpoint works)
- `KV_REST_API_URL` - ⚠️ Unknown
- `KV_REST_API_TOKEN` - ⚠️ Unknown

**Conclusion:** ⚠️ **CLIENT-SIDE VAPID KEY MAY BE MISSING** - Needs build-time verification

---

## D) Subscribe Endpoint Behavior

### Diagnostic Logging Added:
Temporary logs added to `app/api/push/subscribe/route.ts`:
- `[PUSH SUBSCRIBE DEBUG] subscribe called`
- `[PUSH SUBSCRIBE DEBUG] Request body parsed`
- `[PUSH SUBSCRIBE DEBUG] Validation passed/failed`
- `[PUSH SUBSCRIBE DEBUG] Calling storeSubscription...`
- `[PUSH SUBSCRIBE DEBUG] storeSubscription completed`
- `[PUSH SUBSCRIBE DEBUG] Returning success`

### Storage Backend Logging:
Added to `lib/pushStorage.ts`:
- `[PUSH STORAGE DEBUG] Using KV backend` OR
- `[PUSH STORAGE DEBUG] Using memory backend (KV not available)`

### Test Results:
**Local Test:** Not tested (dev server may not be running)
**Production Test:** Pending (requires actual subscription attempt)

**Conclusion:** ⚠️ **VERIFICATION PENDING** - Endpoint logging ready, needs production test

---

## E) Client Flow Logging

### Diagnostic Logging Added to `EnableNotificationsButton.tsx`:

**Button Click:**
- `[PUSH DEBUG] Button clicked`
- `[PUSH DEBUG] SW controller: exists/null`
- `[PUSH DEBUG] SW ready check starting...`

**Permission Request:**
- `[PUSH DEBUG] Requesting notification permission...`
- `[PUSH DEBUG] Permission result: granted/default/denied`

**Service Worker Ready:**
- `[PUSH DEBUG] Waiting for service worker ready...`
- `[PUSH DEBUG] SW ready after X ms`
- `[PUSH DEBUG] Registration state: {...}`

**VAPID Key:**
- `[PUSH DEBUG] VAPID key present: true/false`
- `[PUSH DEBUG] VAPID key length: X`

**Push Subscription:**
- `[PUSH DEBUG] Converting VAPID key...`
- `[PUSH DEBUG] Key converted, length: X`
- `[PUSH DEBUG] Calling pushManager.subscribe...`
- `[PUSH DEBUG] Subscribe completed after X ms`

**API Call:**
- `[PUSH DEBUG] POST /api/push/subscribe starting...`
- `[PUSH DEBUG] POST completed after X ms`
- `[PUSH DEBUG] Response status: XXX`

**UI State:**
- `[PUSH DEBUG] Subscription successful, updating UI`
- `[PUSH DEBUG] Finally block, setting isSubscribing=false`

**Conclusion:** ✅ **COMPREHENSIVE LOGGING ADDED** - Will reveal where the flow hangs

---

## F) KV Storage Health

### Debug Endpoint Created:
**Route:** `app/api/push/debug/route.ts`
**Method:** GET
**Protection:** `x-admin-secret` header required

**Returns:**
```json
{
  "ok": true,
  "subscriptionCount": 0,
  "storageBackend": "kv" | "memory",
  "kvConfigured": true | false,
  "envVars": {
    "KV_REST_API_URL": true | false,
    "KV_REST_API_TOKEN": true | false,
    "VAPID_PRIVATE_KEY": true | false,
    "VAPID_SUBJECT": true | false,
    "PUSH_ADMIN_SECRET": true | false,
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY": true | false
  }
}
```

**Status:** ⚠️ **NOT YET DEPLOYED** (404 in production)

**Conclusion:** ⚠️ **PENDING DEPLOYMENT** - Endpoint ready, needs build + deploy

---

## G) Root Cause Analysis + Recommended Fix

### Most Likely Root Cause: **VAPID Public Key Missing at Build Time**

**Evidence:**
1. ✅ All PWA assets are live
2. ✅ Service worker includes push handlers
3. ⚠️ `NEXT_PUBLIC_VAPID_PUBLIC_KEY` may not be set during build
4. ⚠️ Code checks for key AFTER `await navigator.serviceWorker.ready`
5. ⚠️ If key is `undefined`, `pushManager.subscribe()` will fail/hang

**Why It Hangs:**
- `pushManager.subscribe()` requires a valid VAPID public key
- If the key is `undefined` or malformed, the browser API may:
  - Throw an error (should be caught)
  - Hang indefinitely (browser bug/edge case)
  - Return a rejected promise

**Secondary Possibilities:**
1. **Service Worker Not Controlling Page**
   - If SW is not active, `pushManager.subscribe()` may fail
   - Check: `navigator.serviceWorker.controller === null`

2. **Permission Already Denied**
   - If user previously denied, `Notification.requestPermission()` returns 'denied'
   - Code correctly handles this, but may not show error message

3. **KV Storage Error**
   - If KV is misconfigured, `storeSubscription()` may throw
   - Error should be caught and logged

### Recommended Fix:

**1. Verify VAPID Key in Build:**
```bash
# Check if key is in built bundle
npm run build
grep -r "BCfM0u1oqaqSwWM2kOqdNlDVEVPVz92V_nmz-aH2G_B_zuvFy2Wft4XpsNhcttsf51loRUKPhQW9P3WSx9L0KtU" .next/
```

**2. Move VAPID Key Check Earlier:**
```typescript
// In handleSubscribe, check key BEFORE waiting for SW ready
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
if (!vapidPublicKey) {
  console.error('[PUSH DEBUG] VAPID key missing!');
  setStatus('error');
  setErrorMessage('Push notifications not configured');
  setIsSubscribing(false);
  return;
}
```

**3. Add Error Handling to pushManager.subscribe:**
```typescript
try {
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
} catch (error) {
  console.error('[PUSH DEBUG] Subscribe error:', error);
  throw new Error(`Failed to subscribe: ${error.message}`);
}
```

**4. Deploy Debug Endpoint:**
- Build and deploy to access `/api/push/debug`
- Verify all environment variables are set

**5. Test in Browser Console:**
- Open production site
- Open DevTools Console
- Click "Enable notifications"
- Watch for `[PUSH DEBUG]` logs
- Identify where the flow stops

---

## Next Steps:

1. ✅ **DONE:** Add comprehensive diagnostic logging
2. ⏳ **PENDING:** Build and deploy diagnostic code
3. ⏳ **PENDING:** Test in production browser console
4. ⏳ **PENDING:** Verify VAPID key in built bundle
5. ⏳ **PENDING:** Check service worker controller state
6. ⏳ **PENDING:** Review logs to identify exact failure point

---

## Files Modified (Temporary Diagnostic Code):

1. `app/components/EnableNotificationsButton.tsx` - Added debug logging
2. `app/api/push/subscribe/route.ts` - Added debug logging
3. `lib/pushStorage.ts` - Added storage backend logging
4. `app/api/push/debug/route.ts` - **NEW** diagnostic endpoint

**Note:** All diagnostic code is marked with `[PUSH DEBUG]` or `[PUSH SUBSCRIBE DEBUG]` and can be removed after fixing the issue.
