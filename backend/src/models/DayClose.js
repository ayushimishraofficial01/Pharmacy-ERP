// Ported from Phase 6, extended with the fields Phase 8 section 6
// ("Advanced Financial Controls") explicitly asks for: cashIn/cashOut and a
// required explanation once variance crosses a threshold.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const dayCloseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    closingDate: { type: Date, required: true },
    openingCash: { type: Number, required: true },
    cashSales: { type: Number, required: true },
    cashPaymentsReceived: { type: Number, required: true },
    cashExpenses: { type: Number, required: true },
    cashPurchases: { type: Number, required: true },
    cashSupplierPayments: { type: Number, required: true },
    cashRefunds: { type: Number, required: true },
    cashIn: { type: Number, default: 0 }, // manual cash-in not otherwise categorized
    cashOut: { type: Number, default: 0 }, // manual cash-out not otherwise categorized
    expectedCash: { type: Number, required: true },
    actualCash: { type: Number, required: true },
    difference: { type: Number, required: true }, // actualCash - expectedCash
    varianceExplanation: { type: String, default: '' },
    notes: { type: String, default: '' },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    closedAt: { type: Date, default: Date.now },
    financialYear: { type: String, required: true },
  },
  { timestamps: true }
);

dayCloseSchema.index({ organizationId: 1, branchId: 1, closingDate: 1 }, { unique: true });

module.exports = mongoose.models.DayClose || mongoose.model('DayClose', dayCloseSchema);
