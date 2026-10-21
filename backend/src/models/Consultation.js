const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const consultationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    consultationNumber: { type: String, required: true, trim: true },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    consultationDate: { type: Date, default: Date.now },
    chiefComplaint: { type: String, trim: true, default: '' },
    symptoms: { type: String, trim: true, default: '' },
    // Diagnosis/clinicalNotes/advice are entered only by the doctor, never auto-generated.
    diagnosis: { type: String, trim: true, default: '' },
    clinicalNotes: { type: String, trim: true, default: '' },
    advice: { type: String, trim: true, default: '' },
    followUpDate: { type: Date, default: null },
    status: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], default: 'IN_PROGRESS' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

consultationSchema.index({ organizationId: 1, branchId: 1, consultationNumber: 1 }, { unique: true });
consultationSchema.index({ patient: 1, consultationDate: -1 });

module.exports = mongoose.models.Consultation || mongoose.model('Consultation', consultationSchema);
