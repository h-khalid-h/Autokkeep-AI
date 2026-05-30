'use client';

import React, { useState } from 'react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async () => {
    if (!email.trim() || !email.includes('@')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Newsletter Subscriber',
          email,
          message: 'Subscribed via newsletter form',
          source: 'newsletter',
        }),
      });
      if (!res.ok) throw new Error('Failed to subscribe');
      setSubscribed(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (subscribed) {
    return (
      <p className="text-body" style={{ color: 'var(--success)' }}>
        🎉 Thanks for subscribing! We&apos;ll keep you in the loop.
      </p>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '400px',
      margin: '0 auto',
    }}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <input
          type="email"
          className="input"
          placeholder="your@email.com"
          aria-label="Email for newsletter"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubscribe(); }}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? '...' : 'Subscribe'}
        </button>
      </div>
      {error && (
        <p className="text-caption" style={{ color: 'var(--destructive)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
