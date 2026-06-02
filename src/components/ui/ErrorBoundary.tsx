'use client';
import React, { Component, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className={styles.fallback}>
          <div className={styles.icon}>⚠️</div>
          <h3>Something went wrong</h3>
          <p className={styles.message}>{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
