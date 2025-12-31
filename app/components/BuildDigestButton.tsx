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
        setMessage(`Success! Built digest for ${data.monthLabel}.`);
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
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={handleBuild}
        disabled={isBuilding}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          backgroundColor: isBuilding ? '#ccc' : '#0066cc',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: isBuilding ? 'not-allowed' : 'pointer',
          fontWeight: '500',
        }}
      >
        {isBuilding ? 'Building...' : 'Build latest digest'}
      </button>
      {message && (
        <p
          style={{
            marginTop: '0.5rem',
            color: message.startsWith('Success') ? '#006600' : '#cc0000',
            fontSize: '0.9rem',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

