'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BuildDigestButton() {
  const [isBuilding, setIsBuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleBuild = async () => {
    setIsBuilding(true);
    setMessage(null);

    try {
      const response = await fetch('/api/build-digest', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.ok) {
        setMessage(`Success! Built digest for ${data.weekLabel}.`);
        // Refresh the page after a short delay to show the new digest
        setTimeout(() => {
          router.refresh();
        }, 1500);
      } else {
        setMessage(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Build digest error:', error);
      setMessage(`Error: ${error instanceof Error ? error.message : 'Failed to build digest'}`);
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleBuild}
        disabled={isBuilding}
        className="text-xs text-white hover:text-gray-200 underline bg-transparent border-none cursor-pointer p-0 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          fontSize: '0.75rem',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}
      >
        {isBuilding ? 'Building...' : 'Build digest'}
      </button>
      {message && (
        <p
          className="mt-1 text-xs"
          style={{
            color: message.startsWith('Success') ? '#10b981' : '#ef4444',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

