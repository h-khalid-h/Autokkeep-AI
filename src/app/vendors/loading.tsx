import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Skeleton variant="rect" width="200px" height={32} />
      <Skeleton variant="rect" width="100%" height={48} />
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} variant="rect" width="100%" height={56} />
      ))}
    </div>
  );
}
