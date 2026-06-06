'use client';

import React from 'react';
import styles from './TransactionNotes.module.css';

interface TransactionNotesProps {
  transactionId: string;
  initialNotes: string;
  /** Called after a successful save so the parent can update its state */
  onSaved?: (newNotes: string) => void;
}

const TransactionNotes: React.FC<TransactionNotesProps> = ({
  transactionId,
  initialNotes,
  onSaved,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(initialNotes);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showSaved, setShowSaved] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea when editing starts
  React.useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
    setShowSaved(false);
  };

  const handleCancel = () => {
    setDraft(initialNotes);
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    const trimmed = draft.trim();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: trimmed }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error || `Save failed (${res.status})`);
        return;
      }

      setIsEditing(false);
      setShowSaved(true);
      onSaved?.(trimmed);

      // Fade out the confirmation after 2 seconds
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    } catch {
      setError('Network error — could not save notes');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Enter to save
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const displayNotes = initialNotes;
  const hasNotes = displayNotes.length > 0;

  return (
    <div className={styles.container} aria-label="Transaction notes">
      {/* Header */}
      <div className={styles.header}>
        <h3 className="text-caption" aria-hidden="true">
          NOTES
        </h3>
        <div className={styles.headerActions}>
          {showSaved && (
            <span className={styles.savedBadge} aria-live="polite">
              ✓ Saved
            </span>
          )}
          {!isEditing && (
            <button
              className={styles.editButton}
              onClick={handleEdit}
              aria-label="Edit notes"
              type="button"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isEditing ? (
        <div className={styles.editArea}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note about this transaction…"
            rows={3}
            maxLength={2000}
            disabled={saving}
            aria-label="Transaction notes"
          />
          <div className={styles.editActions}>
            <span className={styles.hint}>
              ⌘+Enter to save · Esc to cancel
            </span>
            <div className={styles.editButtons}>
              <button
                className={styles.cancelButton}
                onClick={handleCancel}
                disabled={saving}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.saveButton}
                onClick={handleSave}
                disabled={saving}
                type="button"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className={styles.display}>
          {hasNotes ? (
            <p className={styles.notesText}>{displayNotes}</p>
          ) : (
            <button
              className={styles.emptyState}
              onClick={handleEdit}
              type="button"
            >
              No notes yet. Click to add.
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionNotes;
