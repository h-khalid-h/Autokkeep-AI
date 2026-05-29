'use client';

import React, { useState } from 'react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = () => {
    if (!email.trim()) return;
    setSubscribed(true);
  };

  if (subscribed) {
    return (
      <p className="text-body" style={{ color: 'var(--color-success, #22c55e)' }}>
        🎉 Thanks for subscribing! We&apos;ll keep you in the loop.
      </p>
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      maxWidth: '400px',
      margin: '0 auto',
    }}>
      <input
        type="email"
        className="input"
        placeholder="your@email.com"
        aria-label="Email for newsletter"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubscribe(); }}
      />
      <button className="btn btn-primary" onClick={handleSubscribe}>Subscribe</button>
    </div>
  );
}
