import { Card, Skeleton } from '@/components/ui';
import styles from './observability.module.css';

export default function ObservabilityLoading() {
  return (
    <div className={styles.loadingPage}>
      {/* Header skeleton */}
      <div className={styles.loadingHeader}>
        <Skeleton width={200} height={14} />
        <Skeleton width={320} height={32} />
        <Skeleton width={400} height={16} />
      </div>

      {/* KPI grid skeleton */}
      <div className={styles.loadingGrid}>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} variant="elevated">
            <div className={styles.skeletonCardInner}>
              <Skeleton width="60%" height={14} />
              <Skeleton width={80} height={32} />
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs skeleton */}
      <Card>
        <Skeleton width={240} height={36} />
      </Card>

      {/* Table skeleton */}
      <Card>
        <div className={styles.skeletonStack}>
          <Skeleton width="100%" height={40} />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width="100%" height={32} />
          ))}
        </div>
      </Card>
    </div>
  );
}
