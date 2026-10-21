const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyMedicine, validateRestrictedSaleInfo, isRestrictedSchedule, requiresControlledRegister } = require('../services/scheduleComplianceService');

test('classifyMedicine: OTC medicine is not restricted and carries no warning', () => {
  const result = classifyMedicine({ name: 'Vitamin C', scheduleType: 'OTC', prescriptionRequired: false });
  assert.equal(result.restricted, false);
  assert.equal(result.requiresPrescription, false);
  assert.equal(result.message, null);
});

test('classifyMedicine: Schedule H requires prescription and is restricted', () => {
  const result = classifyMedicine({ name: 'Amoxicillin', scheduleType: 'H', prescriptionRequired: true });
  assert.equal(result.restricted, true);
  assert.equal(result.requiresPrescription, true);
  assert.match(result.message, /Schedule H/);
});

test('classifyMedicine: Schedule H1 message calls out the compliance register', () => {
  const result = classifyMedicine({ name: 'Tramadol', scheduleType: 'H1' });
  assert.equal(result.restricted, true);
  assert.match(result.message, /H1/);
  assert.match(result.message, /compliance register/);
});

test('classifyMedicine: narcotic (X) message calls out the controlled-drug register', () => {
  const result = classifyMedicine({ name: 'Morphine', scheduleType: 'X' });
  assert.equal(result.restricted, true);
  assert.match(result.message, /controlled-drug register/);
});

test('classifyMedicine: unknown/garbage scheduleType defaults safely to NONE', () => {
  const result = classifyMedicine({ name: 'Mystery', scheduleType: 'NOT_REAL' });
  assert.equal(result.scheduleType, 'NONE');
  assert.equal(result.restricted, false);
});

test('classifyMedicine: non-restricted but prescriptionRequired medicine still asks for verification', () => {
  const result = classifyMedicine({ name: 'Custom Item', scheduleType: 'NONE', prescriptionRequired: true });
  assert.equal(result.restricted, false);
  assert.equal(result.requiresPrescription, true);
  assert.match(result.message, /prescription verification/);
});

test('isRestrictedSchedule: only H/H1/X are restricted', () => {
  assert.equal(isRestrictedSchedule('H'), true);
  assert.equal(isRestrictedSchedule('H1'), true);
  assert.equal(isRestrictedSchedule('X'), true);
  assert.equal(isRestrictedSchedule('OTC'), false);
  assert.equal(isRestrictedSchedule('NONE'), false);
  assert.equal(isRestrictedSchedule('G'), false);
});

test('requiresControlledRegister: only X (narcotic) feeds the controlled-drug register, not H/H1', () => {
  assert.equal(requiresControlledRegister('X'), true);
  assert.equal(requiresControlledRegister('H'), false);
  assert.equal(requiresControlledRegister('H1'), false);
  assert.equal(requiresControlledRegister('OTC'), false);
  assert.equal(requiresControlledRegister('NONE'), false);
});

test('validateRestrictedSaleInfo: rejects missing info entirely', () => {
  const result = validateRestrictedSaleInfo(null);
  assert.equal(result.valid, false);
});

test('validateRestrictedSaleInfo: rejects when doctor reference is missing', () => {
  const result = validateRestrictedSaleInfo({ prescriptionReference: 'RX-123' });
  assert.equal(result.valid, false);
  assert.match(result.reason, /Doctor/);
});

test('validateRestrictedSaleInfo: rejects when prescription reference is missing', () => {
  const result = validateRestrictedSaleInfo({ doctorName: 'Dr. Rao' });
  assert.equal(result.valid, false);
  assert.match(result.reason, /prescription reference/);
});

test('validateRestrictedSaleInfo: accepts a doctor id + linked prescription with no free-text fields', () => {
  const result = validateRestrictedSaleInfo({ doctor: '507f1f77bcf86cd799439011', prescription: '507f1f77bcf86cd799439012' });
  assert.equal(result.valid, true);
});

test('validateRestrictedSaleInfo: accepts free-text doctor name + prescription reference', () => {
  const result = validateRestrictedSaleInfo({ doctorName: 'Dr. Rao', prescriptionReference: 'RX-2026-0042' });
  assert.equal(result.valid, true);
});
