'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Notification {
  id: string;
  type: 'transaction' | 'sync' | 'receipt' | 'review' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

const NOTIFICATION_ICONS: Record<Notification['type'], string> = {
  transaction: '💳',
  sync: '🔄',
  receipt: '🧾',
  review: '⚠️',
  system: '🔔',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getMockNotifications(): Notification[] {
  const now = Date.now();
  return [
    {
      id: 'n1',
      type: 'transaction',
      title: 'New transaction imported',
      message: '12 transactions from Chase Business ••4821',
      timestamp: new Date(now - 15 * 60000).toISOString(),
      read: false,
    },
    {
      id: 'n2',
      type: 'transaction',
      title: 'Transaction auto-categorized',
      message: 'AWS $1,247.00 → Cloud Infrastructure (6210)',
      timestamp: new Date(now - 45 * 60000).toISOString(),
      read: false,
    },
    {
      id: 'n3',
      type: 'review',
      title: 'Transaction flagged for review',
      message: 'Unusual $3,500 charge from unknown vendor',
      timestamp: new Date(now - 2 * 3600000).toISOString(),
      read: false,
    },
    {
      id: 'n4',
      type: 'sync',
      title: 'Bank sync completed',
      message: 'Chase Business account synced successfully',
      timestamp: new Date(now - 5 * 3600000).toISOString(),
      read: true,
    },
    {
      id: 'n5',
      type: 'receipt',
      title: 'Receipt captured',
      message: 'Receipt matched to Uber $34.50 on May 24',
      timestamp: new Date(now - 8 * 3600000).toISOString(),
      read: true,
    },
  ];
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const bellRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setNotifications(getMockNotifications());
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus management when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  // Focus the active item when focusedIndex changes
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const visibleNotifications = notifications.slice(0, 5);
    // Include "Mark all as read" button as the last focusable item
    const hasMarkAllButton = notifications.length > 0 && notifications.some(n => !n.read);
    const totalItems = visibleNotifications.length + (hasMarkAllButton ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
          itemRefs.current[focusedIndex]?.click();
        }
        break;
    }
  }, [notifications]);

  return (
    <div ref={bellRef} style={{ position: 'relative' }}>
      <button
        onClick={toggleDropdown}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-glass)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              minWidth: '16px',
              height: '16px',
              borderRadius: '9999px',
              background: 'var(--destructive, #dc3c3c)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          onKeyDown={handleKeyDown}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '340px',
            background: 'var(--bg-surface, #1a1a2e)',
            border: '1px solid var(--border-primary, rgba(255,255,255,0.08))',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            overflow: 'hidden',
            zIndex: 1000,
            animation: 'bellDropdownFadeIn 0.15s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Notifications
            </span>
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                {unreadCount} new
              </span>
            )}
          </div>

          {/* Notification List */}
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}>✨</span>
                All caught up! No new notifications.
              </div>
            ) : (
              notifications.slice(0, 5).map((notif, index) => (
                <div
                  key={notif.id}
                  role="menuitem"
                  tabIndex={-1}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: notif.read ? 'transparent' : 'rgba(30, 111, 255, 0.04)',
                    transition: 'background 0.15s ease',
                    cursor: 'pointer',
                    outline: focusedIndex === index ? '2px solid var(--accent-primary)' : 'none',
                    outlineOffset: '-2px',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = notif.read
                      ? 'transparent'
                      : 'rgba(30, 111, 255, 0.04)')
                  }
                >
                  {/* Icon */}
                  <span
                    style={{
                      fontSize: '16px',
                      flexShrink: 0,
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--bg-elevated)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {NOTIFICATION_ICONS[notif.type]}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '2px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: notif.read ? 500 : 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {notif.title}
                      </span>
                      {!notif.read && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--accent-primary)',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {notif.message}
                    </p>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        marginTop: '4px',
                        display: 'block',
                      }}
                    >
                      {timeAgo(notif.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && unreadCount > 0 && (
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <button
                onClick={markAllAsRead}
                role="menuitem"
                tabIndex={-1}
                ref={(el) => { itemRefs.current[notifications.slice(0, 5).length] = el as any; }}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--accent-subtle)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes bellDropdownFadeIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
