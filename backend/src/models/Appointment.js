const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const appointmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    appointmentNumber: { type: String, required: true, trim: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    appointmentDate: { type: Date, required: true }, // date only (midnight UTC)
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },
    appointmentType: { type: String, enum: ['NEW_PATIENT', 'FOLLOW_UP', 'CONSULTATION'], default: 'CONSULTATION' },
    status: {
      type: String,
      enum: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
      default: 'SCHEDULED',
    },
    reason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    checkedInAt: { type: Date, default: null },
    checkedInBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledReason: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

appointmentSchema.index({ organizationId: 1, branchId: 1, appointmentNumber: 1 }, { unique: true });
// Supports the doctor/date overlap check used by double-booking protection.
appointmentSchema.index({ doctor: 1, appointmentDate: 1, startTime: 1 });
appointmentSchema.index({ branchId: 1, appointmentDate: 1 });

module.exports = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
