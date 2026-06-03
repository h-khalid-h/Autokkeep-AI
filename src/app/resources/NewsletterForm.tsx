'use client';

import styles from './page.module.css';

export default function NewsletterForm() {
  return (
    <div className={`card-accent ${styles.newsletter}`}>
      <h3 className={`text-h3 ${styles.newsletterTitle}`}>
        Stay in the Loop
      </h3>
      <p className={`text-body ${styles.newsletterBody}`}>
        Get monthly insights on AI financial operations, accounting industry trends, and Autokkeep product updates.
      </p>
      <form
        className={styles.newsletterForm}
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="email"
          placeholder="your@email.com"
          className={styles.newsletterInput}
          aria-label="Email address for newsletter"
        />
        <button type="submit" className={styles.newsletterButton}>
          Subscribe
        </button>
      </form>
      <p className={styles.newsletterDisclaimer}>
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
