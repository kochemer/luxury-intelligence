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

    // Initialize Amplitude with sessions and pageViews tracking only
    // Explicitly NOT enabling: Session Replay, click/form autocapture, user identity
    amplitude.init(apiKey, undefined, {
      defaultTracking: {
        sessions: true,
        pageViews: true,
      },
    });
  }, []);

  // This component renders nothing
  return null;
}

