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

    // Suppress Amplitude console errors by temporarily overriding console.error
    const originalConsoleError = console.error;
    const errorSuppressionTimeout = setTimeout(() => {
      // Restore console.error after a short delay to allow Amplitude to initialize
      console.error = originalConsoleError;
    }, 2000);

    // Temporarily suppress Amplitude-related errors
    console.error = (...args: any[]) => {
      const errorString = args.join(' ');
      // Only suppress errors that appear to be from Amplitude SDK
      if (errorString.includes('amplitude') || errorString.includes('Amplitude') || 
          errorString.includes('@amplitude') || errorString.includes('Destination')) {
        // Silently ignore Amplitude SDK errors
        return;
      }
      // Pass through other errors
      originalConsoleError.apply(console, args);
    };

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

      // Restore console.error after initialization
      clearTimeout(errorSuppressionTimeout);
      console.error = originalConsoleError;
    } catch (error: any) {
      // Restore console.error on error
      clearTimeout(errorSuppressionTimeout);
      console.error = originalConsoleError;
      // Silently handle synchronous errors during initialization
      console.warn('[Amplitude] initialization warning (non-critical):', error?.message || error);
    }

    // Cleanup: restore console.error if component unmounts
    return () => {
      clearTimeout(errorSuppressionTimeout);
      console.error = originalConsoleError;
    };
  }, []);

  // This component renders nothing
  return null;
}

