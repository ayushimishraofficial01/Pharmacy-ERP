// Ported from Phase 5. Org-scoped (not branch) — a patient can be seen at
// any of an org's branches. Clinical fields (allergies, chronicConditions,
// notes) are access-controlled at the route layer, not the schema layer —
// see patientRoutes.js.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const patientSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    patientCode: { type: String, required: true, trim: true },
    // A patient does not have to be a paying Customer, and vice versa — set only when linked.
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    mobile: { type: String, required: true, trim: true, index: true },
    dateOfBirth: { type: Date, default: null },
    age: { type: Number, default: null },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'], default: 'UNSPECIFIED' },
    bloodGroup: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    emergencyContactName: { type: String, trim: true, default: '' },
    emergencyContactPhone: { type: String, trim: true, default: '' },
    allergies: [{ type: String, trim: true }],
    chronicConditions: [{ type: String, trim: true }],
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

patientSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});
patientSchema.set('toJSON', { virtuals: true });
patientSchema.set('toObject', { virtuals: true });

patientSchema.index({ organizationId: 1, patientCode: 1 }, { unique: true });
patientSchema.index({ organizationId: 1, mobile: 1 });
patientSchema.index({ firstName: 'text', lastName: 'text' });

module.exports = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
