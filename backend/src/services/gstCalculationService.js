// Ported unchanged from Phase 3 (pure functions, no DB access — easy to
// unit test and reuse for Sale calculations in Stage 4 too).
const money = require('../utils/money');

function calculateItem(raw, interState) {
  const quantity = Number(raw.quantity);
  const freeQuantity = Number(raw.freeQuantity || 0);
  const purchaseRate = Number(raw.purchaseRate);
  const gstRate = Number(raw.gstRate || 0);

  if (quantity <= 0) throw Object.assign(new Error('Quantity must be greater than zero'), { statusCode: 400 });
  if (purchaseRate < 0) throw Object.assign(new Error('Purchase rate cannot be negative'), { statusCode: 400 });
  if (freeQuantity < 0) throw Object.assign(new Error('Free quantity cannot be negative'), { statusCode: 400 });
  if (gstRate < 0 || gstRate > 100) throw Object.assign(new Error('Invalid GST rate'), { statusCode: 400 });

  const baseAmount = money.multiply(purchaseRate, quantity);

  let discountAmount = 0;
  if (raw.discountType === 'FLAT') {
    discountAmount = money.clean(raw.discountValue || 0);
    if (discountAmount > baseAmount) throw Object.assign(new Error('Discount cannot exceed base amount'), { statusCode: 400 });
  } else {
    const pct = Number(raw.discountValue || 0);
    if (pct < 0 || pct > 100) throw Object.assign(new Error('Invalid discount percentage'), { statusCode: 400 });
    discountAmount = money.percent(baseAmount, pct);
  }

  const taxableAmount = money.subtract(baseAmount, discountAmount);

  let cgst = 0,
    sgst = 0,
    igst = 0;
  if (interState) {
    igst = money.percent(taxableAmount, gstRate);
  } else {
    cgst = money.percent(taxableAmount, gstRate / 2);
    sgst = money.percent(taxableAmount, gstRate / 2);
  }

  const totalAmount = money.sum(taxableAmount, cgst, sgst, igst);
  const totalStockQty = quantity + freeQuantity;

  return {
    quantity,
    freeQuantity,
    totalStockQty,
    purchaseRate,
    baseAmount,
    discountType: raw.discountType || 'PERCENTAGE',
    discountValue: Number(raw.discountValue || 0),
    discountAmount,
    gstRate,
    taxableAmount,
    cgst,
    sgst,
    igst,
    totalAmount,
  };
}

function calculatePurchaseSummary(calculatedItems) {
  const subtotal = money.sum(...calculatedItems.map((i) => i.baseAmount));
  const discount = money.sum(...calculatedItems.map((i) => i.discountAmount));
  const taxableAmount = money.sum(...calculatedItems.map((i) => i.taxableAmount));
  const cgst = money.sum(...calculatedItems.map((i) => i.cgst));
  const sgst = money.sum(...calculatedItems.map((i) => i.sgst));
  const igst = money.sum(...calculatedItems.map((i) => i.igst));

  const calculatedTotal = money.sum(taxableAmount, cgst, sgst, igst);
  const { rounded: grandTotal, roundOff } = money.roundToWhole(calculatedTotal);

  return { subtotal, discount, taxableAmount, cgst, sgst, igst, calculatedTotal, roundOff, grandTotal };
}

function isInterState(storeStateCode, supplierStateCode) {
  if (!storeStateCode || !supplierStateCode) return false;
  return String(storeStateCode).trim() !== String(supplierStateCode).trim();
}

module.exports = { calculateItem, calculatePurchaseSummary, isInterState };
