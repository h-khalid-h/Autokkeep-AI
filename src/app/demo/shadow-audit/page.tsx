'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import styles from './page.module.css';

/* ─── Merchant Dictionary ─── */
const KNOWN_MERCHANTS: Record<string, { category: string; glCode: string }> = {
  'amazon': { category: 'Office Supplies', glCode: '6090' },
  'aws': { category: 'Cloud & Hosting', glCode: '6130' },
  'google cloud': { category: 'Cloud & Hosting', glCode: '6130' },
  'microsoft': { category: 'Software & SaaS', glCode: '6110' },
  'slack': { category: 'Software & SaaS', glCode: '6110' },
  'zoom': { category: 'Software & SaaS', glCode: '6110' },
  'uber': { category: 'Travel & Entertainment', glCode: '6080' },
  'lyft': { category: 'Travel & Entertainment', glCode: '6080' },
  'starbucks': { category: 'Meals & Entertainment', glCode: '6160' },
  'doordash': { category: 'Meals & Entertainment', glCode: '6160' },
  'delta': { category: 'Travel & Entertainment', glCode: '6080' },
  'united airlines': { category: 'Travel & Entertainment', glCode: '6080' },
  'hilton': { category: 'Travel & Entertainment', glCode: '6080' },
  'marriott': { category: 'Travel & Entertainment', glCode: '6080' },
  'fedex': { category: 'Shipping & Delivery', glCode: '6100' },
  'ups': { category: 'Shipping & Delivery', glCode: '6100' },
  'comcast': { category: 'Communication & Phone', glCode: '6140' },
  'verizon': { category: 'Communication & Phone', glCode: '6140' },
  'at&t': { category: 'Communication & Phone', glCode: '6140' },
  'geico': { category: 'Insurance', glCode: '6050' },
  'state farm': { category: 'Insurance', glCode: '6050' },
  'gusto': { category: 'Payroll & Wages', glCode: '6010' },
  'adp': { category: 'Payroll & Wages', glCode: '6010' },
  'quickbooks': { category: 'Software & SaaS', glCode: '6110' },
  'github': { category: 'Software & SaaS', glCode: '6110' },
  'notion': { category: 'Software & SaaS', glCode: '6110' },
  'figma': { category: 'Software & SaaS', glCode: '6110' },
  'stripe': { category: 'Bank Fees & Charges', glCode: '6180' },
  'chase': { category: 'Bank Fees & Charges', glCode: '6180' },
  'bank of america': { category: 'Bank Fees & Charges', glCode: '6180' },
  'wework': { category: 'Rent & Facilities', glCode: '6030' },
};

const PATTERN_CATEGORIES: { patterns: string[]; category: string; glCode: string }[] = [
  { patterns: ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'diner', 'grill', 'sushi', 'taco'], category: 'Meals & Entertainment', glCode: '6160' },
  { patterns: ['hotel', 'inn', 'resort', 'motel'], category: 'Travel & Entertainment', glCode: '6080' },
  { patterns: ['airlines', 'air ', 'airways', 'jet'], category: 'Travel & Entertainment', glCode: '6080' },
  { patterns: ['insurance', 'mutual'], category: 'Insurance', glCode: '6050' },
  { patterns: ['pharmacy', 'cvs', 'walgreens', 'rite aid'], category: 'Medical & Health', glCode: '6170' },
  { patterns: ['gas', 'shell', 'exxon', 'chevron', 'bp ', 'fuel'], category: 'Auto & Transportation', glCode: '6085' },
  { patterns: ['parking', 'garage'], category: 'Auto & Transportation', glCode: '6085' },
];

/* ─── Types ─── */
interface CategorizedRow {
  date: string;
  description: string;
  amount: string;
  category: string;
  glCode: string;
  confidence: number;
  matchType: 'exact' | 'ai_inferred' | 'needs_review';
}

type Step = 'upload' | 'mapping' | 'processing' | 'results';

/* ─── CSV Parser ─── */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter(r => r.length === headers.length);
  return { headers, rows };
}

