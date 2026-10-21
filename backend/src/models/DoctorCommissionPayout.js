// Phase 10 — a batch payout of accrued commission to a doctor (requirement 6).
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const doctorCommissionPayoutSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    payoutNumber: { type: String, required: true, trim: true },
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    entryCount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    method: { type: String, enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'], default: 'BANK_TRANSFER' },
    referenceNumber: { type: String, trim: true, default: null },
    paidAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

doctorCommissionPayoutSchema.index({ organizationId: 1, branchId: 1, payoutNumber: 1 }, { unique: true });
doctorCommissionPayoutSchema.index({ organizationId: 1, doctor: 1, paidAt: -1 });

const DoctorCommissionPayout = mongoose.models.DoctorCommissionPayout || mongoose.model('DoctorCommissionPayout', doctorCommissionPayoutSchema);
module.exports = DoctorCommissionPayout;
