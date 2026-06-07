import styles from './developers.module.css';

export default function DevelopersLoading() {
  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.skeletonLine} style={{ width: '60%', height: 24 }} />
        </div>
        <div className={styles.sidebarNav}>
          {[75, 85, 70, 90, 80, 72].map((width, i) => (
            <div
              key={i}
              className={styles.skeletonLine}
              style={{ width: `${width}%`, height: 16, margin: '8px 16px' }}
            />
          ))}
        </div>
      </aside>
      <main className={styles.content}>
        <div className={styles.skeletonLine} style={{ width: '40%', height: 36, marginBottom: 16 }} />
        <div className={styles.skeletonLine} style={{ width: '70%', height: 18, marginBottom: 32 }} />
        <div className={styles.skeletonLine} style={{ width: '100%', height: 200, marginBottom: 24 }} />
        <div className={styles.skeletonLine} style={{ width: '100%', height: 200 }} />
      </main>
    </div>
  );
}
