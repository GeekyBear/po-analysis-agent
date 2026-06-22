'use strict';

const {
  detectAmountMismatch,
  detectQuantityMismatch,
  detectOverdue,
  detectMissingDocuments,
  runThreeWayMatch,
} = require('../srv/matching/three-way-match');

const POs = require('./sample-data/purchase-orders.json');
const GRs = require('./sample-data/goods-receipts.json');
const INVs = require('./sample-data/invoices.json');

function po(id) { return POs.find((p) => p.ID === id); }
function grs(poId) { return GRs.filter((g) => g.poID === poId); }
function invs(poId) { return INVs.filter((i) => i.poID === poId); }

// ── detectAmountMismatch ──────────────────────────────────────────────────────

describe('detectAmountMismatch', () => {
  it('returns null when amounts match exactly', () => {
    expect(detectAmountMismatch(po('po-001'), invs('po-001')[0])).toBeNull();
  });

  it('returns null when no invoice is provided', () => {
    expect(detectAmountMismatch(po('po-001'), null)).toBeNull();
  });

  it('returns AMOUNT_MISMATCH when invoice exceeds tolerance (po-004: 9750 vs 9920)', () => {
    expect(detectAmountMismatch(po('po-004'), invs('po-004')[0])).toBe('AMOUNT_MISMATCH');
  });

  it('returns AMOUNT_MISMATCH when invoice exceeds tolerance (po-005: 6600 vs 6930, 5% over)', () => {
    expect(detectAmountMismatch(po('po-005'), invs('po-005')[0])).toBe('AMOUNT_MISMATCH');
  });
});

// ── detectQuantityMismatch ────────────────────────────────────────────────────

describe('detectQuantityMismatch', () => {
  it('returns null when quantities match (po-001: 500 vs 500)', () => {
    expect(detectQuantityMismatch(po('po-001'), grs('po-001')[0])).toBeNull();
  });

  it('returns null when no goods receipt is provided', () => {
    expect(detectQuantityMismatch(po('po-001'), null)).toBeNull();
  });

  it('returns QUANTITY_MISMATCH for partial delivery (po-009: 250 ordered, 190 received)', () => {
    expect(detectQuantityMismatch(po('po-009'), grs('po-009')[0])).toBe('QUANTITY_MISMATCH');
  });

  it('returns QUANTITY_MISMATCH for po-010 partial delivery (120 ordered, 90 received)', () => {
    expect(detectQuantityMismatch(po('po-010'), grs('po-010')[0])).toBe('QUANTITY_MISMATCH');
  });
});

// ── detectOverdue ─────────────────────────────────────────────────────────────

describe('detectOverdue', () => {
  it('returns OVERDUE for po-005 (due 2026-05-20, status OPEN)', () => {
    expect(detectOverdue(po('po-005'))).toBe('OVERDUE');
  });

  it('returns OVERDUE for po-006 (due 2026-04-30, status OPEN)', () => {
    expect(detectOverdue(po('po-006'))).toBe('OVERDUE');
  });

  it('returns null for future-dated POs', () => {
    expect(detectOverdue(po('po-001'))).toBeNull();
  });

  it('returns null for PAID status even if past due', () => {
    const paidPO = { ...po('po-005'), status: 'PAID' };
    expect(detectOverdue(paidPO)).toBeNull();
  });

  it('returns null for CLOSED status even if past due', () => {
    const closedPO = { ...po('po-005'), status: 'CLOSED' };
    expect(detectOverdue(closedPO)).toBeNull();
  });
});

// ── detectMissingDocuments ────────────────────────────────────────────────────

describe('detectMissingDocuments', () => {
  it('returns NO_GOODS_RECEIPT for po-007 (no GR exists)', () => {
    const result = detectMissingDocuments(po('po-007'), grs('po-007'), invs('po-007'));
    expect(result).toContain('NO_GOODS_RECEIPT');
  });

  it('returns NO_INVOICE for po-008 (no invoice exists)', () => {
    const result = detectMissingDocuments(po('po-008'), grs('po-008'), invs('po-008'));
    expect(result).toContain('NO_INVOICE');
  });

  it('returns empty array when both documents present', () => {
    const result = detectMissingDocuments(po('po-001'), grs('po-001'), invs('po-001'));
    expect(result).toHaveLength(0);
  });
});

// ── runThreeWayMatch ──────────────────────────────────────────────────────────

