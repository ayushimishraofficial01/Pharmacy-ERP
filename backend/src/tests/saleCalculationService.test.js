const { test } = require('node:test');
const assert = require('node:assert/strict');
const saleCalc = require('../services/saleCalculationService');

test('resolveTaxType: same state is intra-state', () => {
  assert.equal(saleCalc.resolveTaxType('Uttar Pradesh', 'uttar pradesh'), 'INTRA_STATE');
});

test('resolveTaxType: different states is inter-state', () => {
  assert.equal(saleCalc.resolveTaxType('Uttar Pradesh', 'Maharashtra'), 'INTER_STATE');
});

test('resolveTaxType: walk-in customer with no state defaults to intra-state', () => {
  assert.equal(saleCalc.resolveTaxType('Uttar Pradesh', null), 'INTRA_STATE');
});

test('calculateLineTax: tax-exclusive pricing (standard case)', () => {
  const result = saleCalc.calculateLineTax(1000, 12, 'INTRA_STATE', false);
  assert.equal(result.taxableAmount, 1000);
  assert.equal(result.cgst, 60);
  assert.equal(result.sgst, 60);
  assert.equal(result.totalAmount, 1120);
});

test('calculateLineTax: tax-inclusive pricing backs out GST from gross amount', () => {
  // If 1120 already includes 12% GST, the taxable base is 1000.
  const result = saleCalc.calculateLineTax(1120, 12, 'INTRA_STATE', true);
  assert.equal(result.taxableAmount, 1000);
  assert.equal(result.totalAmount, 1120); // gross amount is preserved either way
});

test('calculateLineTax: inter-state uses IGST only', () => {
  const result = saleCalc.calculateLineTax(1000, 18, 'INTER_STATE', false);
  assert.equal(result.igst, 180);
  assert.equal(result.cgst, 0);
  assert.equal(result.sgst, 0);
});

test('calculateDiscount: percentage discount', () => {
  assert.equal(saleCalc.calculateDiscount(1000, 'PERCENTAGE', 15), 150);
});

test('calculateDiscount: fixed amount discount', () => {
  assert.equal(saleCalc.calculateDiscount(1000, 'FIXED_AMOUNT', 200), 200);
});

test('calculateDiscount: never exceeds the base amount even if requested', () => {
  assert.equal(saleCalc.calculateDiscount(100, 'FIXED_AMOUNT', 500), 100);
  assert.equal(saleCalc.calculateDiscount(100, 'PERCENTAGE', 150), 100);
});

test('calculateDiscount: never goes negative', () => {
  assert.equal(saleCalc.calculateDiscount(100, 'FIXED_AMOUNT', -50), 0);
});

test('allocateBillDiscount: splits proportionally across items', () => {
  const items = [
    { key: 'a', amount: 600 },
    { key: 'b', amount: 400 },
  ];
  const allocation = saleCalc.allocateBillDiscount(items, 100);
  assert.equal(allocation.a, 60); // 60% of the 1000 total -> 60% of the 100 discount
  assert.equal(allocation.b, 40);
  assert.equal(allocation.a + allocation.b, 100); // must sum exactly to the bill discount, no leftover paisa
});

test('allocateBillDiscount: last item absorbs rounding remainder so allocations sum exactly', () => {
  const items = [
    { key: 'a', amount: 333 },
    { key: 'b', amount: 333 },
    { key: 'c', amount: 334 },
  ];
  const allocation = saleCalc.allocateBillDiscount(items, 100);
  const total = allocation.a + allocation.b + allocation.c;
  assert.equal(total, 100); // exact, not 99.99 or 100.01 from float division
});

test('allocateBillDiscount: zero discount allocates nothing', () => {
  const items = [{ key: 'a', amount: 500 }];
  const allocation = saleCalc.allocateBillDiscount(items, 0);
  assert.equal(allocation.a, 0);
});

test('allocateBillDiscount: per-item share never exceeds that item\'s own amount', () => {
  // Even with a large discount, no single item's allocated share can exceed
  // its own pre-discount amount (would make that line negative).
  const items = [
    { key: 'a', amount: 10 },
    { key: 'b', amount: 990 },
  ];
  const allocation = saleCalc.allocateBillDiscount(items, 950);
  assert.ok(allocation.a <= 10);
  assert.ok(allocation.b <= 990);
});

test('calculateRoundOff matches money.roundToWhole behavior', () => {
  const { rounded, roundOff } = saleCalc.calculateRoundOff(1499.6);
  assert.equal(rounded, 1500);
  assert.equal(roundOff, 0.4);
});

test('end-to-end: item discount + bill discount + tax compose correctly for a realistic 2-item bill', () => {
  // Item A: 5 units @ 50 = 250, 10% item discount -> 225 taxable base, 12% GST
  // Item B: 2 units @ 100 = 200, no item discount, 5% GST
  const aBase = 250;
  const aItemDiscount = saleCalc.calculateDiscount(aBase, 'PERCENTAGE', 10); // 25
  const bBase = 200;

  // Bill-level flat discount of 50, allocated proportionally over post-item-discount amounts.
  const postItemDiscount = { a: aBase - aItemDiscount, b: bBase }; // 225, 200
  const billDiscountTotal = 50;
  const allocation = saleCalc.allocateBillDiscount(
    [
      { key: 'a', amount: postItemDiscount.a },
      { key: 'b', amount: postItemDiscount.b },
    ],
    billDiscountTotal
  );
  assert.equal(allocation.a + allocation.b, billDiscountTotal);

  const aGross = postItemDiscount.a - allocation.a;
  const bGross = postItemDiscount.b - allocation.b;
  const aTax = saleCalc.calculateLineTax(aGross, 12, 'INTRA_STATE', false);
  const bTax = saleCalc.calculateLineTax(bGross, 5, 'INTRA_STATE', false);

  const grandTotalBeforeRounding = aTax.totalAmount + bTax.totalAmount;
  const { rounded } = saleCalc.calculateRoundOff(grandTotalBeforeRounding);
  // Sanity: final total must be less than the naive sum with no discounts at all.
  assert.ok(rounded < aBase + bBase + 60); // well under undiscounted total+generous tax estimate
  assert.ok(rounded > 0);
});
