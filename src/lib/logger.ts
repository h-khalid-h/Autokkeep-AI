// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Structured JSON Logger (Pino-compatible interface)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Lightweight structured logger that writes JSON to stdout/stderr.
// Supports child loggers with inherited context (like Pino's child()).
// Controlled by LOG_LEVEL env var (default: 'info' in prod, 'debug' in dev).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

// ── Level Ordering ───────────────────────────────────────────────────────────

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LEVEL_VALUES) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

// ── Console Writer ───────────────────────────────────────────────────────────

const CONSOLE_METHODS: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: console.log,
  info: console.log,
  warn: console.warn,
  error: console.error,
};

// ── Logger Implementation ────────────────────────────────────────────────────

class StructuredLogger implements Logger {
  private readonly service: string;
  private readonly baseContext: Record<string, unknown>;

  constructor(service: string, baseContext: Record<string, unknown> = {}) {
    this.service = service;
    this.baseContext = baseContext;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  child(context: Record<string, unknown>): Logger {
    return new StructuredLogger(this.service, {
      ...this.baseContext,
      ...context,
    });
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const minLevel = getMinLevel();
    if (LEVEL_VALUES[level] < LEVEL_VALUES[minLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      ...this.baseContext,
      ...context,
    };

    const writer = CONSOLE_METHODS[level];
    writer(JSON.stringify(entry));
  }
}

// ── Factory & Default Export ─────────────────────────────────────────────────

/**
 * Creates a named logger instance for a service/module.
 *
 * @example
 * const log = createLogger('webhook-queue');
 * log.info('Delivery attempted', { deliveryId: '123', attempt: 2 });
 */
export function createLogger(service: string): Logger {
  return new StructuredLogger(service);
}

/** Default application logger */
export const logger: Logger = createLogger('autokkeep');