describe('runThreeWayMatch', () => {
  it('returns CLEAN for a healthy PO (po-001)', () => {
    const result = runThreeWayMatch(po('po-001'), grs('po-001'), invs('po-001'));
    expect(result).toEqual(['CLEAN']);
  });

  it('returns CLEAN for po-002 and po-003', () => {
    expect(runThreeWayMatch(po('po-002'), grs('po-002'), invs('po-002'))).toEqual(['CLEAN']);
    expect(runThreeWayMatch(po('po-003'), grs('po-003'), invs('po-003'))).toEqual(['CLEAN']);
  });

  it('detects AMOUNT_MISMATCH for po-004', () => {
    const result = runThreeWayMatch(po('po-004'), grs('po-004'), invs('po-004'));
    expect(result).toContain('AMOUNT_MISMATCH');
  });

  it('detects AMOUNT_MISMATCH and OVERDUE for po-005', () => {
    const result = runThreeWayMatch(po('po-005'), grs('po-005'), invs('po-005'));
    expect(result).toContain('AMOUNT_MISMATCH');
    expect(result).toContain('OVERDUE');
  });

  it('detects OVERDUE for po-006', () => {
    const result = runThreeWayMatch(po('po-006'), grs('po-006'), invs('po-006'));
    expect(result).toContain('OVERDUE');
  });

  it('detects NO_GOODS_RECEIPT for po-007', () => {
    const result = runThreeWayMatch(po('po-007'), grs('po-007'), invs('po-007'));
    expect(result).toContain('NO_GOODS_RECEIPT');
  });

  it('detects NO_INVOICE for po-008', () => {
    const result = runThreeWayMatch(po('po-008'), grs('po-008'), invs('po-008'));
    expect(result).toContain('NO_INVOICE');
  });

  it('detects QUANTITY_MISMATCH for po-009', () => {
    const result = runThreeWayMatch(po('po-009'), grs('po-009'), invs('po-009'));
    expect(result).toContain('QUANTITY_MISMATCH');
  });

  it('detects QUANTITY_MISMATCH and AMOUNT_MISMATCH for po-010 (partial delivery with notes)', () => {
    // po-010 has notes explaining the partial delivery, but the rule-based engine
    // still flags it — AI layer is responsible for contextualising the notes.
    const result = runThreeWayMatch(po('po-010'), grs('po-010'), invs('po-010'));
    expect(result).toContain('QUANTITY_MISMATCH');
    expect(result).toContain('AMOUNT_MISMATCH');
  });

  it('never returns both CLEAN and a conflict', () => {
    for (const p of POs) {
      const result = runThreeWayMatch(p, grs(p.ID), invs(p.ID));
      if (result.includes('CLEAN')) {
        expect(result).toHaveLength(1);
      }
    }
  });
});

// ── AI provider factory ───────────────────────────────────────────────────────

describe('getAIProvider factory', () => {
  const { getAIProvider } = require('../srv/ai/ai-provider');

  it('returns mock provider by default', () => {
    delete process.env.AI_PROVIDER;
    const provider = getAIProvider();
    expect(typeof provider.analyzeConflict).toBe('function');
  });

  it('returns mock provider when AI_PROVIDER=mock', () => {
    process.env.AI_PROVIDER = 'mock';
    const provider = getAIProvider();
    expect(typeof provider.analyzeConflict).toBe('function');
  });

  it('throws for unknown provider', () => {
    process.env.AI_PROVIDER = 'unknown-llm';
    expect(() => getAIProvider()).toThrow(/Unknown AI_PROVIDER/);
    delete process.env.AI_PROVIDER;
  });
});

// ── mock provider integration ─────────────────────────────────────────────────

describe('mock provider', () => {
  const { analyzeConflict } = require('../srv/ai/mock-provider');

  it('returns a valid response for AMOUNT_MISMATCH', async () => {
    const result = await analyzeConflict({
      po: po('po-004'),
      conflicts: ['AMOUNT_MISMATCH'],
      notes: '',
    });
    expect(result).toHaveProperty('assessment');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('recommendation');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('mentions PO notes in the assessment when notes are provided', async () => {
    const result = await analyzeConflict({
      po: po('po-010'),
      conflicts: ['AMOUNT_MISMATCH', 'QUANTITY_MISMATCH'],
      notes: po('po-010').notes,
    });
    expect(result.assessment).toMatch(/partial delivery agreed/i);
  });

  it('returns CLEAN assessment for a clean PO', async () => {
    const result = await analyzeConflict({
      po: po('po-001'),
      conflicts: ['CLEAN'],
      notes: '',
    });
    expect(result.recommendation).toMatch(/no action/i);
  });
});
