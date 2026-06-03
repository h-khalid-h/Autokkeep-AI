'use client';

import { Card, Skeleton } from '@/components/ui';
import styles from '../page.module.css';

export default function CardSkeletonBlock() {
  return (
    <Card>
      <div className={styles.skeletonCardInner}>
        <Skeleton width="40%" height={24} />
        <Skeleton width="80%" />
        <Skeleton width="60%" />
      </div>
    </Card>
  );
}
