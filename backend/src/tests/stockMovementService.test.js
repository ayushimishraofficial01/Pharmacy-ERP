const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyMovement, DEFAULT_THRESHOLDS } = require('../services/stockMovementService');

test('classifyMovement: never sold (daysSinceLastSale null) is always DEAD_STOCK', () => {
  assert.equal(classifyMovement({ avgDailySales: 0, daysSinceLastSale: null }), 'DEAD_STOCK');
});

test('classifyMovement: no sale for >= deadStockDays is DEAD_STOCK even with some velocity on record', () => {
  assert.equal(classifyMovement({ avgDailySales: 2, daysSinceLastSale: 200 }), 'DEAD_STOCK');
});

test('classifyMovement: no sale for >= nonMovingDays but < deadStockDays is NON_MOVING', () => {
  assert.equal(classifyMovement({ avgDailySales: 0.05, daysSinceLastSale: 90 }), 'NON_MOVING');
});

test('classifyMovement: high velocity and recent sale is FAST_MOVING', () => {
  assert.equal(classifyMovement({ avgDailySales: 5, daysSinceLastSale: 1 }), 'FAST_MOVING');
});

test('classifyMovement: low velocity and recent sale is SLOW_MOVING', () => {
  assert.equal(classifyMovement({ avgDailySales: 0.1, daysSinceLastSale: 5 }), 'SLOW_MOVING');
});

test('classifyMovement: mid velocity and recent sale is NORMAL', () => {
  assert.equal(classifyMovement({ avgDailySales: 0.5, daysSinceLastSale: 5 }), 'NORMAL');
});

test('classifyMovement: boundary — exactly fastMovingVelocity counts as FAST_MOVING', () => {
  assert.equal(classifyMovement({ avgDailySales: DEFAULT_THRESHOLDS.fastMovingVelocity, daysSinceLastSale: 1 }), 'FAST_MOVING');
});

test('classifyMovement: boundary — exactly nonMovingDays counts as NON_MOVING, not NORMAL', () => {
  assert.equal(classifyMovement({ avgDailySales: 3, daysSinceLastSale: DEFAULT_THRESHOLDS.nonMovingDays }), 'NON_MOVING');
});

test('classifyMovement: custom thresholds override the defaults', () => {
  assert.equal(classifyMovement({ avgDailySales: 0.5, daysSinceLastSale: 5 }, { fastMovingVelocity: 0.4 }), 'FAST_MOVING');
});
