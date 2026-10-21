// Phase 10 — one row per commission earned on a sale line item (requirement 6).
// Kept separate from SaleItem (rather than adding commission fields to it)
// because a sale item can be returned/cancelled after commission already
// accrued — this ledger's `status` tracks that lifecycle independently of
// the sale/sale-item lifecycle.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const doctorCommissionLedgerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },

    sale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    saleItem: { type: Schema.Types.ObjectId, ref: 'SaleItem', required: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    manufacturer: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },

    saleDate: { type: Date, required: true },
    quantity: { type: Number, required: true },
    saleAmount: { type: Number, required: true }, // taxable amount this commission is based on

    commissionRule: { type: Schema.Types.ObjectId, ref: 'DoctorCommissionRule', required: true },
    commissionType: { type: String, required: true },
    commissionValue: { type: Number, required: true }, // rate/amount snapshot at time of accrual
    commissionAmount: { type: Number, required: true },

    status: { type: String, enum: ['ACCRUED', 'PAID', 'CANCELLED'], default: 'ACCRUED' },
    payout: { type: Schema.Types.ObjectId, ref: 'DoctorCommissionPayout', default: null },
    cancelledReason: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

doctorCommissionLedgerSchema.index({ organizationId: 1, doctor: 1, status: 1, saleDate: -1 });
doctorCommissionLedgerSchema.index({ sale: 1 });
doctorCommissionLedgerSchema.index({ saleItem: 1 }, { unique: true }); // one commission entry per sale line, ever

const DoctorCommissionLedger = mongoose.models.DoctorCommissionLedger || mongoose.model('DoctorCommissionLedger', doctorCommissionLedgerSchema);
module.exports = DoctorCommissionLedger;
