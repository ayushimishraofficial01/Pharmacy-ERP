// Adapted from Phase 4's gstCalculator — same logic, rewired onto money.js
// (integer-paise arithmetic) instead of raw float rounding, for consistency
// with Stage 3's gstCalculationService (Purchase side).
const money = require('../utils/money');

function resolveTaxType(storeState, customerState, defaultBehavior = 'INTRA_STATE') {
  if (!customerState) return defaultBehavior === 'INTER_STATE' ? 'INTER_STATE' : 'INTRA_STATE';
  const a = String(storeState || '').trim().toLowerCase();
  const b = String(customerState || '').trim().toLowerCase();
  if (!a) return defaultBehavior === 'INTER_STATE' ? 'INTER_STATE' : 'INTRA_STATE';
  return a === b ? 'INTRA_STATE' : 'INTER_STATE';
}

/** Tax split for a single line's gross amount (post all discounts). */
function calculateLineTax(grossAmount, gstRate, taxType, pricesIncludeGST) {
  const rate = Number(gstRate) || 0;
  let taxableAmount;
  let totalTax;

  if (pricesIncludeGST) {
    taxableAmount = money.clean(grossAmount / (1 + rate / 100));
    totalTax = money.subtract(grossAmount, taxableAmount);
  } else {
    taxableAmount = money.clean(grossAmount);
    totalTax = money.percent(grossAmount, rate);
  }

  let cgst = 0,
    sgst = 0,
    igst = 0;
  if (taxType === 'INTER_STATE') {
    igst = totalTax;
  } else {
    cgst = money.clean(totalTax / 2);
    sgst = money.subtract(totalTax, cgst); // avoid rounding drift
  }

  const totalAmount = money.sum(taxableAmount, cgst, sgst, igst);
  return { taxableAmount, cgst, sgst, igst, totalTax, totalAmount };
}

function calculateDiscount(baseAmount, discountType, discountValue) {
  let discountAmount = 0;
  if (discountType === 'PERCENTAGE') {
    discountAmount = money.percent(baseAmount, Number(discountValue) || 0);
  } else if (discountType === 'FIXED_AMOUNT') {
    discountAmount = money.clean(discountValue || 0);
  }
  discountAmount = Math.min(Math.max(discountAmount, 0), baseAmount);
  return money.clean(discountAmount);
}

/** Allocate a bill-level discount proportionally across item bases; last item absorbs the rounding remainder. */
function allocateBillDiscount(items, billDiscountAmount) {
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const allocation = {};

  if (total <= 0 || billDiscountAmount <= 0) {
    items.forEach((i) => (allocation[i.key] = 0));
    return allocation;
  }

  let allocated = 0;
  items.forEach((item, idx) => {
    let share;
    if (idx === items.length - 1) {
      share = money.subtract(billDiscountAmount, allocated);
    } else {
      share = money.clean((item.amount / total) * billDiscountAmount);
      allocated = money.sum(allocated, share);
    }
    allocation[item.key] = Math.min(share, item.amount);
  });

  return allocation;
}

function calculateRoundOff(calculatedTotal) {
  return money.roundToWhole(calculatedTotal);
}

module.exports = { resolveTaxType, calculateLineTax, calculateDiscount, allocateBillDiscount, calculateRoundOff };
