// Phase 10 — fast/slow/non-moving/dead-stock classification (requirement 14).
// classifyMovement is pure (no DB) so it's unit-testable the same way
// gstCalculationService/saleCalculationService are.
const DEFAULT_THRESHOLDS = { fastMovingVelocity: 1, slowMovingVelocity: 0.2, nonMovingDays: 60, deadStockDays: 180 };

/**
 * daysSinceLastSale: null means "never sold" — always classified DEAD_STOCK
 * regardless of thresholds, since there's no sales history to call it
 * anything else. currentStock is informational only; a medicine with 0
 * stock is still classified by its historical movement (how well it USED
 * to sell), which is exactly what a purchaser needs to know before
 * restocking it.
 */
function classifyMovement({ avgDailySales, daysSinceLastSale }, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (daysSinceLastSale === null || daysSinceLastSale >= t.deadStockDays) return 'DEAD_STOCK';
  if (daysSinceLastSale >= t.nonMovingDays) return 'NON_MOVING';
  if (avgDailySales >= t.fastMovingVelocity) return 'FAST_MOVING';
  if (avgDailySales <= t.slowMovingVelocity) return 'SLOW_MOVING';
  return 'NORMAL';
}

module.exports = { classifyMovement, DEFAULT_THRESHOLDS };
