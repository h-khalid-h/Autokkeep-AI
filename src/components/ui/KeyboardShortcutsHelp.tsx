'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui';
import styles from './KeyboardShortcutsHelp.module.css';

/* ─── Shortcut groups ───────────────────────── */
const shortcutGroups = [
  {
    title: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['⌘', 'B'], description: 'Toggle sidebar' },
      { keys: ['⌘', '/'], description: 'Keyboard shortcuts' },
      { keys: ['?'], description: 'Keyboard shortcuts' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'T'], description: 'Go to Transactions' },
      { keys: ['G', 'I'], description: 'Go to Insights' },
      { keys: ['G', 'C'], description: 'Go to Close' },
      { keys: ['G', 'H'], description: 'Go to Health' },
      { keys: ['G', 'X'], description: 'Go to Tax' },
      { keys: ['G', 'A'], description: 'Go to Analytics' },
      { keys: ['G', 'L'], description: 'Go to GL Codes' },
      { keys: ['G', 'P'], description: 'Go to Portfolio' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
    ],
  },
  {
    title: 'Dashboard (Transaction Review)',
    shortcuts: [
      { keys: ['A'], description: 'Accept current transaction' },
      { keys: ['C'], description: 'Open category picker' },
      { keys: ['↑'], description: 'Previous transaction' },
      { keys: ['↓'], description: 'Next transaction' },
      { keys: ['E'], description: 'Toggle AI reasoning' },
      { keys: ['Esc'], description: 'Close modal / dropdown' },
    ],
  },
];

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('autokkeep-show-shortcuts', handler);
    return () => window.removeEventListener('autokkeep-show-shortcuts', handler);
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Keyboard Shortcuts" size="md">
      <div className={styles.container}>
        {shortcutGroups.map((group) => (
          <div key={group.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <div className={styles.list}>
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.description} className={styles.row}>
                  <span className={styles.description}>{shortcut.description}</span>
                  <span className={styles.keys}>
                    {shortcut.keys.map((key, i) => (
                      <span key={i}>
                        <kbd className={styles.kbd}>{key}</kbd>
                        {i < shortcut.keys.length - 1 && (
                          <span className={styles.separator}>then</span>
                        )}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
