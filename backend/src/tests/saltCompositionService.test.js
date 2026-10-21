const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSaltComposition, compositionsMatch } = require('../services/saltCompositionService');

test('normalizeSaltComposition: strips strength/units and lowercases a single ingredient', () => {
  assert.deepEqual(normalizeSaltComposition('Paracetamol 500mg'), ['paracetamol']);
});

test('normalizeSaltComposition: splits a combination on + and sorts alphabetically', () => {
  assert.deepEqual(normalizeSaltComposition('Caffeine 30mg + Paracetamol 500mg'), ['caffeine', 'paracetamol']);
});

test('normalizeSaltComposition: handles comma and slash separators too', () => {
  assert.deepEqual(normalizeSaltComposition('Amoxicillin 500mg, Clavulanic Acid 125mg'), ['amoxicillin', 'clavulanic acid']);
  assert.deepEqual(normalizeSaltComposition('Amoxicillin 500mg/Clavulanic Acid 125mg'), ['amoxicillin', 'clavulanic acid']);
});

test('normalizeSaltComposition: empty/null input returns empty array', () => {
  assert.deepEqual(normalizeSaltComposition(''), []);
  assert.deepEqual(normalizeSaltComposition(null), []);
  assert.deepEqual(normalizeSaltComposition(undefined), []);
});

test('normalizeSaltComposition: percentage and IU units are also stripped', () => {
  assert.deepEqual(normalizeSaltComposition('Benzoyl Peroxide 2.5%'), ['benzoyl peroxide']);
  assert.deepEqual(normalizeSaltComposition('Vitamin D3 1000IU'), ['vitamin d']);
});

test('compositionsMatch: same single ingredient at different strengths still matches', () => {
  assert.equal(compositionsMatch('Paracetamol 500mg', 'Paracetamol 650mg'), true);
});

test('compositionsMatch: different ingredient counts never match', () => {
  assert.equal(compositionsMatch('Paracetamol 500mg', 'Paracetamol 500mg + Caffeine 30mg'), false);
});

test('compositionsMatch: same combo in a different written order still matches', () => {
  assert.equal(compositionsMatch('Paracetamol 500mg + Caffeine 30mg', 'Caffeine 30mg + Paracetamol 500mg'), true);
});

test('compositionsMatch: genuinely different ingredients never match', () => {
  assert.equal(compositionsMatch('Paracetamol 500mg', 'Ibuprofen 400mg'), false);
});

test('compositionsMatch: blank composition on either side never matches (avoids false-positive substitutes)', () => {
  assert.equal(compositionsMatch('', 'Paracetamol 500mg'), false);
  assert.equal(compositionsMatch('Paracetamol 500mg', ''), false);
  assert.equal(compositionsMatch('', ''), false);
});
