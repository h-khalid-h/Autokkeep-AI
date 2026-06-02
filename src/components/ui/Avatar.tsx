'use client';

import React, { forwardRef, useState } from 'react';
import Image from 'next/image';
import styles from './Avatar.module.css';

/* ─── Types ──────────────────────────────────── */
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type AvatarStatus = 'online' | 'offline' | 'away';

interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

/* ─── Size/status class maps ─────────────────── */
const sizeClasses: Record<AvatarSize, string> = {
  xs: styles.xs,
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  xl: styles.xl,
};

const statusSizeClasses: Record<AvatarSize, string> = {
  xs: styles.statusXs,
  sm: styles.statusSm,
  md: styles.statusMd,
  lg: styles.statusLg,
  xl: styles.statusXl,
};

const statusColorClasses: Record<AvatarStatus, string> = {
  online: styles.online,
  offline: styles.offline,
  away: styles.away,
};

/* ─── Component ──────────────────────────────── */
const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt = '', fallback, size = 'md', status, className }, ref) => {
    const [imgError, setImgError] = useState(false);
    const showImage = src && !imgError;

    const avatarClasses = [styles.avatar, sizeClasses[size]]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={[styles.wrapper, className].filter(Boolean).join(' ')}
        role="img"
        aria-label={alt || fallback || 'Avatar'}
      >
        <div className={avatarClasses}>
          {showImage ? (
            <Image
              className={styles.image}
              src={src}
              alt={alt}
              fill
              sizes="48px"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className={styles.initials}>
              {fallback ? fallback.slice(0, 2) : '?'}
            </span>
          )}
        </div>
        {status && (
          <span
            className={[
              styles.status,
              statusSizeClasses[size],
              statusColorClasses[status],
            ].join(' ')}
            aria-label={status}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export { Avatar };
export type { AvatarProps, AvatarSize, AvatarStatus };
