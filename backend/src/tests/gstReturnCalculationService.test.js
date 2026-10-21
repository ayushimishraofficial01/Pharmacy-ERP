const { test } = require('node:test');
const assert = require('node:assert/strict');
const { periodToDateRange, buildHsnSummary, buildGstr1, buildGstr3b } = require('../services/gstReturnCalculationService');

test('periodToDateRange: builds a correct exclusive-end UTC range for a month', () => {
  const { from, to } = periodToDateRange('2026-08');
  assert.equal(from.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(to.toISOString(), '2026-09-01T00:00:00.000Z');
});

test('periodToDateRange: December rolls the year over correctly', () => {
  const { from, to } = periodToDateRange('2026-12');
  assert.equal(from.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.equal(to.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('periodToDateRange: rejects a malformed period', () => {
  assert.throws(() => periodToDateRange('not-a-period'));
  assert.throws(() => periodToDateRange('2026-13'));
});

function sampleInvoice(overrides = {}) {
  return {
    invoiceNumber: 'INV-000001',
    invoiceCategory: 'B2C',
    placeOfSupply: 'Uttar Pradesh',
    taxableAmount: 1000,
    cgst: 60,
    sgst: 60,
    igst: 0,
    items: [{ hsnCode: '3004', gstRate: 12, quantity: 10, taxableAmount: 1000, cgst: 60, sgst: 60, igst: 0 }],
    ...overrides,
  };
}

test('buildHsnSummary: groups line items by HSN + rate and sums quantities/amounts', () => {
  const invoices = [
    sampleInvoice(),
    sampleInvoice({ invoiceNumber: 'INV-000002', items: [{ hsnCode: '3004', gstRate: 12, quantity: 5, taxableAmount: 500, cgst: 30, sgst: 30, igst: 0 }] }),
  ];
  const summary = buildHsnSummary(invoices);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].hsnCode, '3004');
  assert.equal(summary[0].quantity, 15);
  assert.equal(summary[0].taxableAmount, 1500);
  assert.equal(summary[0].cgst, 90);
});

test('buildHsnSummary: different HSN codes stay in separate rows', () => {
  const invoices = [sampleInvoice(), sampleInvoice({ invoiceNumber: 'INV-2', items: [{ hsnCode: '3005', gstRate: 5, quantity: 1, taxableAmount: 100, cgst: 2.5, sgst: 2.5, igst: 0 }] })];
  const summary = buildHsnSummary(invoices);
  assert.equal(summary.length, 2);
});

test('buildGstr1: separates B2B and B2C(Small) invoices', () => {
  const b2b = sampleInvoice({ invoiceCategory: 'B2B', invoiceNumber: 'INV-B2B' });
  const b2c = sampleInvoice({ invoiceCategory: 'B2C', invoiceNumber: 'INV-B2C' });
  const result = buildGstr1([b2b, b2c], []);
  assert.equal(result.b2b.length, 1);
  assert.equal(result.b2b[0].invoiceNumber, 'INV-B2B');
  assert.equal(result.b2cs.length, 1);
});

test('buildGstr1: totals sum across all invoices regardless of category', () => {
  const invoices = [sampleInvoice({ invoiceCategory: 'B2B' }), sampleInvoice({ invoiceCategory: 'B2C', invoiceNumber: 'INV-2' })];
  const result = buildGstr1(invoices, []);
  assert.equal(result.totals.invoiceCount, 2);
  assert.equal(result.totals.taxableAmount, 2000);
  assert.equal(result.totals.cgst, 120);
});

test('buildGstr1: credit notes pass through unchanged', () => {
  const notes = [{ noteNumber: 'CN-1', taxableAmount: 100 }];
  const result = buildGstr1([], notes);
  assert.deepEqual(result.creditNotes, notes);
});

test('buildGstr3b: net GST payable = output tax minus ITC minus credit notes', () => {
  const invoices = [sampleInvoice()]; // taxable 1000, cgst 60, sgst 60
  const creditNotes = [];
  const inward = {
    purchases: [{ cgst: 20, sgst: 20, igst: 0 }],
    purchaseReturns: [],
  };
  const result = buildGstr3b(invoices, creditNotes, inward);
  assert.equal(result.outwardSupplies.cgst, 60);
  assert.equal(result.inputTaxCredit.cgst, 20);
  // net payable = (60+60) - (20+20) = 80
  assert.equal(result.netGstPayable, 80);
});

test('buildGstr3b: credit notes reduce net outward liability', () => {
  const invoices = [sampleInvoice()]; // cgst 60, sgst 60
  const creditNotes = [{ taxableAmount: 500, cgst: 30, sgst: 30, igst: 0 }];
  const inward = { purchases: [], purchaseReturns: [] };
  const result = buildGstr3b(invoices, creditNotes, inward);
  assert.equal(result.outwardSupplies.cgst, 30); // 60 - 30
  assert.equal(result.netGstPayable, 60); // (30+30) - 0
});

test('buildGstr3b: never returns a negative net payable (floors at zero)', () => {
  const invoices = [sampleInvoice()]; // output tax 120 total
  const inward = { purchases: [{ cgst: 1000, sgst: 1000, igst: 0 }], purchaseReturns: [] };
  const result = buildGstr3b(invoices, [], inward);
  assert.equal(result.netGstPayable, 0);
});

test('buildGstr3b: purchase returns reduce ITC', () => {
  const invoices = [sampleInvoice()];
  const inward = { purchases: [{ cgst: 100, sgst: 100, igst: 0 }], purchaseReturns: [{ cgst: 40, sgst: 40, igst: 0 }] };
  const result = buildGstr3b(invoices, [], inward);
  assert.equal(result.inputTaxCredit.cgst, 60);
});
