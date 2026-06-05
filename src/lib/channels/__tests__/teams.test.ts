// @ts-nocheck — test file with extensive dynamic mocking
import { describe, it, expect, vi } from 'vitest';

// Mock formatCurrency for deterministic output
vi.mock('@/lib/currency/converter', () => ({
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
}));

import {
  buildTeamsAdaptiveCard,
  parseTeamsWebhookPayload,
  mapTeamsChoiceToGL,
  type TeamsAdaptiveCardPayload,
} from '../teams';

// ============================================
// buildTeamsAdaptiveCard
// ============================================
describe('buildTeamsAdaptiveCard', () => {
  const basePayload: TeamsAdaptiveCardPayload = {
    transactionId: 'tx-teams-001',
    merchantName: 'Office Depot',
    amount: 85.99,
    date: '2025-06-02',
    cardLast4: '1234',
    cardHolder: 'John Smith',
  };

  it('returns an object with type "message"', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    expect(card.type).toBe('message');
  });

  it('has attachments array with one adaptive card', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    expect(card.attachments).toHaveLength(1);
    expect(card.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
  });

  it('content is AdaptiveCard type with schema and version', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    const content = card.attachments[0].content;
    expect(content.type).toBe('AdaptiveCard');
    expect(content.$schema).toBe('http://adaptivecards.io/schemas/adaptive-card.json');
    expect(content.version).toBe('1.5');
  });

  it('includes transactionId reference in body', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    const body = card.attachments[0].content.body;
    const refText = JSON.stringify(body);
    expect(refText).toContain('tx-teams-001');
  });

  it('includes a FactSet with merchant, amount, date, card facts', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    const body = card.attachments[0].content.body;
    const factSet = body.find((b: { type: string }) => b.type === 'FactSet');
    expect(factSet).toBeDefined();
    const titles = factSet.facts.map((f: { title: string }) => f.title);
    expect(titles).toContain('Merchant');
    expect(titles).toContain('Amount');
    expect(titles).toContain('Date');
    expect(titles).toContain('Card');
  });

  it('includes AI Suggestion fact when suggestedCategory is provided', () => {
    const payload: TeamsAdaptiveCardPayload = {
      ...basePayload,
      suggestedCategory: 'Office Supplies',
      suggestedGLCode: '6510',
      confidence: 90,
    };
    const card = buildTeamsAdaptiveCard(payload);
    const factSet = card.attachments[0].content.body.find(
      (b: { type: string }) => b.type === 'FactSet'
    );
    const aiSuggestion = factSet.facts.find(
      (f: { title: string }) => f.title === 'AI Suggestion'
    );
    expect(aiSuggestion).toBeDefined();
    expect(aiSuggestion.value).toContain('6510');
    expect(aiSuggestion.value).toContain('Office Supplies');
    expect(aiSuggestion.value).toContain('90%');
  });

  it('omits AI Suggestion fact when suggestedCategory is absent', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    const factSet = card.attachments[0].content.body.find(
      (b: { type: string }) => b.type === 'FactSet'
    );
    const aiSuggestion = factSet.facts.find(
      (f: { title: string }) => f.title === 'AI Suggestion'
    );
    expect(aiSuggestion).toBeUndefined();
  });

  it('has an Input.ChoiceSet with 4 choices', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    const body = card.attachments[0].content.body;
    const choiceSet = body.find(
      (b: { type: string }) => b.type === 'Input.ChoiceSet'
    );
    expect(choiceSet).toBeDefined();
    expect(choiceSet.choices).toHaveLength(4);
    const values = choiceSet.choices.map((c: { value: string }) => c.value);
    expect(values).toEqual(['accept', 'meeting', 'team_lunch', 'personal']);
  });

  it('has Submit and OpenUrl actions', () => {
    const card = buildTeamsAdaptiveCard(basePayload);
    const actions = card.attachments[0].content.actions;
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('Action.Submit');
    expect(actions[1].type).toBe('Action.OpenUrl');
  });

  it('includes confidence TextBlock with "good" color for >= 75', () => {
    const payload: TeamsAdaptiveCardPayload = {
      ...basePayload,
      confidence: 80,
    };
    const card = buildTeamsAdaptiveCard(payload);
    const body = card.attachments[0].content.body;
    const confBlock = body.find(
      (b: { type: string; text?: string }) =>
        b.type === 'TextBlock' && (b.text as string)?.includes('Confidence')
    );
    expect(confBlock).toBeDefined();
    expect(confBlock.color).toBe('good');
  });

  it('includes confidence TextBlock with "attention" color for < 75', () => {
    const payload: TeamsAdaptiveCardPayload = {
      ...basePayload,
      confidence: 50,
    };
    const card = buildTeamsAdaptiveCard(payload);
    const body = card.attachments[0].content.body;
    const confBlock = body.find(
      (b: { type: string; text?: string }) =>
        b.type === 'TextBlock' && (b.text as string)?.includes('Confidence')
    );
    expect(confBlock).toBeDefined();
    expect(confBlock.color).toBe('attention');
  });
});

