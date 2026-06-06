
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — CSV Bank Statement Parser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Auto-detects column mapping and normalizes transactions from CSV bank
// statement exports. Handles quoted fields, multiple date formats,
// separate debit/credit columns, and single amount columns.

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  date: string;        // ISO date YYYY-MM-DD
  description: string;
  amount: number;      // Positive = expense/outflow, negative = income/inflow
  currency?: string;
  reference?: string;
}

export interface CsvParseResult {
  transactions: ParsedTransaction[];
  skipped: number;
  errors: string[];
  detectedFormat: string;
}

interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  debit?: number;
  credit?: number;
  currency?: number;
  reference?: number;
}

// ─── Header Pattern Matching ────────────────────────────────────────────────────

const HEADER_PATTERNS: Record<string, RegExp[]> = {
  date: [
    /^date$/i,
    /^transaction\s*date$/i,
    /^posted\s*date$/i,
    /^booking\s*date$/i,
    /^value\s*date$/i,
    /^trans\.?\s*date$/i,
  ],
  description: [
    /^description$/i,
    /^narrative$/i,
    /^details$/i,
    /^memo$/i,
    /^payee$/i,
    /^merchant$/i,
    /^particulars$/i,
    /^transaction\s*description$/i,
  ],
  amount: [
    /^amount$/i,
    /^sum$/i,
    /^value$/i,
    /^transaction\s*amount$/i,
  ],
  debit: [
    /^debit$/i,
    /^withdrawal$/i,
    /^debit\s*amount$/i,
    /^money\s*out$/i,
  ],
  credit: [
    /^credit$/i,
    /^deposit$/i,
    /^credit\s*amount$/i,
    /^money\s*in$/i,
  ],
  reference: [
    /^reference$/i,
    /^ref$/i,
    /^transaction\s*id$/i,
    /^trans\.?\s*ref$/i,
    /^check\s*number$/i,
  ],
  currency: [
    /^currency$/i,
    /^ccy$/i,
    /^cur$/i,
  ],
};

// ─── Month Name Map ─────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4,
  june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12,
};

// ─── Delimiter Auto-Detection ───────────────────────────────────────────────────

const CANDIDATE_DELIMITERS = [',', ';', '\t'] as const;

/**
 * Detects the most likely delimiter by scanning the first few lines of the CSV.
 * Counts occurrences of each candidate delimiter per line, then picks the one
 * that appears most consistently (highest minimum count across all sampled lines).
 * Defaults to ',' if tied.
 */
function detectDelimiter(lines: string[]): string {
  const sampleLines = lines.slice(0, Math.min(3, lines.length));
  if (sampleLines.length === 0) return ',';

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sampleLines.map((line) => {
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (!inQuotes && char === delimiter) {
          count++;
        }
      }
      return count;
    });

    // Use the minimum count across sample lines as the consistency score
    const minCount = Math.min(...counts);
    if (minCount > bestScore) {
      bestScore = minCount;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function delimiterLabel(delimiter: string): string {
  if (delimiter === '\t') return 'tab';
  if (delimiter === ';') return 'semicolon';
  return 'comma';
}

// ─── CSV Field Parsing (RFC 4180) ───────────────────────────────────────────────

/**
 * Parses a single CSV line into fields, handling quoted fields with
 * embedded commas, quotes, and newlines.
 */
function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Push the last field
  fields.push(current.trim());

  return fields;
}

// ─── Date Parsing ───────────────────────────────────────────────────────────────

/**
 * Attempts to parse a date string in multiple formats and returns ISO YYYY-MM-DD.
 * Supported formats:
 *   - YYYY-MM-DD
 *   - MM/DD/YYYY
 *   - DD/MM/YYYY (when day > 12, otherwise ambiguous — prefers MM/DD/YYYY)
 *   - DD-Mon-YYYY (e.g. 15-Jan-2024)
 *   - DD Mon YYYY
 *   - Mon DD, YYYY
 */
