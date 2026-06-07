'use client';

import { useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import styles from './page.module.css';

export default function ContactPage() {
  const scrollRef = useScrollReveal();
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    company: '',
    type: 'smb',
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
    } catch (err) {
      console.error('[Contact] Submit error:', err);
      setFormError('Something went wrong sending your message. Please try again or email us at hello@autokkeep.com.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main ref={scrollRef}>
        <section className={`section ${styles.section}`} data-scroll-reveal>
          <div className={`container ${styles.container}`}>
            <div className="section-header">
              <div className="section-label">
                <span>📬</span> Contact
              </div>
              <h1 className="section-title">
                Let&apos;s <span className="text-gradient">Talk</span>
              </h1>
              <p className="section-subtitle">
                Whether you&apos;re a small business owner looking for financial clarity, an accounting professional exploring automation, or a startup founder tired of spreadsheets — we&apos;d love to connect.
              </p>
            </div>

            {!submitted ? (
              <>
              {formError && (
                <div className={`card ${styles.errorCard}`}>
                  <div className={`text-body ${styles.errorText}`}>⚠️ {formError}</div>
                </div>
              )}
              <form
                onSubmit={handleSubmit}
                className={`card-elevated ${styles.form}`}
              >
                <div className={styles.formFields}>
                  <div>
                    <label htmlFor="contact-name" className={`text-caption ${styles.label}`}>
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
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-email" className={`text-caption ${styles.label}`}>
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
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label htmlFor="contact-company" className={`text-caption ${styles.label}`}>
                      Company / Firm Name *
                    </label>
                    <input
                      id="contact-company"
                      name="company"
                      type="text"
                      className="input"
                      placeholder="Acme Corp"
                      value={formState.company}
                      onChange={handleChange}
                      required
                      autoComplete="organization"
                    />
                  </div>

                  <div className={styles.gridRow}>
                    <div>
                      <label htmlFor="contact-type" className={`text-caption ${styles.label}`}>
                        I Am A...
                      </label>
                      <select
                        id="contact-type"
                        name="type"
                        className="input"
                        value={formState.type}
                        onChange={handleChange}
                      >
                        <option value="smb">Small Business Owner</option>
                        <option value="startup">Startup Founder</option>
                        <option value="cpa">CPA / Accounting Firm</option>
                        <option value="investor">Investor</option>
                        <option value="partner">Potential Partner</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="contact-entities" className={`text-caption ${styles.label}`}>
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
                    <label htmlFor="contact-message" className={`text-caption ${styles.label}`}>
                      How can we help? *
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      className={`input ${styles.textarea}`}
                      placeholder="Tell us about your current financial workflow and what you're looking for..."
                      value={formState.message}
                      onChange={handleChange}
                      required
                      rows={5}
                    />
                  </div>

                  <button type="submit" className={`btn btn-primary btn-lg ${styles.submitBtn}`} disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>

                  <p className={`text-caption ${styles.responseNote}`}>
                    We typically respond within 24 hours on business days.
                  </p>
                </div>
              </form>
              </>
            ) : (
              <div className={`card-elevated ${styles.successCard}`}>
                <div className={styles.successIcon}>✅</div>
                <h2 className={`text-h3 ${styles.successTitle}`}>Message Received!</h2>
                <p className={`text-body ${styles.successBody}`}>
                  Thank you, {formState.name}. Our team will review your message and get back to you at {formState.email} within 24 hours.
                </p>
                <div className={styles.successActions}>
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
