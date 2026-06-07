import styles from '../shared-loading.module.css';

export default function Loading() {
  return (
    <div className={styles.loadingPage}>
      <div className={styles.spinner} />
      <p className={styles.loadingText}>Loading notifications...</p>
    </div>
  );
}