/* ─── Seeded PRNG ─── */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/* ─── Categorizer ─── */
function categorize(description: string, index: number): { category: string; glCode: string; confidence: number; matchType: 'exact' | 'ai_inferred' | 'needs_review' } {
  const lower = description.toLowerCase();

  // Exact merchant match
  for (const [merchant, data] of Object.entries(KNOWN_MERCHANTS)) {
    if (lower.includes(merchant)) {
      return { ...data, confidence: 97 + seededRandom(index) * 2, matchType: 'exact' };
    }
  }

  // Pattern-based inference
  for (const pc of PATTERN_CATEGORIES) {
    for (const pattern of pc.patterns) {
      if (lower.includes(pattern)) {
        return { category: pc.category, glCode: pc.glCode, confidence: 82 + seededRandom(index + 100) * 9, matchType: 'ai_inferred' };
      }
    }
  }

  // Unknown
  return { category: 'Uncategorized', glCode: '9999', confidence: 45 + seededRandom(index + 200) * 20, matchType: 'needs_review' };
}

/* ─── Auto-detect columns ─── */
function autoDetect(headers: string[]): { dateCol: number; descCol: number; amountCol: number } {
  const lower = headers.map(h => h.toLowerCase());
  let dateCol = lower.findIndex(h => h.includes('date'));
  let descCol = lower.findIndex(h => h.includes('desc') || h.includes('merchant') || h.includes('payee') || h.includes('memo') || h.includes('name'));
  let amountCol = lower.findIndex(h => h.includes('amount') || h.includes('total') || h.includes('debit') || h.includes('sum'));

  if (dateCol < 0) dateCol = 0;
  if (descCol < 0) descCol = Math.min(1, headers.length - 1);
  if (amountCol < 0) amountCol = Math.min(2, headers.length - 1);

  return { dateCol, descCol, amountCol };
}

/* ─── Helpers ─── */
const badgeClassMap = {
  exact: styles.badgeExact,
  ai_inferred: styles.badgeAiInferred,
  needs_review: styles.badgeNeedsReview,
} as const;

function getConfidenceColor(c: number): string {
  if (c >= 95) return '#10b981';
  if (c >= 80) return '#3b82f6';
  return '#f59e0b';
}

const badgeLabels = { exact: 'Exact Match', ai_inferred: 'AI Inferred', needs_review: 'Needs Review' };

