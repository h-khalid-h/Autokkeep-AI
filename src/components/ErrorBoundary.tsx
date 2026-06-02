'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '@/lib/sentry';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureException(error, {
      tags: { 
        boundary: 'component',
        component: this.props.componentName || 'unknown',
      },
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={styles.fallback}>
          <div className={styles.icon}>⚠️</div>
          <h3 className={styles.title}>
            Something went wrong
          </h3>
          <p className={styles.message}>
            {this.props.componentName 
              ? `The ${this.props.componentName} component encountered an error.`
              : 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className={styles.retryBtn}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
