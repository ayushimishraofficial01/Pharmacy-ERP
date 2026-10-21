const { test } = require('node:test');
const assert = require('node:assert/strict');
const gstCalc = require('../services/gstCalculationService');

test('calculateItem: basic intra-state 12% GST, no discount', () => {
  const result = gstCalc.calculateItem({ quantity: 10, freeQuantity: 0, purchaseRate: 100, gstRate: 12, discountType: 'PERCENTAGE', discountValue: 0 }, false);
  assert.equal(result.baseAmount, 1000);
  assert.equal(result.discountAmount, 0);
  assert.equal(result.taxableAmount, 1000);
  // Intra-state splits GST evenly into CGST+SGST.
  assert.equal(result.cgst, 60);
  assert.equal(result.sgst, 60);
  assert.equal(result.igst, 0);
  assert.equal(result.totalAmount, 1120);
});

test('calculateItem: inter-state charges IGST only, not CGST+SGST', () => {
  const result = gstCalc.calculateItem({ quantity: 10, purchaseRate: 100, gstRate: 12 }, true);
  assert.equal(result.cgst, 0);
  assert.equal(result.sgst, 0);
  assert.equal(result.igst, 120);
  assert.equal(result.totalAmount, 1120);
});

test('calculateItem: percentage discount applied before tax', () => {
  const result = gstCalc.calculateItem({ quantity: 10, purchaseRate: 100, gstRate: 18, discountType: 'PERCENTAGE', discountValue: 10 }, false);
  assert.equal(result.baseAmount, 1000);
  assert.equal(result.discountAmount, 100); // 10% of 1000
  assert.equal(result.taxableAmount, 900);
  assert.equal(result.cgst, 81); // 9% of 900
  assert.equal(result.sgst, 81);
  assert.equal(result.totalAmount, 1062);
});

test('calculateItem: flat discount cannot exceed base amount', () => {
  assert.throws(() => gstCalc.calculateItem({ quantity: 1, purchaseRate: 50, gstRate: 12, discountType: 'FLAT', discountValue: 100 }, false), /Discount cannot exceed base amount/);
});

test('calculateItem: free quantity adds to stock but not to billed amount', () => {
  const result = gstCalc.calculateItem({ quantity: 10, freeQuantity: 2, purchaseRate: 100, gstRate: 0 }, false);
  assert.equal(result.totalStockQty, 12); // 10 paid + 2 free go into stock
  assert.equal(result.baseAmount, 1000); // billed on paid quantity only
});

test('calculateItem: rejects zero or negative quantity', () => {
  assert.throws(() => gstCalc.calculateItem({ quantity: 0, purchaseRate: 100, gstRate: 12 }, false), /Quantity must be greater than zero/);
  assert.throws(() => gstCalc.calculateItem({ quantity: -5, purchaseRate: 100, gstRate: 12 }, false), /Quantity must be greater than zero/);
});

test('calculateItem: rejects negative purchase rate', () => {
  assert.throws(() => gstCalc.calculateItem({ quantity: 1, purchaseRate: -10, gstRate: 12 }, false), /Purchase rate cannot be negative/);
});

test('calculateItem: rejects out-of-range GST rate', () => {
  assert.throws(() => gstCalc.calculateItem({ quantity: 1, purchaseRate: 100, gstRate: 150 }, false), /Invalid GST rate/);
});

test('calculatePurchaseSummary: aggregates multiple lines and rounds to whole rupees', () => {
  const items = [gstCalc.calculateItem({ quantity: 10, purchaseRate: 100, gstRate: 12 }, false), gstCalc.calculateItem({ quantity: 5, purchaseRate: 50.5, gstRate: 5 }, false)];
  const summary = gstCalc.calculatePurchaseSummary(items);
  // line1: 1000 taxable, 60+60 gst, total 1120
  // line2: 252.5 taxable, 6.31+6.31... let's just check internal consistency
  assert.equal(summary.subtotal, 1252.5);
  assert.equal(summary.taxableAmount, 1252.5);
  const calculatedTotal = Number((summary.taxableAmount + summary.cgst + summary.sgst + summary.igst).toFixed(2));
  assert.equal(summary.calculatedTotal, calculatedTotal);
  // grandTotal must be a whole rupee amount, with roundOff explaining the difference.
  assert.equal(summary.grandTotal, Math.round(summary.calculatedTotal));
  assert.equal(Number((summary.grandTotal - summary.calculatedTotal).toFixed(2)), summary.roundOff);
});

test('isInterState: same state code is intra-state', () => {
  assert.equal(gstCalc.isInterState('09', '09'), false);
});

test('isInterState: different state codes are inter-state', () => {
  assert.equal(gstCalc.isInterState('09', '27'), true);
});

test('isInterState: missing state code defaults to intra-state (fail-safe, not fail-open on tax)', () => {
  assert.equal(gstCalc.isInterState(null, '27'), false);
  assert.equal(gstCalc.isInterState('09', undefined), false);
});
