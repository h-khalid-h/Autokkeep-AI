'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

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

/* ─── Styles ─── */
const uploadZoneStyle: React.CSSProperties = {
  border: '2px dashed rgba(30, 111, 255, 0.4)',
  borderRadius: '16px',
  padding: '64px 32px',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  background: 'rgba(30, 111, 255, 0.03)',
  position: 'relative',
};

const uploadZoneHoverStyle: React.CSSProperties = {
  ...uploadZoneStyle,
  borderColor: 'rgba(30, 111, 255, 0.8)',
  background: 'rgba(30, 111, 255, 0.08)',
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.4)',
  color: '#fff',
  border: '1px solid var(--border-primary)',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '0.875rem',
  width: '100%',
  appearance: 'none' as const,
  cursor: 'pointer',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.85rem',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-primary)',
  whiteSpace: 'nowrap',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

function getBadgeStyle(type: 'exact' | 'ai_inferred' | 'needs_review'): React.CSSProperties {
  const colors = {
    exact: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', color: '#10b981' },
    ai_inferred: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', color: '#3b82f6' },
    needs_review: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b' },
  };
  const c = colors[type];
  return {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: 600,
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.color,
    whiteSpace: 'nowrap',
  };
}

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
          @media (max-width: 768px) {
            #demo-stats-grid {
              grid-template-columns: repeat(3, 1fr) !important;
            }
          }
          @media (max-width: 480px) {
            #demo-stats-grid {
              grid-template-columns: repeat(2, 1fr) !important;
            }
          }
        `}</style>

        {/* Hero */}
        <section className="section" style={{ paddingTop: 'calc(var(--header-height) + 80px)', paddingBottom: '32px' }}>
          <div className="container">
            <div className="section-header" style={{ maxWidth: '800px' }}>
              <div className="section-label">
                <span>🔍</span> Shadow Audit Demo
              </div>
              <h1 className="text-display" style={{ marginBottom: '16px' }}>
                Upload a CSV. Watch Autokkeep{' '}
                <span className="text-gradient">categorize it in seconds.</span>
              </h1>
              <p className="section-subtitle" style={{ maxWidth: '650px' }}>
                No signup. No API keys. Just drag a file and see our deterministic + AI categorization engine in action.
              </p>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <section className="section-sm">
          <div className="container" style={{ maxWidth: '1100px' }}>

            {/* ── Upload Step ── */}
            {step === 'upload' && (
              <div
                className={dragOver ? '' : 'upload-zone-idle'}
                style={dragOver ? uploadZoneHoverStyle : uploadZoneStyle}
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
                <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.6 }}>📄</div>
                <p className="text-h4" style={{ marginBottom: '8px' }}>
                  Drag & drop your CSV file here
                </p>
                <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
                  or click to browse • Accepts .csv files
                </p>
                {uploadError && (
                  <p style={{ color: '#ef4444', marginTop: '12px', fontSize: '0.875rem' }}>{uploadError}</p>
                )}
              </div>
            )}

            {/* ── Mapping Step ── */}
            {step === 'mapping' && (
              <div className="card-elevated" style={{ padding: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <span style={{ fontSize: '1.5rem' }}>📄</span>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
                  {(['Date', 'Description / Merchant', 'Amount'] as const).map((label, idx) => {
                    const key = (['dateCol', 'descCol', 'amountCol'] as const)[idx];
                    return (
                      <div key={label}>
                        <label className="text-caption" style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {label}
                        </label>
                        <select
                          style={selectStyle}
                          value={mapping[key]}
                          onChange={(e) => setMapping(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                          aria-label={`Map ${label} column`}
                        >
                          {headers.map((h, i) => (
                            <option key={i} value={i} style={{ background: '#111', color: '#fff' }}>{h}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {/* Preview first 3 rows */}
                <div style={{ marginBottom: '32px' }}>
                  <div className="text-caption" style={{ color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600 }}>Preview (first 3 rows):</div>
                  <div className="card" style={{ padding: '16px', overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Date</th>
                          <th style={thStyle}>Description</th>
                          <th style={thStyle}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 3).map((row, i) => (
                          <tr key={i}>
                            <td style={{ padding: '8px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{row[mapping.dateCol]}</td>
                            <td style={{ padding: '8px 16px', fontSize: '0.85rem' }}>{row[mapping.descCol]}</td>
                            <td style={{ padding: '8px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{row[mapping.amountCol]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <button className="btn btn-primary btn-lg" onClick={startProcessing} style={{ width: '100%' }} aria-label={`Start analysis on ${rows.length} transactions`}>
                  ⚡ Start Analysis — {rows.length} Transactions
                </button>
              </div>
            )}

            {/* ── Processing Step ── */}
            {step === 'processing' && (
              <div>
                <div className="card-elevated" style={{ padding: '32px', marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span className="text-h4">Categorizing Transactions…</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 700 }}>{progress}%</span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div className="progress-bar-fill" style={{ height: '100%', width: `${progress}%`, borderRadius: '999px', transition: 'width 0.15s ease' }} />
                  </div>
                  <p className="text-caption" style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>
                    {results.length} of {rows.length} processed
                  </p>
                </div>

                {/* Live results feed */}
                <div className="card" style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                  {results.slice(-8).map((r, i) => (
                    <div key={i} className="result-row" style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{r.date}</span>
                        <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>{r.category}</span>
                        <span style={getBadgeStyle(r.matchType)}>{badgeLabels[r.matchType]}</span>
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
                <div id="demo-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px', marginBottom: '32px' }}>
                  {[
                    { label: 'Total Transactions', value: stats.total, color: '#fff' },
                    { label: 'Exact Match', value: stats.exact, color: '#10b981' },
                    { label: 'AI Inferred', value: stats.inferred, color: '#3b82f6' },
                    { label: 'Needs Review', value: stats.review, color: '#f59e0b' },
                    { label: 'Avg Confidence', value: `${stats.avgConf}%`, color: 'var(--accent-primary)' },
                    { label: 'Processing Time', value: `${stats.time}s`, color: 'var(--accent-primary)' },
                  ].map((s) => (
                    <div key={s.label} className="card" style={{ padding: '20px', textAlign: 'center' }}>
                      <div className="stat-value" style={{ fontSize: '1.75rem', color: s.color, marginBottom: '4px' }}>{s.value}</div>
                      <div className="text-caption" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={exportCSV}>
                    ⬇ Download Categorized CSV
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setStep('upload'); setFileName(''); setRows([]); setHeaders([]); setResults([]); }}>
                    ↻ Upload Another File
                  </button>
                </div>

                {/* Results Table */}
                <div className="card-elevated" style={{ overflowX: 'auto', padding: '0' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        {['Date', 'Description', 'Amount', 'AI Category', 'GL Code', 'Confidence', 'Match Type'].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className="result-row" style={{
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        }}>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.date}</td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{r.amount}</td>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 500 }}>{r.category}</td>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.glCode}</td>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, color: getConfidenceColor(r.confidence) }}>{r.confidence}%</td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={getBadgeStyle(r.matchType)}>{badgeLabels[r.matchType]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* CTA */}
                <div className="cta-section" style={{ padding: '48px 0', textAlign: 'center' }}>
                  <h3 className="text-h3" style={{ marginBottom: '12px' }}>
                    Like what you see?
                  </h3>
                  <p className="text-body" style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
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
