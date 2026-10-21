// Shared constants extracted out of models/Medicine.js so pure-logic
// services (scheduleComplianceService, and any future compliance code) can
// depend on them WITHOUT pulling in Mongoose/DB config — keeps those
// services unit-testable with zero DB/network setup, same as
// gstCalculationService/saleCalculationService already are.
const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Powder', 'Surgical', 'Ayurvedic', 'Other'];
const SCHEDULE_TYPES = ['NONE', 'H', 'H1', 'X', 'G', 'OTC'];

module.exports = { DOSAGE_FORMS, SCHEDULE_TYPES };
