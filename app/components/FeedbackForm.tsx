'use client';

import { useState, FormEvent, useMemo } from 'react';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function FeedbackForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Read form action from client-safe environment variable
  // NEXT_PUBLIC_* vars are injected at build time by Next.js
  // Use useMemo to ensure it's only read once and doesn't cause re-renders
  const formAction = useMemo(() => {
    try {
      // Safely access process.env - NEXT_PUBLIC_* vars are replaced at build time
      // Use a safe access pattern that works in all environments
      let envVar: string | undefined;
      if (typeof process !== 'undefined') {
        try {
          envVar = process.env?.NEXT_PUBLIC_FEEDBACK_FORM_ACTION;
        } catch {
          // process.env access failed, use undefined
          envVar = undefined;
        }
      }
      return (typeof envVar === 'string' && envVar.trim()) ? envVar.trim() : '';
    } catch {
      // Any error during env var access - return empty string
      return '';
    }
  }, []);

  // Show configuration error if env var is missing
  if (!formAction) {
    return (
      <div style={{
        background: '#fff1e2',
        border: '1.5px dashed #ffdfa9',
        borderRadius: 8,
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '1.2rem',
          color: '#913d00',
          fontWeight: 600,
          marginBottom: '0.5rem',
        }}>
          Feedback form not configured.
        </div>
        <p style={{
          fontSize: '1rem',
          color: '#913d00',
          lineHeight: 1.6,
          margin: 0,
        }}>
          Please set the NEXT_PUBLIC_FEEDBACK_FORM_ACTION environment variable.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate required field
    if (!message.trim()) {
      setState('error');
      setErrorMessage('Please enter a message.');
      return;
    }


    setState('submitting');
    setErrorMessage('');

    try {
      const formData = new FormData();
      if (name.trim()) formData.append('name', name.trim());
      if (email.trim()) formData.append('email', email.trim());
      formData.append('message', message.trim());

      const response = await fetch(formAction, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        setState('success');
        setName('');
        setEmail('');
        setMessage('');
      } else {
        const data = await response.json().catch(() => ({}));
        setState('error');
        setErrorMessage(data.error || `Failed to submit. Status: ${response.status}`);
      }
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Network error. Please try again.');
    }
  };

  if (state === 'success') {
    return (
      <div style={{
        background: '#f0f9f4',
        border: '2px solid #86efac',
        borderRadius: 12,
        padding: '2.5rem',
        textAlign: 'center',
        boxShadow: '0 2px 12px 0 rgba(22, 101, 52, 0.08)',
      }}>
        <div style={{
          fontSize: '3rem',
          marginBottom: '1rem',
        }}>
          ✓
        </div>
        <div style={{
          fontSize: '1.8rem',
          color: '#166534',
          fontWeight: 600,
          marginBottom: '0.75rem',
        }}>
          Thank you!
        </div>
        <p style={{
          fontSize: '1.05rem',
          color: '#15803d',
          lineHeight: 1.7,
          margin: '0 0 2rem 0',
        }}>
          Your feedback has been submitted successfully. We'll review it and get back to you if needed.
        </p>
        <button
          onClick={() => setState('idle')}
          style={{
            fontWeight: 600,
            color: '#166534',
            background: '#fff',
            borderRadius: 8,
            padding: '0.75rem 2rem',
            border: '2px solid #86efac',
            cursor: 'pointer',
            fontSize: '1rem',
            transition: 'background 0.19s, transform 0.1s',
            boxShadow: '0 2px 8px 0 rgba(22, 101, 52, 0.15)',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Submit Another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '1.75rem' }}>
        <label
          htmlFor="name"
          style={{
            display: 'block',
            fontSize: '1rem',
            fontWeight: 500,
            color: '#233442',
            marginBottom: '0.5rem',
          }}
        >
          Name <span style={{ color: '#8a99ac', fontWeight: 400, fontSize: '0.95rem' }}>(optional)</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%',
            padding: '0.875rem',
            fontSize: '1rem',
            border: '1px solid #e7ecf0',
            borderRadius: 8,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#20678c';
            e.target.style.boxShadow = '0 0 0 3px rgba(32, 103, 140, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e7ecf0';
            e.target.style.boxShadow = 'none';
          }}
          disabled={state === 'submitting'}
        />
      </div>

      <div style={{ marginBottom: '1.75rem' }}>
        <label
          htmlFor="email"
          style={{
            display: 'block',
            fontSize: '1rem',
            fontWeight: 500,
            color: '#233442',
            marginBottom: '0.5rem',
          }}
        >
          Email <span style={{ color: '#8a99ac', fontWeight: 400, fontSize: '0.95rem' }}>(optional)</span>
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: '0.875rem',
            fontSize: '1rem',
            border: '1px solid #e7ecf0',
            borderRadius: 8,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#20678c';
            e.target.style.boxShadow = '0 0 0 3px rgba(32, 103, 140, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e7ecf0';
            e.target.style.boxShadow = 'none';
          }}
          disabled={state === 'submitting'}
        />
      </div>

      <div style={{ marginBottom: '1.75rem' }}>
        <label
          htmlFor="message"
          style={{
            display: 'block',
            fontSize: '1rem',
            fontWeight: 500,
            color: '#233442',
            marginBottom: '0.5rem',
          }}
        >
          Message <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={7}
          style={{
            width: '100%',
            padding: '0.875rem',
            fontSize: '1rem',
            border: '1px solid #e7ecf0',
            borderRadius: 8,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            outline: 'none',
            lineHeight: 1.6,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#20678c';
            e.target.style.boxShadow = '0 0 0 3px rgba(32, 103, 140, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e7ecf0';
            e.target.style.boxShadow = 'none';
          }}
          disabled={state === 'submitting'}
        />
      </div>

      <div style={{
        background: '#f4f7fa',
        borderLeft: '4px solid #3a7b9c',
        borderRadius: 4,
        padding: '1rem 1.25rem',
        marginBottom: '1.75rem',
      }}>
        <p style={{
          fontSize: '0.95rem',
          color: '#5c6880',
          lineHeight: 1.6,
          margin: 0,
        }}>
          <strong style={{ color: '#233442' }}>Note:</strong> Submissions go directly to the site owner. No login required.
        </p>
      </div>

      {state === 'error' && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          padding: '1.25rem',
          marginBottom: '1.75rem',
        }}>
          <div style={{
            fontSize: '1rem',
            color: '#dc2626',
            fontWeight: 600,
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span>⚠</span> Error
          </div>
          <div style={{
            fontSize: '0.95rem',
            color: '#991b1b',
            lineHeight: 1.6,
          }}>
            {errorMessage}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={state === 'submitting'}
        style={{
          fontWeight: 600,
          color: '#fff',
          background: state === 'submitting' ? '#8a99ac' : '#20678c',
          borderRadius: 8,
          padding: '0.875rem 2rem',
          border: 'none',
          cursor: state === 'submitting' ? 'not-allowed' : 'pointer',
          fontSize: '1.1rem',
          transition: 'background 0.19s, transform 0.1s, box-shadow 0.19s',
          width: '100%',
          boxShadow: state === 'submitting' ? 'none' : '0 2px 8px 0 rgba(32, 103, 140, 0.2)',
        }}
        onMouseDown={(e) => {
          if (state !== 'submitting') {
            e.currentTarget.style.transform = 'scale(0.98)';
          }
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {state === 'submitting' ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </form>
  );
}