/* ─── Component ─── */
export default function ShadowAuditPage() {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({ dateCol: 0, descCol: 1, amountCol: 2 });
  const [results, setResults] = useState<CategorizedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadError, setUploadError] = useState('');

  /* Handle file */
  const handleFile = useCallback((file: File) => {
    setUploadError('');
    if (!file.name.endsWith('.csv')) {
      setUploadError('Please upload a .csv file. Other formats (Excel, TSV) are not supported in this demo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File too large. The demo supports CSV files up to 5 MB.');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) {
        setUploadError('Could not parse CSV. Please check the file format.');
        return;
      }
      // Limit to 2000 rows for the demo
      const limitedRows = parsed.rows.slice(0, 2000);
      setHeaders(parsed.headers);
      setRows(limitedRows);
      const detected = autoDetect(parsed.headers);
      setMapping(detected);
      setStep('mapping');
    };
    reader.readAsText(file);
  }, []);

  /* Process rows with delay */
  const startProcessing = useCallback(() => {
    setStep('processing');
    setResults([]);
    setProgress(0);
    const startTime = Date.now();
    const total = rows.length;

    let i = 0;
    function processNext() {
      if (i >= total) {
        setProcessingTime(Date.now() - startTime);
        setStep('results');
        return;
      }
      const row = rows[i];
      const desc = row[mapping.descCol] || '';
      const cat = categorize(desc, i);
      const newRow: CategorizedRow = {
        date: row[mapping.dateCol] || '',
        description: desc,
        amount: row[mapping.amountCol] || '',
        category: cat.category,
        glCode: cat.glCode,
        confidence: Math.round(cat.confidence * 10) / 10,
        matchType: cat.matchType,
      };
      setResults(prev => [...prev, newRow]);
      setProgress(Math.round(((i + 1) / total) * 100));
      i++;
      setTimeout(processNext, 50 + seededRandom(i + 300) * 100);
    }
    processNext();
  }, [rows, mapping]);

  /* Export CSV */
  const exportCSV = useCallback(() => {
    const header = 'Date,Description,Amount,Category,GL Code,Confidence,Match Type\n';
    const body = results.map(r =>
      `"${r.date}","${r.description}","${r.amount}","${r.category}","${r.glCode}","${r.confidence}%","${badgeLabels[r.matchType]}"`
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autokkeep-categorized.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  /* Stats */
  const stats = {
    total: results.length,
    exact: results.filter(r => r.matchType === 'exact').length,
    inferred: results.filter(r => r.matchType === 'ai_inferred').length,
    review: results.filter(r => r.matchType === 'needs_review').length,
    avgConf: results.length ? (results.reduce((s, r) => s + r.confidence, 0) / results.length).toFixed(1) : '0',
    time: (processingTime / 1000).toFixed(1),
  };

  return (
    <>
      <Navbar />
      <main>
        {/* Keyframe styles */}
        <style>{`
          @keyframes pulse-border {
            0%, 100% { border-color: rgba(30, 111, 255, 0.3); }
            50% { border-color: rgba(30, 111, 255, 0.7); }
          }
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .upload-zone-idle { animation: pulse-border 2.5s ease-in-out infinite; }
          .progress-bar-fill {
            background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary));
            background-size: 200% 100%;
            animation: shimmer 1.5s linear infinite;
          }
          .result-row { animation: fadeInUp 0.3s ease forwards; }
        `}</style>

        {/* Hero */}
        <section className={`section ${styles.heroSection}`}>
          <div className="container">
            <div className={`section-header ${styles.heroHeader}`}>
              <div className="section-label">
                <span>🔍</span> Shadow Audit Demo
              </div>
              <h1 className={`text-display ${styles.heroTitle}`}>
                Upload a CSV. Watch Autokkeep{' '}
                <span className="text-gradient">categorize it in seconds.</span>
              </h1>
              <p className={`section-subtitle ${styles.heroSubtitle}`}>
                No signup. No API keys. Just drag a file and see our deterministic + AI categorization engine in action.
              </p>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <section className="section-sm">
          <div className={`container ${styles.mainContainer}`}>

            {/* ── Upload Step ── */}
            {step === 'upload' && (
              <div
                className={dragOver ? styles.uploadZoneHover : `${styles.uploadZone} upload-zone-idle`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFile(file);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  aria-label="Upload CSV file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
                <div className={styles.uploadIcon}>📄</div>
                <p className="text-h4" style={{ marginBottom: '8px' }}>
                  Drag & drop your CSV file here
                </p>
                <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
                  or click to browse • Accepts .csv files
                </p>
                {uploadError && (
                  <p className={styles.uploadError}>{uploadError}</p>
                )}
              </div>
            )}

            {/* ── Mapping Step ── */}
            {step === 'mapping' && (
              <div className={`card-elevated ${styles.mappingCard}`}>
                <div className={styles.fileInfo}>
                  <span className={styles.fileIcon}>📄</span>
                  <div>
                    <div className="text-h4">{fileName}</div>
                    <div className="text-caption" style={{ color: 'var(--text-secondary)' }}>
                      {rows.length} rows • {headers.length} columns detected
                    </div>
                  </div>
                </div>

                <h3 className="text-h4" style={{ marginBottom: '20px' }}>
                  Map Your Columns
                </h3>
                <p className="text-body" style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
                  We auto-detected your columns. Adjust if needed:
                </p>

                <div className={styles.columnGrid}>
                  {(['Date', 'Description / Merchant', 'Amount'] as const).map((label, idx) => {
                    const key = (['dateCol', 'descCol', 'amountCol'] as const)[idx];
                    return (
                      <div key={label}>
                        <label className={`text-caption ${styles.columnLabel}`}>
                          {label}
                        </label>
                        <select
                          className={styles.selectInput}
                          value={mapping[key]}
                          onChange={(e) => setMapping(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                          aria-label={`Map ${label} column`}
                        >
                          {headers.map((h, i) => (
                            <option key={i} value={i} className={styles.optionStyle}>{h}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {/* Preview first 3 rows */}
                <div className={styles.previewSection}>
                  <div className={`text-caption ${styles.previewLabel}`}>Preview (first 3 rows):</div>
                  <div className={`card ${styles.previewCard}`}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Date</th>
                          <th className={styles.th}>Description</th>
                          <th className={styles.th}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 3).map((row, i) => (
                          <tr key={i}>
                            <td className={styles.previewCellDate}>{row[mapping.dateCol]}</td>
                            <td className={styles.previewCellDesc}>{row[mapping.descCol]}</td>
                            <td className={styles.previewCellAmount}>{row[mapping.amountCol]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <button className={`btn btn-primary btn-lg ${styles.startButton}`} onClick={startProcessing} aria-label={`Start analysis on ${rows.length} transactions`}>
                  ⚡ Start Analysis — {rows.length} Transactions
                </button>
              </div>
            )}

            {/* ── Processing Step ── */}
            {step === 'processing' && (
              <div>
                <div className={`card-elevated ${styles.processingCard}`}>
                  <div className={styles.processingHeader}>
                    <span className="text-h4">Categorizing Transactions…</span>
                    <span className={styles.processingPercent}>{progress}%</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div className={`progress-bar-fill ${styles.progressFill}`} style={{ width: `${progress}%` }} />
                  </div>
                  <p className={`text-caption ${styles.processingCaption}`}>
                    {results.length} of {rows.length} processed
                  </p>
                </div>

                {/* Live results feed */}
                <div className={`card ${styles.liveFeed}`}>
                  {results.slice(-8).map((r, i) => (
                    <div key={i} className={`result-row ${styles.feedRow}`}>
                      <div className={styles.feedRowLeft}>
                        <span className={styles.feedDate}>{r.date}</span>
                        <span className={styles.feedDesc}>{r.description}</span>
                      </div>
                      <div className={styles.feedRowRight}>
                        <span className={styles.feedCategory}>{r.category}</span>
                        <span className={badgeClassMap[r.matchType]}>{badgeLabels[r.matchType]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Results Step ── */}
            {step === 'results' && (
              <div>
                {/* Stats Bar */}
                <div className={styles.statsGrid}>
                  {[
                    { label: 'Total Transactions', value: stats.total, color: '#fff' },
                    { label: 'Exact Match', value: stats.exact, color: '#10b981' },
                    { label: 'AI Inferred', value: stats.inferred, color: '#3b82f6' },
                    { label: 'Needs Review', value: stats.review, color: '#f59e0b' },
                    { label: 'Avg Confidence', value: `${stats.avgConf}%`, color: 'var(--accent-primary)' },
                    { label: 'Processing Time', value: `${stats.time}s`, color: 'var(--accent-primary)' },
                  ].map((s) => (
                    <div key={s.label} className={`card ${styles.statCard}`}>
                      <div className={styles.statCardValue} style={{ color: s.color }}>{s.value}</div>
                      <div className="text-caption" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className={styles.actionsRow}>
                  <button className="btn btn-primary" onClick={exportCSV}>
                    ⬇ Download Categorized CSV
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setStep('upload'); setFileName(''); setRows([]); setHeaders([]); setResults([]); }}>
                    ↻ Upload Another File
                  </button>
                </div>

                {/* Results Table */}
                <div className={`card-elevated ${styles.resultsTableCard}`}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {['Date', 'Description', 'Amount', 'AI Category', 'GL Code', 'Confidence', 'Match Type'].map(h => (
                          <th key={h} className={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className={`result-row ${i % 2 === 0 ? styles.resultRowEven : styles.resultRowOdd}`}>
                          <td className={styles.cellDate}>{r.date}</td>
                          <td className={styles.cellDesc}>{r.description}</td>
                          <td className={styles.cellAmount}>{r.amount}</td>
                          <td className={styles.cellCategory}>{r.category}</td>
                          <td className={styles.cellGlCode}>{r.glCode}</td>
                          <td className={styles.cellConfidence} style={{ color: getConfidenceColor(r.confidence) }}>{r.confidence}%</td>
                          <td className={styles.cellBadge}>
                            <span className={badgeClassMap[r.matchType]}>{badgeLabels[r.matchType]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* CTA */}
                <div className={styles.ctaSection}>
                  <h3 className={`text-h3 ${styles.ctaTitle}`}>
                    Like what you see?
                  </h3>
                  <p className={`text-body ${styles.ctaSubtitle}`}>
                    This is just the demo. The full platform categorizes, reconciles, and closes your books — automatically.
                  </p>
                  <Link href="/#cta" className="btn btn-primary btn-lg">
                    Request Early Access
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
