// Phase 10 — salt/composition normalization for substitute-medicine matching
// (requirement 2). Pure functions, no DB — unit-testable the same way
// gstCalculationService/saleCalculationService are.
//
// The Medicine master stores saltComposition as free text ("Paracetamol
// 500mg + Caffeine 30mg"). Two medicines are "the same composition" if they
// share the same set of active ingredients, regardless of strength,
// formatting, or ingredient order — so normalization strips strengths/units
// and sorts the ingredient list before comparing.
const UNIT_PATTERN = /\d+(\.\d+)?\s*(mg|mcg|g|kg|ml|l|iu|%|milligrams?|micrograms?|units?)\b/gi;

function normalizeSaltComposition(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[+,/]/)
    .map((part) =>
      part
        .toLowerCase()
        .replace(UNIT_PATTERN, ' ')
        .replace(/[^a-z\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .sort();
}

/** True if two raw composition strings normalize to the exact same ingredient set. */
function compositionsMatch(rawA, rawB) {
  const a = normalizeSaltComposition(rawA);
  const b = normalizeSaltComposition(rawB);
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

module.exports = { normalizeSaltComposition, compositionsMatch };
