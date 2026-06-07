// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Lightweight OpenTelemetry-Compatible Tracer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Zero-dependency tracing system that follows OpenTelemetry naming conventions.
// Stores completed spans in a circular buffer (last 1000) for the admin dashboard.
// All spans are logged via the structured logger on completion.

import { createLogger } from '@/lib/logger';

const log = createLogger('telemetry');

// ── Types ────────────────────────────────────────────────────────────────────

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: string; attributes?: Record<string, unknown> }>;
}

export interface Tracer {
  startSpan(operationName: string, attributes?: Record<string, unknown>): SpanContext;
}

export interface SpanContext {
  span: Span;
  end(status?: 'ok' | 'error'): Span;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setAttribute(key: string, value: unknown): void;
  createChildSpan(operationName: string, attributes?: Record<string, unknown>): SpanContext;
}

// ── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generates a random hex string of the specified length (in characters).
 * Uses crypto.getRandomValues when available, falls back to Math.random.
 */
function randomHex(length: number): string {
  const byteCount = Math.ceil(length / 2);
  try {
    // Node 18+ and all modern browsers have globalThis.crypto
    const bytes = new Uint8Array(byteCount);
    (globalThis.crypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  } catch {
    // Fallback for environments without crypto
    let hex = '';
    for (let i = 0; i < length; i++) {
      hex += Math.floor(Math.random() * 16).toString(16);
    }
    return hex;
  }
}

// ── Circular Buffer Span Collector ───────────────────────────────────────────

const MAX_SPANS = 1000;
const spanBuffer: Span[] = [];
let bufferIndex = 0;
let totalCollected = 0;

function collectSpan(span: Span): void {
  if (totalCollected < MAX_SPANS) {
    spanBuffer.push(span);
  } else {
    spanBuffer[bufferIndex % MAX_SPANS] = span;
  }
  bufferIndex = (bufferIndex + 1) % MAX_SPANS;
  totalCollected++;
}

/**
 * Returns the most recent completed spans, newest first.
 * @param limit - Max number of spans to return (default 50, capped at MAX_SPANS)
 */
export function getRecentSpans(limit = 50): Span[] {
  const effectiveLimit = Math.min(limit, spanBuffer.length);
  if (effectiveLimit <= 0) return [];

  // spanBuffer may not be full yet — handle both cases
  const result: Span[] = [];
  const len = spanBuffer.length;

  // Walk backwards from the most recently written position
  // bufferIndex points to the *next* write slot, so the last written is bufferIndex - 1
  for (let i = 0; i < effectiveLimit; i++) {
    const idx = (bufferIndex - 1 - i + len) % len;
    result.push(spanBuffer[idx]);
  }

  return result;
}

/**
 * Clears all stored spans. Primarily for testing.
 */
export function clearSpans(): void {
  spanBuffer.length = 0;
  bufferIndex = 0;
  totalCollected = 0;
}

// ── SpanContext Implementation ───────────────────────────────────────────────

class SpanContextImpl implements SpanContext {
  public readonly span: Span;
  private readonly _serviceName: string;
  private _ended = false;

  constructor(
    traceId: string,
    parentSpanId: string | null,
    operationName: string,
    serviceName: string,
    attributes: Record<string, unknown> = {}
  ) {
    this._serviceName = serviceName;
    this.span = {
      traceId,
      spanId: randomHex(16),
      parentSpanId,
      operationName,
      serviceName,
      startTime: new Date().toISOString(),
      endTime: null,
      durationMs: null,
      status: 'unset',
      attributes: { ...attributes },
      events: [],
    };
  }

  end(status: 'ok' | 'error' = 'ok'): Span {
    if (this._ended) return this.span;
    this._ended = true;

    const endTime = new Date();
    this.span.endTime = endTime.toISOString();
    this.span.durationMs = endTime.getTime() - new Date(this.span.startTime).getTime();
    this.span.status = status;

    // Log the completed span via structured logger
    log.info(`span.completed: ${this.span.operationName}`, {
      traceId: this.span.traceId,
      spanId: this.span.spanId,
      parentSpanId: this.span.parentSpanId,
      operation: this.span.operationName,
      durationMs: this.span.durationMs,
      status: this.span.status,
    });

    // Collect into the circular buffer
    collectSpan(this.span);

    return this.span;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    if (this._ended) return;
    this.span.events.push({
      name,
      timestamp: new Date().toISOString(),
      ...(attributes ? { attributes } : {}),
    });
  }

  setAttribute(key: string, value: unknown): void {
    if (this._ended) return;
    this.span.attributes[key] = value;
  }

  createChildSpan(operationName: string, attributes?: Record<string, unknown>): SpanContext {
    return new SpanContextImpl(
      this.span.traceId,
      this.span.spanId,
      operationName,
      this._serviceName,
      attributes
    );
  }
}

// ── Tracer Factory ───────────────────────────────────────────────────────────

class TracerImpl implements Tracer {
  private readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  startSpan(operationName: string, attributes?: Record<string, unknown>): SpanContext {
    return new SpanContextImpl(
      randomHex(16),
      null,
      operationName,
      this.serviceName,
      attributes
    );
  }
}

/**
 * Creates a named tracer for a service.
 *
 * @example
 * const tracer = createTracer('webhook-processor');
 * const ctx = tracer.startSpan('process-event', { eventType: 'invoice.created' });
 * // ... do work ...
 * ctx.end('ok');
 */
export function createTracer(serviceName: string): Tracer {
  return new TracerImpl(serviceName);
}
