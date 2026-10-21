const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidGstin, validateInvoice, validateInvoiceBatch } = require('../services/gstValidationService');

const validInvoice = () => ({
  invoiceNumber: 'INV-000001',
  invoiceDate: new Date('2026-08-01'),
  sellerGstin: '09ABCDE1234F1Z5',
  buyerGstin: null,
  placeOfSupply: 'Uttar Pradesh',
  taxableAmount: 1000,
  cgst: 60,
  sgst: 60,
  igst: 0,
  items: [{ hsnCode: '3004', taxableAmount: 1000, gstRate: 12, cgst: 60, sgst: 60, igst: 0 }],
});

test('isValidGstin: accepts a well-formed GSTIN', () => {
  assert.equal(isValidGstin('09ABCDE1234F1Z5'), true);
});

test('isValidGstin: rejects malformed values', () => {
  assert.equal(isValidGstin('not-a-gstin'), false);
  assert.equal(isValidGstin(''), false);
  assert.equal(isValidGstin(null), false);
});

test('validateInvoice: a fully-formed invoice has no errors', () => {
  assert.deepEqual(validateInvoice(validInvoice()), []);
});

test('validateInvoice: missing seller GSTIN is reported with the invoice number named', () => {
  const invoice = { ...validInvoice(), sellerGstin: null };
  const errors = validateInvoice(invoice);
  assert.ok(errors.some((e) => e.field === 'sellerGstin' && e.message.includes('INV-000001')));
});

test('validateInvoice: missing HSN on a line item is reported per-line', () => {
  const invoice = validInvoice();
  invoice.items = [{ hsnCode: '', taxableAmount: 1000 }];
  const errors = validateInvoice(invoice);
  assert.ok(errors.some((e) => e.field === 'hsnCode'));
});

test('validateInvoice: invalid buyer GSTIN (B2B) is flagged', () => {
  const invoice = { ...validInvoice(), buyerGstin: 'GARBAGE' };
  const errors = validateInvoice(invoice);
  assert.ok(errors.some((e) => e.field === 'buyerGstin'));
});

test('validateInvoice: B2C sale (no buyer GSTIN) is valid', () => {
  const invoice = { ...validInvoice(), buyerGstin: null };
  assert.deepEqual(validateInvoice(invoice), []);
});

test('validateInvoiceBatch: flags duplicate invoice numbers across the batch', () => {
  const a = validInvoice();
  const b = validInvoice();
  const result = validateInvoiceBatch([a, b]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('Duplicate invoice number')));
});

test('validateInvoiceBatch: valid batch reports correct counts', () => {
  const a = validInvoice();
  const b = { ...validInvoice(), invoiceNumber: 'INV-000002' };
  const result = validateInvoiceBatch([a, b]);
  assert.equal(result.valid, true);
  assert.equal(result.totalInvoices, 2);
  assert.equal(result.validInvoiceCount, 2);
  assert.equal(result.invalidInvoiceCount, 0);
});

test('validateInvoiceBatch: never silently drops an invalid record — it is still counted and reported', () => {
  const a = validInvoice();
  const bad = { ...validInvoice(), invoiceNumber: 'INV-000002', sellerGstin: null };
  const result = validateInvoiceBatch([a, bad]);
  assert.equal(result.totalInvoices, 2);
  assert.equal(result.invalidInvoiceCount, 1);
  assert.ok(result.errors.some((e) => e.invoiceNumber === 'INV-000002'));
});
