'use client';

import { useEffect } from 'react';

/**
 * Service Worker Registration Component
 * 
 * Manually registers the service worker since next-pwa's auto-registration
 * may not be working properly in Next.js 16.
 * 
 * This component runs only on the client and registers /sw.js
 * 
 * Note: If you see "bad-precaching-response" errors in the console, this is usually
 * due to a stale precache manifest from a previous build. The next deployment
 * will generate a fresh manifest and resolve the issue automatically.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') {
      return;
    }

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      return;
    }

    // Only register in production (next-pwa disables in dev)
    if (process.env.NODE_ENV === 'development') {
      return;
    }

    // A failed install used to unregister and retry every 2 s with no limit,
    // which on a broken precache turned every open tab into a request loop.
    const MAX_INSTALL_RETRIES = 2;
    let installRetries = 0;

    const cleanupAndRegister = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();

        // If sw.js is already registered and active, just check for updates — don't tear it down.
        // Unregistering invalidates any existing push subscriptions tied to that registration.
        const existing = registrations.find(r =>
          r.active?.scriptURL?.endsWith('/sw.js')
        );
        if (existing && existing.active) {
          console.log('[SW Registration] Service worker already active, checking for updates...');
          existing.update().catch(() => {});
          return;
        }

        // Only unregister stale registrations (no active sw.js)
        for (const registration of registrations) {
          console.log('[SW Registration] Unregistering stale service worker...');
          await registration.unregister();
        }

        // Register fresh
        registerServiceWorker();
      } catch (error) {
        console.error('[SW Registration] Cleanup failed:', error);
        registerServiceWorker();
      }
    };
    
    const registerServiceWorker = () => {

      // Register the service worker with updateViaCache: 'none' to bypass HTTP cache
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          console.log('[SW Registration] Service worker registered:', registration.scope);
          
          // Monitor installation state immediately
          const checkInstallation = () => {
            if (registration.installing) {
              registration.installing.addEventListener('statechange', () => {
                if (registration.installing?.state === 'redundant') {
                  if (installRetries >= MAX_INSTALL_RETRIES) {
                    console.warn('[SW Registration] Service worker installation failed repeatedly - giving up until next page load');
                    return;
                  }
                  installRetries++;
                  console.warn(`[SW Registration] Service worker installation failed - retrying (${installRetries}/${MAX_INSTALL_RETRIES})...`);
                  registration.unregister().then(() => {
                    setTimeout(() => {
                      cleanupAndRegister();
                    }, 2000 * installRetries);
                  });
                } else if (registration.installing?.state === 'activated') {
                  console.log('[SW Registration] Service worker activated successfully');
                }
              });
            } else if (registration.waiting) {
              // If there's a waiting worker, skip waiting
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          };
          
          checkInstallation();
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  console.log('[SW Registration] New service worker activated');
                } else if (newWorker.state === 'redundant') {
                  console.warn('[SW Registration] New service worker failed to install - will retry on next page load');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[SW Registration] Service worker registration failed:', error);
        });
    };
    
    // Start the cleanup and registration process
    cleanupAndRegister();
  }, []);

  return null; // This component doesn't render anything
}
