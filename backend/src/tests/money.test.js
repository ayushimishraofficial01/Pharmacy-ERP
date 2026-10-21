// Runs with Node's built-in test runner: `node --test src/tests`
// No DB, no npm deps — money.js is pure, so these actually execute and
// verify correctness, unlike everything else in this merge which only got
// a syntax check (see MERGE_NOTES.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const money = require('../utils/money');

test('toPaise/toRupees round-trip', () => {
  assert.equal(money.toPaise(10.5), 1050);
  assert.equal(money.toPaise('10.5'), 1050);
  assert.equal(money.toRupees(1050), 10.5);
  assert.equal(money.toPaise(null), 0);
  assert.equal(money.toPaise(undefined), 0);
});

test('toPaise rounds correctly on floating point edge cases', () => {
  // The classic IEEE-754 trap: 0.1 + 0.2 !== 0.3 in raw float math.
  // toPaise must round to the nearest paisa, not propagate the float error.
  assert.equal(money.toPaise(0.1 + 0.2), 30); // 0.30 rupees = 30 paise
});

test('sum adds multiple amounts without float drift', () => {
  // 10 lines of 0.1 in naive float math often doesn't equal exactly 1.
  const amounts = Array(10).fill(0.1);
  assert.equal(money.sum(...amounts), 1);
});

test('subtract', () => {
  assert.equal(money.subtract(100, 33.33), 66.67);
  assert.equal(money.subtract(10, 10), 0);
});

test('multiply', () => {
  assert.equal(money.multiply(10.5, 3), 31.5);
  assert.equal(money.multiply(19.99, 7), 139.93);
});

test('percent', () => {
  assert.equal(money.percent(1000, 18), 180); // 18% GST on 1000
  assert.equal(money.percent(100, 12.5), 12.5);
  assert.equal(money.percent(33.33, 6), 2); // 6% of 33.33 = 1.9998 -> rounds to 2.00
});

test('roundToWhole computes correct roundOff for invoice totals', () => {
  const { rounded, roundOff } = money.roundToWhole(1234.6);
  assert.equal(rounded, 1235);
  assert.equal(roundOff, 0.4);
});

test('roundToWhole on an already-whole amount has zero roundOff', () => {
  const { rounded, roundOff } = money.roundToWhole(500);
  assert.equal(rounded, 500);
  assert.equal(roundOff, 0);
});

test('clean normalizes to 2 decimal places', () => {
  assert.equal(money.clean(10.999), 11);
  assert.equal(money.clean(10.001), 10);
});
