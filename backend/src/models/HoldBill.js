// Ported from Phase 4. Holds an in-progress POS cart so the counter can
// serve another customer and resume later. A held bill is NOT a Sale and
// must NEVER touch stock — nothing here calls stockService.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const holdBillItemSchema = new Schema(
  {
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    quantity: { type: Number, required: true, min: 1 },
    discountType: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT', null], default: null },
    discountValue: { type: Number, default: 0 },
  },
  { _id: false }
);

const holdBillSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    holdLabel: { type: String, default: null },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    walkInCustomerName: { type: String, default: null },
    items: [holdBillItemSchema],
    billDiscountType: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT', null], default: null },
    billDiscountValue: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

holdBillSchema.index({ branchId: 1, createdAt: -1 });

module.exports = mongoose.models.HoldBill || mongoose.model('HoldBill', holdBillSchema);
