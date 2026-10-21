// PrescriptionItem is embedded (never exists independently of a
// prescription). Snapshots medicineName so historical prescriptions stay
// accurate even if the Medicine master changes later. quantityDispensed is
// updated by the pharmacy-side dispense flow (prescriptionController.dispense).
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const prescriptionItemSchema = new Schema(
  {
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineNameSnapshot: { type: String, required: true },
    dosage: { type: String, trim: true, default: '' },
    frequency: { type: String, trim: true, default: '' },
    duration: { type: String, trim: true, default: '' },
    route: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    instructions: { type: String, trim: true, default: '' },
    beforeAfterFood: { type: String, enum: ['BEFORE_FOOD', 'AFTER_FOOD', 'NA'], default: 'NA' },
    notes: { type: String, trim: true, default: '' },
    quantityDispensed: { type: Number, default: 0 },
  },
  { _id: true }
);

const prescriptionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    prescriptionNumber: { type: String, required: true, trim: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    consultation: { type: Schema.Types.ObjectId, ref: 'Consultation', required: true },
    prescriptionDate: { type: Date, default: Date.now },
    diagnosis: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    followUpDate: { type: Date, default: null },
    items: [prescriptionItemSchema],
    status: { type: String, enum: ['ACTIVE', 'PARTIALLY_DISPENSED', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    sentToPharmacyAt: { type: Date, default: null },
    printedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

prescriptionSchema.index({ organizationId: 1, branchId: 1, prescriptionNumber: 1 }, { unique: true });
prescriptionSchema.index({ patient: 1, prescriptionDate: -1 });

module.exports = mongoose.models.Prescription || mongoose.model('Prescription', prescriptionSchema);
