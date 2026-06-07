// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests — Tracer Module
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, it, expect, beforeEach } from 'vitest';
import { createTracer, getRecentSpans, clearSpans } from './tracer';


describe('tracer', () => {
  beforeEach(() => {
    clearSpans();
  });

  describe('createTracer', () => {
    it('returns a Tracer with startSpan method', () => {
      const tracer = createTracer('test-service');
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
    });
  });

  describe('startSpan', () => {
    it('creates a span with a valid 16-char hex traceId', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      expect(ctx.span.traceId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('creates a span with a valid 16-char hex spanId', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      expect(ctx.span.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('sets the service name and operation name', () => {
      const tracer = createTracer('my-service');
      const ctx = tracer.startSpan('my-operation');
      expect(ctx.span.serviceName).toBe('my-service');
      expect(ctx.span.operationName).toBe('my-operation');
    });

    it('sets parentSpanId to null for root spans', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('root-op');
      expect(ctx.span.parentSpanId).toBeNull();
    });

    it('records startTime as an ISO string', () => {
      const before = new Date().toISOString();
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      const after = new Date().toISOString();

      expect(ctx.span.startTime).toBeTruthy();
      expect(ctx.span.startTime >= before).toBe(true);
      expect(ctx.span.startTime <= after).toBe(true);
    });

    it('initialises endTime, durationMs, and status correctly', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      expect(ctx.span.endTime).toBeNull();
      expect(ctx.span.durationMs).toBeNull();
      expect(ctx.span.status).toBe('unset');
    });

    it('accepts initial attributes', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op', { userId: '123', priority: 'high' });
      expect(ctx.span.attributes).toEqual({ userId: '123', priority: 'high' });
    });
  });

  describe('SpanContext.end()', () => {
    it('records endTime and computes durationMs', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      const finished = ctx.end('ok');

      expect(finished.endTime).toBeTruthy();
      expect(typeof finished.durationMs).toBe('number');
      expect(finished.durationMs!).toBeGreaterThanOrEqual(0);
    });

    it('sets status to ok by default', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      const finished = ctx.end();
      expect(finished.status).toBe('ok');
    });

    it('sets status to error when specified', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      const finished = ctx.end('error');
      expect(finished.status).toBe('error');
    });

    it('is idempotent — second call returns the same span unchanged', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      const first = ctx.end('ok');
      const second = ctx.end('error'); // should be ignored
      expect(first).toBe(second);
      expect(first.status).toBe('ok');
    });

    it('adds the completed span to the collector', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      ctx.end('ok');

      const spans = getRecentSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].operationName).toBe('test-op');
    });
  });

  describe('SpanContext.addEvent()', () => {
    it('adds events to the span', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');

      ctx.addEvent('cache.miss', { key: 'user:123' });
      ctx.addEvent('db.query', { table: 'users' });

      expect(ctx.span.events).toHaveLength(2);
      expect(ctx.span.events[0].name).toBe('cache.miss');
      expect(ctx.span.events[0].attributes).toEqual({ key: 'user:123' });
      expect(ctx.span.events[1].name).toBe('db.query');
    });

    it('records event timestamps as ISO strings', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      ctx.addEvent('test-event');

      expect(ctx.span.events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('does not add events after span is ended', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      ctx.end();
      ctx.addEvent('late-event');
      expect(ctx.span.events).toHaveLength(0);
    });
  });

  describe('SpanContext.setAttribute()', () => {
    it('sets attributes on the span', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      ctx.setAttribute('http.method', 'GET');
      ctx.setAttribute('http.status_code', 200);

      expect(ctx.span.attributes['http.method']).toBe('GET');
      expect(ctx.span.attributes['http.status_code']).toBe(200);
    });

    it('overwrites existing attributes', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op', { key: 'old' });
      ctx.setAttribute('key', 'new');
      expect(ctx.span.attributes['key']).toBe('new');
    });

    it('does not set attributes after span is ended', () => {
      const tracer = createTracer('test-service');
      const ctx = tracer.startSpan('test-op');
      ctx.end();
      ctx.setAttribute('late-attr', 'value');
      expect(ctx.span.attributes['late-attr']).toBeUndefined();
    });
  });

  describe('SpanContext.createChildSpan()', () => {
    it('creates a child span with the same traceId', () => {
      const tracer = createTracer('test-service');
      const parent = tracer.startSpan('parent-op');
      const child = parent.createChildSpan('child-op');

      expect(child.span.traceId).toBe(parent.span.traceId);
    });

    it('sets parentSpanId to the parent span ID', () => {
      const tracer = createTracer('test-service');
      const parent = tracer.startSpan('parent-op');
      const child = parent.createChildSpan('child-op');

      expect(child.span.parentSpanId).toBe(parent.span.spanId);
    });

    it('child span has a different spanId from parent', () => {
      const tracer = createTracer('test-service');
      const parent = tracer.startSpan('parent-op');
      const child = parent.createChildSpan('child-op');

      expect(child.span.spanId).not.toBe(parent.span.spanId);
    });

    it('inherits the service name from the parent', () => {
      const tracer = createTracer('my-service');
      const parent = tracer.startSpan('parent-op');
      const child = parent.createChildSpan('child-op');

      expect(child.span.serviceName).toBe('my-service');
    });

    it('supports nested child spans', () => {
      const tracer = createTracer('test-service');
      const root = tracer.startSpan('root');
      const child = root.createChildSpan('child');
      const grandchild = child.createChildSpan('grandchild');

      expect(grandchild.span.traceId).toBe(root.span.traceId);
      expect(grandchild.span.parentSpanId).toBe(child.span.spanId);
    });
  });

  describe('circular buffer and getRecentSpans()', () => {
    it('returns empty array when no spans collected', () => {
      expect(getRecentSpans()).toEqual([]);
    });

    it('returns spans in newest-first order', () => {
      const tracer = createTracer('test-service');
      tracer.startSpan('first').end();
      tracer.startSpan('second').end();
      tracer.startSpan('third').end();

      const spans = getRecentSpans(3);
      expect(spans[0].operationName).toBe('third');
      expect(spans[1].operationName).toBe('second');
      expect(spans[2].operationName).toBe('first');
    });

    it('respects the limit parameter', () => {
      const tracer = createTracer('test-service');
      for (let i = 0; i < 10; i++) {
        tracer.startSpan(`op-${i}`).end();
      }

      const spans = getRecentSpans(3);
      expect(spans).toHaveLength(3);
      expect(spans[0].operationName).toBe('op-9');
    });

    it('caps at 1000 spans (circular buffer)', () => {
      const tracer = createTracer('test-service');

      // Fill more than the buffer capacity
      for (let i = 0; i < 1050; i++) {
        tracer.startSpan(`op-${i}`).end();
      }

      const allSpans = getRecentSpans(2000);
      expect(allSpans).toHaveLength(1000);

      // Most recent should be op-1049
      expect(allSpans[0].operationName).toBe('op-1049');
    });

    it('clearSpans resets the buffer', () => {
      const tracer = createTracer('test-service');
      tracer.startSpan('test').end();
      expect(getRecentSpans()).toHaveLength(1);

      clearSpans();
      expect(getRecentSpans()).toHaveLength(0);
    });
  });

  describe('unique IDs', () => {
    it('generates unique traceIds for different root spans', () => {
      const tracer = createTracer('test-service');
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const ctx = tracer.startSpan(`op-${i}`);
        ids.add(ctx.span.traceId);
        ctx.end();
      }
      expect(ids.size).toBe(100);
    });

    it('generates unique spanIds for different spans', () => {
      const tracer = createTracer('test-service');
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const ctx = tracer.startSpan(`op-${i}`);
        ids.add(ctx.span.spanId);
        ctx.end();
      }
      expect(ids.size).toBe(100);
    });
  });
});
