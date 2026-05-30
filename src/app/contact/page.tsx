'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    company: '',
    type: 'cpa',
    entities: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormState((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formState.name,
          email: formState.email,
          company: formState.company,
          type: formState.type,
          entityCount: formState.entities,
          message: formState.message,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      setSubmitted(true);
    } catch {
      setFormError('Something went wrong sending your message. Please try again or email us at hello@autokkeep.com.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main>
        <section className="section" style={{ paddingTop: 'calc(var(--header-height) + 80px)' }}>
          <div className="container" style={{ maxWidth: '700px' }}>
            <div className="section-header">
              <div className="section-label">
                <span>📬</span> Contact
              </div>
              <h1 className="section-title">
                Let&apos;s <span className="text-gradient">Talk</span>
              </h1>
              <p className="section-subtitle">
                Whether you&apos;re a CPA firm exploring automation, a startup founder tired of spreadsheets, or an investor evaluating the space — we&apos;d love to connect.
              </p>
            </div>

            {!submitted ? (
              <>
              {formError && (
                <div className="card" style={{ padding: '12px 16px', marginBottom: '16px', borderLeft: '4px solid var(--color-error, #ef4444)', maxWidth: '560px', margin: '0 auto 16px' }}>
                  <div className="text-body" style={{ color: 'var(--color-error, #ef4444)' }}>⚠️ {formError}</div>
                </div>
              )}
              <form
                onSubmit={handleSubmit}
                className="card-elevated"
                style={{ padding: '40px', maxWidth: '560px', margin: '0 auto' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label htmlFor="contact-name" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                      Full Name *
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      className="input"
                      placeholder="Jane Smith"
                      value={formState.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-email" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                      Work Email *
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      className="input"
                      placeholder="jane@firmname.com"
                      value={formState.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-company" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                      Company / Firm Name *
                    </label>
                    <input
                      id="contact-company"
                      name="company"
                      type="text"
                      className="input"
                      placeholder="Smith & Partners CPA"
                      value={formState.company}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label htmlFor="contact-type" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                        I Am A...
                      </label>
                      <select
                        id="contact-type"
                        name="type"
                        className="input"
                        value={formState.type}
                        onChange={handleChange}
                      >
                        <option value="cpa">CPA / Accounting Firm</option>
                        <option value="startup">Startup Founder</option>
                        <option value="smb">SMB Owner</option>
                        <option value="investor">Investor</option>
                        <option value="partner">Potential Partner</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="contact-entities" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                        # of Entities / Clients
                      </label>
                      <input
                        id="contact-entities"
                        name="entities"
                        type="text"
                        className="input"
                        placeholder="e.g., 50"
                        value={formState.entities}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                      How can we help? *
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      className="input"
                      placeholder="Tell us about your current bookkeeping workflow and what you're looking for..."
                      value={formState.message}
                      onChange={handleChange}
                      required
                      rows={5}
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>

                  <p className="text-caption" style={{ textAlign: 'center' }}>
                    We typically respond within 24 hours on business days.
                  </p>
                </div>
              </form>
              </>
            ) : (
              <div className="card-elevated" style={{
                padding: '60px 40px',
                textAlign: 'center',
                maxWidth: '560px',
                margin: '0 auto',
                animation: 'slide-up-fade 0.4s ease forwards',
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
                <h2 className="text-h3" style={{ marginBottom: '8px' }}>Message Received!</h2>
                <p className="text-body" style={{ marginBottom: '24px' }}>
                  Thank you, {formState.name}. Our team will review your message and get back to you at {formState.email} within 24 hours.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <Link href="/" className="btn btn-secondary">Back to Home</Link>
                  <Link href="/dashboard" className="btn btn-primary">Try Dashboard Demo</Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