function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // ISO format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return formatIsoDate(parseInt(y, 10), parseInt(m, 10), parseInt(d, 10));
  }

  // DD-Mon-YYYY or DD Mon YYYY
  const dMonY = trimmed.match(/^(\d{1,2})[\s-]([A-Za-z]+)[\s-](\d{4})$/);
  if (dMonY) {
    const [, d, mon, y] = dMonY;
    const month = MONTH_NAMES[mon.toLowerCase()];
    if (month) {
      return formatIsoDate(parseInt(y, 10), month, parseInt(d, 10));
    }
  }

  // Mon DD, YYYY
  const monDY = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monDY) {
    const [, mon, d, y] = monDY;
    const month = MONTH_NAMES[mon.toLowerCase()];
    if (month) {
      return formatIsoDate(parseInt(y, 10), month, parseInt(d, 10));
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY (slash or dot separated)
  const slashMatch = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    const yNum = parseInt(y, 10);

    // If first number > 12, it must be DD/MM/YYYY
    if (aNum > 12 && bNum <= 12) {
      return formatIsoDate(yNum, bNum, aNum);
    }
    // Default: treat as MM/DD/YYYY
    return formatIsoDate(yNum, aNum, bNum);
  }

  return null;
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Amount Parsing ─────────────────────────────────────────────────────────────

/**
 * Parses a monetary amount string, stripping currency symbols and
 * handling parenthetical negatives (e.g. "(500.00)" → -500).
 */
function parseAmount(raw: string): number | null {
  let trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '') return null;

  // Check for parenthetical negative: (500.00) → -500.00
  let negative = false;
  const parenMatch = trimmed.match(/^\((.+)\)$/);
  if (parenMatch) {
    trimmed = parenMatch[1];
    negative = true;
  }

  // Strip currency symbols and whitespace
  trimmed = trimmed.replace(/[£$€¥₹\s]/g, '');

  // Handle explicit negative sign
  if (trimmed.startsWith('-')) {
    negative = !negative;
    trimmed = trimmed.slice(1);
  }

  // Remove thousands separators (commas)
  trimmed = trimmed.replace(/,/g, '');

  const num = parseFloat(trimmed);
  if (isNaN(num)) return null;

  return negative ? -num : num;
}

// ─── Column Auto-Detection ──────────────────────────────────────────────────────

function detectColumns(headerFields: string[]): ColumnMapping | null {
  const mapping: Partial<ColumnMapping> = {};

  for (let i = 0; i < headerFields.length; i++) {
    const header = headerFields[i].trim();
    if (!header) continue;

    for (const [key, patterns] of Object.entries(HEADER_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(header)) {
          // Assign column index for this key
          if (key === 'date' && mapping.date === undefined) mapping.date = i;
          else if (key === 'description' && mapping.description === undefined) mapping.description = i;
          else if (key === 'amount' && mapping.amount === undefined) mapping.amount = i;
          else if (key === 'debit' && mapping.debit === undefined) mapping.debit = i;
          else if (key === 'credit' && mapping.credit === undefined) mapping.credit = i;
          else if (key === 'reference' && mapping.reference === undefined) mapping.reference = i;
          else if (key === 'currency' && mapping.currency === undefined) mapping.currency = i;
          break;
        }
      }
    }
  }

  // Must have at least date and description
  if (mapping.date === undefined || mapping.description === undefined) {
    return null;
  }

  // Must have either a single amount column or debit+credit columns
  if (mapping.amount === undefined && (mapping.debit === undefined || mapping.credit === undefined)) {
    return null;
  }

  // If we have an amount column, use it; debit/credit take precedence if both exist
  return {
    date: mapping.date,
    description: mapping.description,
    amount: mapping.amount ?? -1, // -1 signals "use debit/credit instead"
    debit: mapping.debit,
    credit: mapping.credit,
    reference: mapping.reference,
    currency: mapping.currency,
  };
}

