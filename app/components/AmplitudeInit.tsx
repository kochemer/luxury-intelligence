'use client';

import { useEffect, useRef } from 'react';
import * as amplitude from '@amplitude/unified';

export default function AmplitudeInit() {
  const initializedRef = useRef(false);

  useEffect(() => {
    // Ensure this only runs on the client
    if (typeof window === 'undefined') {
      return;
    }

    // Ensure amplitude is only initialized once during the lifecycle of the application
    if (initializedRef.current) {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || '2f72d6d40500d170bda25421e23d7975';
    
    if (!apiKey) {
      console.warn('Amplitude API key not found. Analytics will not be initialized.');
      return;
    }

    // Initialize Amplitude Analytics and Session Replay with EU server zone
    try {
      amplitude.initAll(apiKey, {
        serverZone: 'EU',
        analytics: {
          autocapture: true,
          defaultTracking: {
            pageViews: true,
            sessions: true,
          },
        },
        sessionReplay: {
          sampleRate: 1,
        },
      });

      initializedRef.current = true;
      console.info('[Amplitude] initialized with Analytics and Session Replay', { 
        hasKey: true, 
        serverZone: 'EU',
        analytics: true,
        sessionReplay: true,
      });
    } catch (error) {
      console.error('[Amplitude] initialization failed:', error);
    }
  }, []);

  // This component renders nothing
  return null;
}

