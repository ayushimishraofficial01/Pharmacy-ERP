const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeCommissionAmount } = require('../services/doctorCommissionService');

test('computeCommissionAmount: PERCENTAGE rule computes a percentage of saleAmount', () => {
  const rule = { commissionType: 'PERCENTAGE', commissionValue: 10 };
  assert.equal(computeCommissionAmount(rule, { saleAmount: 1000, quantity: 5 }), 100);
});

test('computeCommissionAmount: FIXED_AMOUNT rule multiplies by quantity, ignoring saleAmount', () => {
  const rule = { commissionType: 'FIXED_AMOUNT', commissionValue: 5 };
  assert.equal(computeCommissionAmount(rule, { saleAmount: 1000, quantity: 3 }), 15);
});

test('computeCommissionAmount: rounds to 2 decimal places', () => {
  const rule = { commissionType: 'PERCENTAGE', commissionValue: 7.5 };
  assert.equal(computeCommissionAmount(rule, { saleAmount: 333.33, quantity: 1 }), 25);
});

test('computeCommissionAmount: null rule returns 0', () => {
  assert.equal(computeCommissionAmount(null, { saleAmount: 1000, quantity: 1 }), 0);
});

test('computeCommissionAmount: unknown commissionType returns 0 rather than throwing', () => {
  const rule = { commissionType: 'SOMETHING_ELSE', commissionValue: 10 };
  assert.equal(computeCommissionAmount(rule, { saleAmount: 1000, quantity: 1 }), 0);
});

test('computeCommissionAmount: zero commissionValue returns 0', () => {
  const rule = { commissionType: 'PERCENTAGE', commissionValue: 0 };
  assert.equal(computeCommissionAmount(rule, { saleAmount: 1000, quantity: 1 }), 0);
});