function describeFormat(mapping: ColumnMapping, headers: string[], delimiter: string): string {
  const parts: string[] = [];
  parts.push(`delimiter=${delimiterLabel(delimiter)}`);
  parts.push(`date="${headers[mapping.date]}"`);
  parts.push(`desc="${headers[mapping.description]}"`);
  if (mapping.debit !== undefined && mapping.credit !== undefined) {
    parts.push(`debit="${headers[mapping.debit]}" credit="${headers[mapping.credit]}"`);
  } else {
    parts.push(`amount="${headers[mapping.amount]}"`);
  }
  return `auto-detected: ${parts.join(', ')}`;
}

// ─── Main Parser ────────────────────────────────────────────────────────────────

/**
 * Parses raw CSV text from a bank statement export into normalized transactions.
 *
 * @param csvText - Raw CSV content as a string
 * @returns Parsed transactions with metadata about skipped rows and errors
 */
export function parseCsvTransactions(csvText: string): CsvParseResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // Normalize line endings and split into lines
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return {
      transactions: [],
      skipped: 0,
      errors: ['CSV file must contain at least a header row and one data row'],
      detectedFormat: 'unknown',
    };
  }

  // Auto-detect delimiter from first few lines
  const delimiter = detectDelimiter(lines);

  // Parse header row
  const headerFields = parseCsvLine(lines[0], delimiter);
  const mapping = detectColumns(headerFields);

  if (!mapping) {
    return {
      transactions: [],
      skipped: 0,
      errors: [
        'Could not auto-detect column mapping. Expected headers like: Date, Description, Amount (or Debit/Credit)',
      ],
      detectedFormat: 'unknown',
    };
  }

  const detectedFormat = describeFormat(mapping, headerFields, delimiter);
  const useDebitCredit = mapping.debit !== undefined && mapping.credit !== undefined;

  // Parse data rows (skip header)
  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const line = lines[rowIdx];
    const fields = parseCsvLine(line, delimiter);

    // Skip rows that don't have enough fields
    if (fields.length <= Math.max(mapping.date, mapping.description)) {
      skipped++;
      continue;
    }

    // Parse date
    const rawDate = fields[mapping.date] || '';
    const date = parseDate(rawDate);
    if (!date) {
      if (rawDate.trim()) {
        errors.push(`Row ${rowIdx + 1}: Invalid date "${rawDate}"`);
      } else {
        skipped++;
      }
      continue;
    }

    // Parse description
    const description = (fields[mapping.description] || '').trim();
    if (!description) {
      skipped++;
      continue;
    }

    // Parse amount
    let amount: number | null = null;

    if (useDebitCredit) {
      const debitRaw = fields[mapping.debit!] || '';
      const creditRaw = fields[mapping.credit!] || '';
      const debitVal = parseAmount(debitRaw);
      const creditVal = parseAmount(creditRaw);

      if (debitVal !== null && debitVal !== 0) {
        // Debit = expense/outflow → positive
        amount = Math.abs(debitVal);
      } else if (creditVal !== null && creditVal !== 0) {
        // Credit = income/inflow → negative
        amount = -Math.abs(creditVal);
      } else {
        errors.push(`Row ${rowIdx + 1}: No valid debit or credit amount`);
        continue;
      }
    } else {
      const rawAmount = fields[mapping.amount] || '';
      amount = parseAmount(rawAmount);
      if (amount === null) {
        errors.push(`Row ${rowIdx + 1}: Invalid amount "${rawAmount}"`);
        continue;
      }
    }

    // Parse optional fields
    const currency = mapping.currency !== undefined ? (fields[mapping.currency] || '').trim() || undefined : undefined;
    const reference = mapping.reference !== undefined ? (fields[mapping.reference] || '').trim() || undefined : undefined;

    transactions.push({
      date,
      description,
      amount,
      currency,
      reference,
    });
  }

  return {
    transactions,
    skipped,
    errors,
    detectedFormat,
  };
}
