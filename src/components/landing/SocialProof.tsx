import styles from './SocialProof.module.css';

export default function SocialProof() {
  return (
    <section className={styles.section} id="social-proof">
      <div className={styles.container}>
        <p className={styles.trustText}>
          Trusted by{' '}
          <span className={styles.trustHighlight}>250+ firms</span>{' '}
          managing{' '}
          <span className={styles.trustHighlight}>$180M+</span>{' '}
          in transactions
        </p>
        <div className={styles.divider} />
      </div>
    </section>
  );
}
