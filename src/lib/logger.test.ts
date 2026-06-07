import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from './logger';

// ── Helpers ──────────────────────────────────────────────────────────────────

function captureOutput(level: 'log' | 'warn' | 'error') {
  const entries: string[] = [];
  const spy = vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    entries.push(args.map(String).join(' '));
  });
  return { entries, spy };
}

function parseEntry(json: string): Record<string, unknown> {
  return JSON.parse(json);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Structured Logger', () => {
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Default to debug so all levels are visible in tests
    process.env.LOG_LEVEL = 'debug';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      Reflect.deleteProperty(process.env, 'LOG_LEVEL');
    }
    if (originalNodeEnv !== undefined) {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    } else {
      Reflect.deleteProperty(process.env, 'NODE_ENV');
    }
  });

  it('info() writes a JSON entry with level "info" to console.log', () => {
    const { entries, spy } = captureOutput('log');
    const logger = createLogger('test-service');

    logger.info('Hello world');

    expect(spy).toHaveBeenCalledOnce();
    const parsed = parseEntry(entries[0]);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Hello world');
    expect(parsed.service).toBe('test-service');
    expect(parsed.timestamp).toBeDefined();
  });

  it('warn() writes a JSON entry with level "warn" to console.warn', () => {
    const { entries, spy } = captureOutput('warn');
    const logger = createLogger('warn-test');

    logger.warn('Something fishy');

    expect(spy).toHaveBeenCalledOnce();
    const parsed = parseEntry(entries[0]);
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('Something fishy');
    expect(parsed.service).toBe('warn-test');
  });

  it('error() writes a JSON entry with level "error" to console.error', () => {
    const { entries, spy } = captureOutput('error');
    const logger = createLogger('error-test');

    logger.error('Boom!');

    expect(spy).toHaveBeenCalledOnce();
    const parsed = parseEntry(entries[0]);
    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('Boom!');
  });

  it('debug() writes a JSON entry with level "debug" to console.log', () => {
    const { entries, spy } = captureOutput('log');
    const logger = createLogger('debug-test');

    logger.debug('Verbose details');

    expect(spy).toHaveBeenCalled();
    const debugEntries = entries.filter((e) => {
      const p = parseEntry(e);
      return p.level === 'debug';
    });
    expect(debugEntries).toHaveLength(1);
    const parsed = parseEntry(debugEntries[0]);
    expect(parsed.message).toBe('Verbose details');
  });

  it('merges context into the log entry', () => {
    const { entries } = captureOutput('log');
    const logger = createLogger('ctx-test');

    logger.info('Request processed', { requestId: 'abc-123', duration: 42 });

    const parsed = parseEntry(entries[0]);
    expect(parsed.requestId).toBe('abc-123');
    expect(parsed.duration).toBe(42);
    expect(parsed.service).toBe('ctx-test');
  });

  it('child() inherits parent context and merges additional context', () => {
    const { entries } = captureOutput('log');
    const parent = createLogger('parent-svc');
    const child = parent.child({ orgId: 'org-1', module: 'billing' });

    child.info('Invoice created', { invoiceId: 'inv-99' });

    const parsed = parseEntry(entries[0]);
    expect(parsed.service).toBe('parent-svc');
    expect(parsed.orgId).toBe('org-1');
    expect(parsed.module).toBe('billing');
    expect(parsed.invoiceId).toBe('inv-99');
  });

  it('child of child inherits all ancestor context', () => {
    const { entries } = captureOutput('log');
    const root = createLogger('root');
    const mid = root.child({ layer: 'middle' });
    const leaf = mid.child({ layer: 'leaf', extra: true });

    leaf.info('Deep log');

    const parsed = parseEntry(entries[0]);
    expect(parsed.service).toBe('root');
    // last child context wins for shared keys
    expect(parsed.layer).toBe('leaf');
    expect(parsed.extra).toBe(true);
  });

  it('respects LOG_LEVEL and suppresses lower levels', () => {
    process.env.LOG_LEVEL = 'warn';
    const logSpy = captureOutput('log');
    const warnSpy = captureOutput('warn');
    const logger = createLogger('level-test');

    logger.debug('should be suppressed');
    logger.info('should be suppressed too');
    logger.warn('should appear');

    expect(logSpy.spy).not.toHaveBeenCalled();
    expect(warnSpy.spy).toHaveBeenCalledOnce();
  });

  it('defaults to info in production when LOG_LEVEL is not set', () => {
    Reflect.deleteProperty(process.env, 'LOG_LEVEL');
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const logSpy = captureOutput('log');
    const logger = createLogger('prod-test');

    logger.debug('suppressed in prod');
    logger.info('visible in prod');

    // debug is suppressed, info goes through
    const debugEntries = logSpy.entries.filter((e) => parseEntry(e).level === 'debug');
    const infoEntries = logSpy.entries.filter((e) => parseEntry(e).level === 'info');
    expect(debugEntries).toHaveLength(0);
    expect(infoEntries).toHaveLength(1);
  });

  it('each log entry includes an ISO 8601 timestamp', () => {
    const { entries } = captureOutput('log');
    const logger = createLogger('ts-test');

    logger.info('Check timestamp');

    const parsed = parseEntry(entries[0]);
    const ts = parsed.timestamp as string;
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Should parse as valid date
    expect(new Date(ts).getTime()).not.toBeNaN();
  });
});
