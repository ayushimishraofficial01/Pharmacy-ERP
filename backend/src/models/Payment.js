// Ported from Phase 4. Generic payment record reused across Sale receipts,
// SalesReturn refunds, and (Stage 6+) supplier/expense payments — direction
// (IN/OUT) and referenceType distinguish them. Phase 8's Payment
// Reconciliation reads from this collection.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'CUSTOMER_BALANCE_ADJUSTMENT', 'OTHER'];

const paymentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    paymentNumber: { type: String, required: true, trim: true },
    direction: { type: String, enum: ['IN', 'OUT'], required: true }, // IN = receipt, OUT = refund/payout
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    referenceNumber: { type: String, default: null },
    paymentDate: { type: Date, default: Date.now },

    referenceType: { type: String, required: true }, // 'Sale' | 'SalesReturn' | 'Purchase' | 'PurchaseReturn'
    referenceId: { type: Schema.Types.ObjectId, required: true },

    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

paymentSchema.index({ organizationId: 1, branchId: 1, paymentNumber: 1 }, { unique: true });
paymentSchema.index({ organizationId: 1, referenceType: 1, referenceId: 1 });
paymentSchema.index({ organizationId: 1, method: 1, paymentDate: -1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
module.exports = Payment;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
