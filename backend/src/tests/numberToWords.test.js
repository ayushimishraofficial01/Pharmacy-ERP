const { test } = require('node:test');
const assert = require('node:assert/strict');
const { amountToWordsINR, integerToIndianWords } = require('../utils/numberToWords');

test('integerToIndianWords: zero', () => {
  assert.equal(integerToIndianWords(0), 'Zero');
});

test('integerToIndianWords: basic hundreds', () => {
  assert.equal(integerToIndianWords(105), 'One Hundred Five');
});

test('integerToIndianWords: thousands', () => {
  assert.equal(integerToIndianWords(1234), 'One Thousand Two Hundred Thirty Four');
});

test('integerToIndianWords: lakh and crore grouping (Indian system, not Western)', () => {
  assert.equal(integerToIndianWords(100000), 'One Lakh');
  assert.equal(integerToIndianWords(1234567), 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven');
  assert.equal(integerToIndianWords(10000000), 'One Crore');
});

test('amountToWordsINR: whole rupees, no paise clause', () => {
  assert.equal(amountToWordsINR(500), 'Rupees Five Hundred Only');
});

test('amountToWordsINR: with paise', () => {
  assert.equal(amountToWordsINR(1234.5), 'Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only');
});

test('amountToWordsINR: zero amount', () => {
  assert.equal(amountToWordsINR(0), 'Rupees Zero Only');
});

test('amountToWordsINR: rounds paise correctly', () => {
  assert.equal(amountToWordsINR(99.999), 'Rupees One Hundred Only');
});
