import styles from '../shared-loading.module.css';

export default function AdminLoading() {
  return (
    <div className={styles.loadingPage}>
      <div className={styles.spinner} />
      <p className={styles.loadingText}>Loading admin dashboard…</p>
    </div>
  );
}
