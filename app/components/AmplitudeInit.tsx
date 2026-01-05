'use client';

import { useEffect } from 'react';
import * as amplitude from '@amplitude/analytics-browser';

export default function AmplitudeInit() {
  useEffect(() => {
    // Ensure this only runs on the client
    if (typeof window === 'undefined') {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
    
    if (!apiKey) {
      console.warn('Amplitude API key not found. Analytics will not be initialized.');
      return;
    }

    // Initialize Amplitude with EU server zone and autocapture for sessions/pageViews
    // Explicitly NOT enabling: Session Replay, click/form autocapture, user identity
    const initAmplitude = async () => {
      try {
        await amplitude.init(apiKey, undefined, {
          serverZone: 'EU',
          autocapture: {
            sessions: true,
            pageViews: true,
          },
          logLevel: amplitude.Types.LogLevel.Debug,
        }).promise;

        console.info('[Amplitude] initialized', { hasKey: true, serverZone: 'EU' });

        // Temporary sanity-check event after init
        amplitude.track('Amplitude Debug Event', { path: window.location.pathname });
      } catch (error) {
        console.error('[Amplitude] initialization failed:', error);
      }
    };

    initAmplitude();
  }, []);

  // This component renders nothing
  return null;
}

