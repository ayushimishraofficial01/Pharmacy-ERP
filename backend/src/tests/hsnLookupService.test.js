const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRateForDate } = require('../services/hsnLookupService');

test('resolveRateForDate: returns the current rate when asked for today with no history', () => {
  const hsn = { gstRate: 12, effectiveDate: '2026-01-01', rateHistory: [] };
  assert.equal(resolveRateForDate(hsn, '2026-06-01'), 12);
});

test('resolveRateForDate: falls back to a historical rate for a date before the current change', () => {
  const hsn = {
    gstRate: 18, // current rate, effective from the change below
    effectiveDate: '2026-04-01',
    rateHistory: [{ gstRate: 12, effectiveFrom: '2025-01-01' }],
  };
  assert.equal(resolveRateForDate(hsn, '2026-02-01'), 12);
  assert.equal(resolveRateForDate(hsn, '2026-04-01'), 18);
  assert.equal(resolveRateForDate(hsn, '2026-12-31'), 18);
});

test('resolveRateForDate: picks the most recent applicable entry across multiple history changes', () => {
  const hsn = {
    gstRate: 5,
    effectiveDate: '2027-01-01',
    rateHistory: [
      { gstRate: 12, effectiveFrom: '2025-01-01' },
      { gstRate: 18, effectiveFrom: '2026-01-01' },
    ],
  };
  assert.equal(resolveRateForDate(hsn, '2025-06-01'), 12);
  assert.equal(resolveRateForDate(hsn, '2026-06-01'), 18);
  assert.equal(resolveRateForDate(hsn, '2027-06-01'), 5);
});

test('resolveRateForDate: returns null for a null doc', () => {
  assert.equal(resolveRateForDate(null, '2026-01-01'), null);
});

test('resolveRateForDate: returns null when the date is before any known effective date', () => {
  const hsn = { gstRate: 12, effectiveDate: '2026-04-01', rateHistory: [] };
  assert.equal(resolveRateForDate(hsn, '2020-01-01'), null);
});
