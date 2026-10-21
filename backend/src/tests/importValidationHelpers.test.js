const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseNumber, parseDate, mapRow, validateMappedRow } = require('../services/importValidationHelpers');

test('parseNumber: parses a plain number', () => {
  assert.equal(parseNumber('42'), 42);
  assert.equal(parseNumber(42), 42);
});

test('parseNumber: strips thousands separators', () => {
  assert.equal(parseNumber('1,234.50'), 1234.5);
});

test('parseNumber: returns null (not 0/NaN) for missing/empty/non-numeric input', () => {
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber(undefined), null);
  assert.equal(parseNumber('not a number'), null);
});

test('parseDate: parses DD/MM/YYYY', () => {
  const d = parseDate('15/06/2027');
  assert.equal(d.getUTCFullYear(), 2027);
  assert.equal(d.getUTCMonth(), 5); // June, 0-indexed
  assert.equal(d.getUTCDate(), 15);
});

test('parseDate: parses DD-MM-YYYY', () => {
  const d = parseDate('01-12-2026');
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 11);
  assert.equal(d.getUTCDate(), 1);
});

test('parseDate: parses MM/YYYY as the last day of that month', () => {
  const d = parseDate('06/2027');
  assert.equal(d.getUTCFullYear(), 2027);
  assert.equal(d.getUTCMonth(), 5);
  assert.equal(d.getUTCDate(), 30); // June has 30 days
});

test('parseDate: returns null for garbage input', () => {
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
});

test('parseDate: passes through an existing valid Date unchanged', () => {
  const original = new Date('2026-01-01T00:00:00Z');
  assert.equal(parseDate(original), original);
});

test('mapRow: applies a column mapping from raw spreadsheet headers to target fields', () => {
  const row = { 'Product Name': 'Paracetamol', Batch: 'B123', Qty: '10' };
  const mapping = { medicineName: 'Product Name', batchNumber: 'Batch', quantity: 'Qty' };
  assert.deepEqual(mapRow(row, mapping), { medicineName: 'Paracetamol', batchNumber: 'B123', quantity: '10' });
});

test('mapRow: skips mapping entries with no source header', () => {
  const row = { A: '1' };
  assert.deepEqual(mapRow(row, { field1: 'A', field2: '' }), { field1: '1' });
});

test('validateMappedRow: flags every missing required field', () => {
  const { errors } = validateMappedRow({});
  assert.ok(errors.some((e) => e.includes('medicineName')));
  assert.ok(errors.some((e) => e.includes('batchNumber')));
  assert.ok(errors.some((e) => e.includes('expiryDate')));
  assert.ok(errors.some((e) => e.includes('quantity')));
});

test('validateMappedRow: a fully valid row has no errors and correctly typed output', () => {
  const { errors, parsed } = validateMappedRow({
    medicineName: 'Paracetamol 500mg',
    batchNumber: 'B123',
    expiryDate: '12/2027',
    quantity: '100',
    purchaseRate: '5.50',
    mrp: '10',
    sellingRate: '9',
  });
  assert.deepEqual(errors, []);
  assert.equal(parsed.medicineName, 'Paracetamol 500mg');
  assert.equal(parsed.quantity, 100);
  assert.equal(parsed.purchaseRate, 5.5);
});

test('validateMappedRow: rejects a zero or negative quantity', () => {
  const { errors } = validateMappedRow({ medicineName: 'X', batchNumber: 'B1', expiryDate: '01/2027', quantity: '0', purchaseRate: '1', mrp: '1', sellingRate: '1' });
  assert.ok(errors.some((e) => e.includes('quantity')));
});

test('validateMappedRow: rejects an unparseable expiry date', () => {
  const { errors } = validateMappedRow({ medicineName: 'X', batchNumber: 'B1', expiryDate: 'not a date', quantity: '1', purchaseRate: '1', mrp: '1', sellingRate: '1' });
  assert.ok(errors.some((e) => e.includes('expiryDate')));
});

test('validateMappedRow: defaults freeQuantity to 0 when not provided', () => {
  const { parsed } = validateMappedRow({ medicineName: 'X', batchNumber: 'B1', expiryDate: '01/2027', quantity: '1', purchaseRate: '1', mrp: '1', sellingRate: '1' });
  assert.equal(parsed.freeQuantity, 0);
});