// ============================================
// parseTeamsWebhookPayload
// ============================================
describe('parseTeamsWebhookPayload', () => {
  it('parses a valid payload with data.transactionId', () => {
    const body = {
      data: {
        transactionId: 'tx-789',
        category_choice: 'meeting',
        action: 'categorize',
      },
    };
    const result = parseTeamsWebhookPayload(body);
    expect(result).toEqual({
      transactionId: 'tx-789',
      categoryChoice: 'meeting',
      action: 'categorize',
    });
  });

  it('defaults categoryChoice to "accept" if missing', () => {
    const body = {
      data: {
        transactionId: 'tx-789',
        action: 'categorize',
      },
    };
    const result = parseTeamsWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.categoryChoice).toBe('accept');
  });

  it('defaults action to "categorize" if missing', () => {
    const body = {
      data: {
        transactionId: 'tx-789',
        category_choice: 'team_lunch',
      },
    };
    const result = parseTeamsWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('categorize');
  });

  it('returns null when data.transactionId is missing', () => {
    const body = { data: { action: 'categorize' } };
    const result = parseTeamsWebhookPayload(body);
    expect(result).toBeNull();
  });

  it('returns null when data property is missing', () => {
    const body = { something: 'else' };
    const result = parseTeamsWebhookPayload(body);
    expect(result).toBeNull();
  });

  it('returns null for empty object', () => {
    const result = parseTeamsWebhookPayload({});
    expect(result).toBeNull();
  });

  it('uses top-level category_choice as fallback', () => {
    const body = {
      data: {
        transactionId: 'tx-abc',
        action: 'categorize',
      },
      category_choice: 'travel',
    };
    const result = parseTeamsWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.categoryChoice).toBe('travel');
  });
});

// ============================================
// mapTeamsChoiceToGL
// ============================================
describe('mapTeamsChoiceToGL', () => {
  it('maps "meeting" to correct GL code', () => {
    const result = mapTeamsChoiceToGL('meeting');
    expect(result).toEqual({ glCode: '6410', glName: 'Business Meals & Entertainment' });
  });

  it('maps "team_lunch" to correct GL code', () => {
    const result = mapTeamsChoiceToGL('team_lunch');
    expect(result).toEqual({ glCode: '6020', glName: 'Employee Welfare' });
  });

  it('maps "office_supplies" to correct GL code', () => {
    const result = mapTeamsChoiceToGL('office_supplies');
    expect(result).toEqual({ glCode: '6510', glName: 'Office Supplies & Equipment' });
  });

  it('maps "travel" to correct GL code', () => {
    const result = mapTeamsChoiceToGL('travel');
    expect(result).toEqual({ glCode: '6310', glName: 'Travel - Airfare' });
  });

  it('maps "transport" to correct GL code', () => {
    const result = mapTeamsChoiceToGL('transport');
    expect(result).toEqual({ glCode: '6320', glName: 'Local Transportation' });
  });

  it('maps "software" to correct GL code', () => {
    const result = mapTeamsChoiceToGL('software');
    expect(result).toEqual({ glCode: '5120', glName: 'Software Subscriptions' });
  });

  it('returns null for unknown choice', () => {
    expect(mapTeamsChoiceToGL('unknown_value')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(mapTeamsChoiceToGL('')).toBeNull();
  });

  it('returns null for "accept" (not a GL mapping)', () => {
    expect(mapTeamsChoiceToGL('accept')).toBeNull();
  });

  it('returns null for "personal" (not a GL mapping)', () => {
    expect(mapTeamsChoiceToGL('personal')).toBeNull();
  });
});
