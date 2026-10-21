const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getFinancialYear } = require('../utils/financialYear');

test('a date in April (the default FY start month) begins a new financial year', () => {
  assert.equal(getFinancialYear('2026-04-01'), '2026-27');
  assert.equal(getFinancialYear('2026-04-15'), '2026-27');
});

test('a date in March belongs to the financial year that started the previous April', () => {
  assert.equal(getFinancialYear('2027-03-31'), '2026-27');
});

test('a date in January belongs to the financial year that started the previous April', () => {
  assert.equal(getFinancialYear('2027-01-15'), '2026-27');
});

test('respects a custom financial year start month', () => {
  // January-start FY (calendar year): any date in 2026 is FY 2026-27... no,
  // for a Jan start, the FY IS the calendar year, so this checks month=1 behaves as a plain calendar year.
  assert.equal(getFinancialYear('2026-06-15', 1), '2026-27');
  assert.equal(getFinancialYear('2026-12-31', 1), '2026-27');
});
