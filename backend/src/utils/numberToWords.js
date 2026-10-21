// Phase 11 — Feature 3, requirement 7: "Amount in Words" must be generated
// dynamically from the actual invoice total, never hardcoded. Pure function,
// no DB — same testing pattern as money.js/gstCalculationService.js.
// Uses the Indian numbering system (lakh/crore), matching how GST invoices
// in India conventionally print amounts in words.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? ' ' + ONES[ones] : ''}`;
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/** Converts a non-negative integer < 10^14 into Indian-system words (no currency unit). */
function integerToIndianWords(n) {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundreds = n;

  const parts = [];
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundreds) parts.push(threeDigits(hundreds));
  return parts.join(' ');
}

/**
 * Converts a rupee amount (number, may have paise) into words, e.g.
 * amountToWordsINR(1234.5) -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only"
 */
function amountToWordsINR(amount) {
  const value = Math.abs(Number(amount) || 0);
  // Round to whole paise first (as integer paise) to avoid a 99.5-paise
  // rounding producing an invalid paise value like 100.
  const totalPaise = Math.round(value * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  const rupeeWords = integerToIndianWords(rupees);
  let result = `Rupees ${rupeeWords}`;
  if (paise > 0) {
    result += ` and ${twoDigits(paise)} Paise`;
  }
  result += ' Only';
  return result;
}

module.exports = { integerToIndianWords, amountToWordsINR };
