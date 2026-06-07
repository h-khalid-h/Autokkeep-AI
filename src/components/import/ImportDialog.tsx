'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { Button, useToast } from '@/components/ui';
import styles from './import-dialog.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: ImportResult) => void;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  row?: number;
}

type ImportStage = 'upload' | 'preview' | 'importing' | 'done';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'));
  const rows = lines.slice(1).map((line) =>
    line.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'))
  );
  return { headers, rows };
}

function validateCSV(headers: string[], rows: string[][]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requiredHeaders = ['date', 'amount', 'description'];

  for (const req of requiredHeaders) {
    if (!headers.some((h) => h.toLowerCase() === req)) {
      issues.push({ type: 'error', message: `Missing required column: "${req}"` });
    }
  }

  if (rows.length === 0) {
    issues.push({ type: 'warning', message: 'File contains no data rows' });
  }

  if (rows.length > 10000) {
    issues.push({ type: 'warning', message: `Large file: ${rows.length} rows. Import may take a while.` });
  }

  // Check for empty required fields in first few rows
  const dateIdx = headers.findIndex((h) => h.toLowerCase() === 'date');
  const amountIdx = headers.findIndex((h) => h.toLowerCase() === 'amount');

  rows.slice(0, 10).forEach((row, i) => {
    if (dateIdx >= 0 && !row[dateIdx]) {
      issues.push({ type: 'error', message: `Row ${i + 2}: Empty date field`, row: i + 2 });
    }
    if (amountIdx >= 0 && row[amountIdx] && isNaN(parseFloat(row[amountIdx]))) {
      issues.push({ type: 'error', message: `Row ${i + 2}: Invalid amount "${row[amountIdx]}"`, row: i + 2 });
    }
  });

  return issues;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function ImportDialog({ isOpen, onClose, onSuccess }: ImportDialogProps) {
  const { selectedEntity } = useEntity();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<ImportStage>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStage('upload');
        setFile(null);
        setCsvHeaders([]);
        setCsvRows([]);
        setValidationIssues([]);
        setProgress(0);
        setResult(null);
      }, 300);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && stage !== 'importing') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose, stage]);

  // ── File handling ─────────────────────────────────────────────────────────
  const processFile = useCallback(async (f: File) => {
    setFile(f);

    if (!f.name.endsWith('.csv')) {
      setValidationIssues([{ type: 'error', message: 'Only CSV files are supported' }]);
      setStage('preview');
      return;
    }

    try {
      const text = await f.text();
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);

      const issues = validateCSV(headers, rows);
      setValidationIssues(issues);
      setStage('preview');
    } catch {
      setValidationIssues([{ type: 'error', message: 'Failed to parse CSV file' }]);
      setStage('preview');
    }
  }, []);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) processFile(droppedFile);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!file || !selectedEntity) return;

    const hasErrors = validationIssues.some((v) => v.type === 'error');
    if (hasErrors) {
      toast.error('Please fix validation errors before importing');
      return;
    }

    setStage('importing');
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityId', selectedEntity.id);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + Math.random() * 15, 90));
      }, 500);

      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Import failed (HTTP ${res.status})`);
      }

      const data: ImportResult = await res.json();
      setProgress(100);
      setResult(data);
      setStage('done');
      toast.success(`Imported ${data.imported} records`);
      onSuccess?.(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      toast.error(msg);
      setStage('preview');
      setProgress(0);
    }
  }, [file, selectedEntity, validationIssues, toast, onSuccess]);

  if (!isOpen) return null;

  const hasErrors = validationIssues.some((v) => v.type === 'error');

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget && stage !== 'importing') onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-label="Import Transactions" aria-modal="true">
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>📥 Import Transactions</span>
          <button
            className={styles.closeButton}
            onClick={onClose}
            disabled={stage === 'importing'}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Upload Stage */}
          {stage === 'upload' && (
            <div
              className={isDragOver ? styles.dropZoneActive : styles.dropZone}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.dropZoneIcon}>📄</div>
              <div className={styles.dropZoneTitle}>Drop your CSV file here</div>
              <div className={styles.dropZoneSubtitle}>
                or <span className={styles.dropZoneLink}>browse to upload</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className={styles.fileInput}
                onChange={handleFileInput}
              />
            </div>
          )}

          {/* Preview / Done stages */}
          {(stage === 'preview' || stage === 'importing' || stage === 'done') && file && (
            <>
              {/* Selected File */}
              <div className={styles.selectedFile}>
                <span className={styles.fileIcon}>📄</span>
                <div className={styles.fileInfo}>
                  <div className={styles.fileName}>{file.name}</div>
                  <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
                </div>
                {stage === 'preview' && (
                  <button
                    className={styles.removeFile}
                    onClick={() => { setFile(null); setStage('upload'); setCsvHeaders([]); setCsvRows([]); setValidationIssues([]); }}
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Validation Issues */}
              {validationIssues.length > 0 && (
                <div className={styles.validationSection}>
                  {validationIssues.map((issue, i) =>
                    issue.type === 'error' ? (
                      <div key={i} className={styles.validationError}>
                        <span className={styles.validationErrorIcon}>✕</span>
                        <span className={styles.validationErrorText}>{issue.message}</span>
                      </div>
                    ) : (
                      <div key={i} className={styles.validationWarning}>
                        <span className={styles.validationWarningIcon}>⚠</span>
                        <span className={styles.validationWarningText}>{issue.message}</span>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Preview Table */}
              {csvHeaders.length > 0 && csvRows.length > 0 && (
                <div className={styles.previewSection}>
                  <div className={styles.previewTitle}>Data Preview</div>
                  <div className={styles.previewMeta}>
                    Showing first {Math.min(5, csvRows.length)} of {csvRows.length} rows • {csvHeaders.length} columns
                  </div>
                  <div className={styles.previewTableWrapper}>
                    <table className={styles.previewTable}>
                      <thead>
                        <tr>
                          {csvHeaders.map((h, i) => <th key={i}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 5).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => <td key={ci} title={cell}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Progress */}
              {(stage === 'importing' || stage === 'done') && (
                <div className={styles.progressSection}>
                  <div className={styles.progressLabel}>
                    <span className={styles.progressText}>
                      {stage === 'done' ? 'Import complete!' : 'Importing...'}
                    </span>
                    <span className={styles.progressPercent}>{Math.round(progress)}%</span>
                  </div>
                  <div className={`${styles.progressBar} ${stage === 'done' ? styles.progressSuccess : ''}`}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {/* Result Summary */}
              {stage === 'done' && result && (
                <div className={styles.previewSection}>
                  <div className={styles.previewMeta}>
                    ✅ {result.imported} imported • ⏭️ {result.skipped} skipped • ❌ {result.errors.length} errors
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {stage === 'preview' && (
            <>
              <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleImport}
                disabled={hasErrors || !file}
              >
                🚀 Import {csvRows.length > 0 ? `${csvRows.length} rows` : ''}
              </Button>
            </>
          )}
          {stage === 'done' && (
            <Button variant="primary" size="md" onClick={onClose}>Done</Button>
          )}
          {stage === 'importing' && (
            <Button variant="ghost" size="md" disabled>Importing...</Button>
          )}
        </div>
      </div>
    </div>
  );
}
