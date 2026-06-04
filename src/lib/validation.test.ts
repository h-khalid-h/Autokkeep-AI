import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { parseBody, schemas } from '@/lib/validation';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createBadRequest(): NextRequest {
  // Send non-JSON body to trigger JSON parse failure
  return new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'this is not json',
  });
}

// ─── parseBody ──────────────────────────────────────────────────────────────────

describe('parseBody', () => {
  it('should parse valid input successfully', async () => {
    const req = createJsonRequest({ name: 'Acme LLC', fiscalYearEnd: '12' });
    const result = await parseBody(req, schemas.createEntity);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Acme LLC');
      expect(result.data.fiscalYearEnd).toBe('12');
      expect(result.data.currency).toBe('USD'); // default
    }
  });

  it('should return structured errors for invalid input', async () => {
    const req = createJsonRequest({ name: '', fiscalYearEnd: '13' });
    const result = await parseBody(req, schemas.createEntity);

    expect(result.success).toBe(false);
    if (!result.success) {
      const json = await result.error.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeDefined();
      expect(Array.isArray(json.details)).toBe(true);
      expect(json.details.length).toBeGreaterThan(0);

      // Each detail should have field + message
      for (const detail of json.details) {
        expect(detail).toHaveProperty('field');
        expect(detail).toHaveProperty('message');
      }
    }
  });

  it('should return 400 error for empty/invalid JSON body', async () => {
    const req = createBadRequest();
    const result = await parseBody(req, schemas.createEntity);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe(400);
      const json = await result.error.json();
      expect(json.error).toBe('Invalid JSON body');
    }
  });

  it('should return 400 status for validation errors', async () => {
    const req = createJsonRequest({});
    const result = await parseBody(req, schemas.createEntity);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.status).toBe(400);
    }
  });
});

// ─── Transaction Schemas ────────────────────────────────────────────────────────

describe('schemas.createTransaction', () => {
  it('should validate correct transaction data', async () => {
    const req = createJsonRequest({
      entityId: 'a0000000-0000-4000-8000-000000000001',
      merchant: 'Office Depot',
      amount: 125.50,
      date: '2025-06-01',
    });
    const result = await parseBody(req, schemas.createTransaction);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(125.50);
      expect(result.data.merchant).toBe('Office Depot');
    }
  });

  it('should reject zero amount', async () => {
    const req = createJsonRequest({
      entityId: 'a0000000-0000-4000-8000-000000000001',
      merchant: 'Office Depot',
      amount: 0,
      date: '2025-06-01',
    });
    const result = await parseBody(req, schemas.createTransaction);

    expect(result.success).toBe(false);
    if (!result.success) {
      const json = await result.error.json();
      expect(json.details.some((d: { field: string; message: string }) =>
        d.message.toLowerCase().includes('zero')
      )).toBe(true);
    }
  });

  it('should reject invalid date string', async () => {
    const req = createJsonRequest({
      entityId: 'a0000000-0000-4000-8000-000000000001',
      merchant: 'Office Depot',
      amount: 50,
      date: 'not-a-date',
    });
    const result = await parseBody(req, schemas.createTransaction);

    expect(result.success).toBe(false);
    if (!result.success) {
      const json = await result.error.json();
      expect(json.details.some((d: { field: string; message: string }) =>
        d.field === 'date'
      )).toBe(true);
    }
  });

  it('should reject missing required fields', async () => {
    const req = createJsonRequest({ entityId: 'a0000000-0000-4000-8000-000000000001' });
    const result = await parseBody(req, schemas.createTransaction);

    expect(result.success).toBe(false);
    if (!result.success) {
      const json = await result.error.json();
      expect(json.details.length).toBeGreaterThanOrEqual(2); // merchant, amount, date missing
    }
  });
});

describe('schemas.updateTransaction', () => {
  it('should validate valid status update', async () => {
    const req = createJsonRequest({ status: 'pending' });
    const result = await parseBody(req, schemas.updateTransaction);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pending');
    }
  });

  it('should reject invalid status value', async () => {
    const req = createJsonRequest({ status: 'completed' });
    const result = await parseBody(req, schemas.updateTransaction);

    expect(result.success).toBe(false);
  });

  it('should reject empty object (at least one field required)', async () => {
    const req = createJsonRequest({});
    const result = await parseBody(req, schemas.updateTransaction);

    expect(result.success).toBe(false);
    if (!result.success) {
      const json = await result.error.json();
      expect(json.details.some((d: { field: string; message: string }) =>
        d.message.toLowerCase().includes('at least one field')
      )).toBe(true);
    }
  });
});

// ─── Batch Schemas ──────────────────────────────────────────────────────────────

describe('schemas.batchTransactions', () => {
  it('should validate correct batch request', async () => {
    const req = createJsonRequest({
      action: 'approve',
      transactionIds: ['a0000000-0000-4000-8000-000000000001'],
    });
    const result = await parseBody(req, schemas.batchTransactions);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('approve');
      expect(result.data.transactionIds).toHaveLength(1);
    }
  });

  it('should reject empty transactionIds array', async () => {
    const req = createJsonRequest({
      action: 'approve',
      transactionIds: [],
    });
    const result = await parseBody(req, schemas.batchTransactions);

    expect(result.success).toBe(false);
  });

  it('should reject invalid action', async () => {
    const req = createJsonRequest({
      action: 'delete',
      transactionIds: ['a0000000-0000-4000-8000-000000000001'],
    });
    const result = await parseBody(req, schemas.batchTransactions);

    expect(result.success).toBe(false);
  });

  it('should reject non-UUID transaction IDs', async () => {
    const req = createJsonRequest({
      action: 'approve',
      transactionIds: ['not-a-uuid'],
    });
    const result = await parseBody(req, schemas.batchTransactions);

    expect(result.success).toBe(false);
  });

  it('should reject more than 100 transaction IDs', async () => {
    const ids = Array.from({ length: 101 }, (_, i) =>
      `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    );
    const req = createJsonRequest({
      action: 'approve',
      transactionIds: ids,
    });
    const result = await parseBody(req, schemas.batchTransactions);

    expect(result.success).toBe(false);
  });
});

// ─── Entity Schema ──────────────────────────────────────────────────────────────

describe('schemas.createEntity', () => {
  it('should accept valid entity with optional currency', async () => {
    const req = createJsonRequest({ name: 'Test LLC', fiscalYearEnd: '6', currency: 'EUR' });
    const result = await parseBody(req, schemas.createEntity);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('EUR');
    }
  });

  it('should default currency to USD', async () => {
    const req = createJsonRequest({ name: 'Test LLC', fiscalYearEnd: '12' });
    const result = await parseBody(req, schemas.createEntity);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
    }
  });

  it('should reject invalid fiscal year end', async () => {
    const req = createJsonRequest({ name: 'Test LLC', fiscalYearEnd: '0' });
    const result = await parseBody(req, schemas.createEntity);

    expect(result.success).toBe(false);
  });
});
