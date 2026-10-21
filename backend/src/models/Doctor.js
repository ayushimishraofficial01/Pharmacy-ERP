// Ported from Phase 5. Phase 5 had a separate `Clinic` model; the merged app
// uses Branch for that role instead (a branch can operate as a clinic) —
// avoids a redundant "location" concept living in two collections.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const doctorSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    doctorCode: { type: String, required: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // login account, if the doctor logs in
    name: { type: String, required: true, trim: true },
    specialization: { type: String, trim: true, default: '' },
    qualification: { type: String, trim: true, default: '' },
    registrationNumber: { type: String, trim: true, default: '' },
    mobile: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    consultationFee: { type: Number, default: 0 },
    availableDays: [{ type: String, enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] }],
    startTime: { type: String, default: '10:00' },
    endTime: { type: String, default: '13:00' },
    slotDuration: { type: Number, default: 15 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

doctorSchema.index({ organizationId: 1, doctorCode: 1 }, { unique: true });

module.exports = mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema);
