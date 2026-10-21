// Ported unchanged from Phase 3 — this is correct, well-reasoned decimal-safe
// money math (integer-paise arithmetic to avoid IEEE-754 rounding errors).
// Used by every module that touches GST/currency: purchases, sales, finance.
const PAISE_PER_RUPEE = 100;

function toPaise(rupees) {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Math.round(n * PAISE_PER_RUPEE);
}

function toRupees(paise) {
  return Math.round(paise) / PAISE_PER_RUPEE;
}

function sum(...rupeeAmounts) {
  const totalPaise = rupeeAmounts.reduce((acc, v) => acc + toPaise(v || 0), 0);
  return toRupees(totalPaise);
}

function subtract(a, b) {
  return toRupees(toPaise(a) - toPaise(b));
}

function multiply(a, b) {
  return toRupees(Math.round(toPaise(a) * b));
}

function percent(amount, pct) {
  const paise = toPaise(amount);
  const resultPaise = Math.round((paise * pct) / 100);
  return toRupees(resultPaise);
}

function roundToWhole(amount) {
  const rounded = Math.round(amount);
  const roundOff = toRupees(toPaise(rounded) - toPaise(amount));
  return { rounded, roundOff };
}

function clean(amount) {
  return toRupees(toPaise(amount));
}

module.exports = { toPaise, toRupees, sum, subtract, multiply, percent, roundToWhole, clean };
