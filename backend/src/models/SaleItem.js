// Ported from Phase 4. Each row is ONE (medicine, batch) allocation within a
// sale. A cart line that spans multiple batches (FEFO allocation) produces
// multiple SaleItem docs sharing the same cartLineRef so the frontend can
// still group them visually while stock reversal on return stays exact.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const saleItemSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    cartLineRef: { type: String, required: true },

    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },

    // Historical snapshots — never recalculated from live Medicine/Batch data later.
    medicineNameSnapshot: { type: String, required: true },
    batchNumberSnapshot: { type: String, required: true },
    expiryDateSnapshot: { type: Date, required: true },
    hsnCodeSnapshot: { type: String, default: null },
    // Phase 10 (requirement 3): snapshot, not a live lookup — Medicine's
    // scheduleType can change later, but a compliance report must show what
    // the classification was AT THE TIME OF SALE, matching the snapshot
    // pattern already used for medicineNameSnapshot/hsnCodeSnapshot above.
    scheduleTypeSnapshot: { type: String, default: 'NONE' },
    restrictedSale: { type: Boolean, default: false },

    quantity: { type: Number, required: true, min: 1 },
    freeQuantity: { type: Number, default: 0, min: 0 },

    sellingRate: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },

    discountType: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT', null], default: null },
    discountValue: { type: Number, default: 0 },
    discountAmount: { type: Number, required: true, default: 0 },
    billDiscountAllocated: { type: Number, required: true, default: 0 },

    gstRate: { type: Number, required: true, default: 0 },
    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },

    // COGS foundation for Stage 6 profit analytics.
    purchaseRateSnapshot: { type: Number, default: null },

    returnedQuantity: { type: Number, default: 0, min: 0 },

    priceOverride: {
      applied: { type: Boolean, default: false },
      originalRate: { type: Number, default: null },
      reason: { type: String, default: null },
      approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
  },
  { timestamps: true }
);

saleItemSchema.index({ organizationId: 1, medicine: 1 });
saleItemSchema.index({ batch: 1 });
saleItemSchema.index({ organizationId: 1, restrictedSale: 1, scheduleTypeSnapshot: 1 });

module.exports = mongoose.models.SaleItem || mongoose.model('SaleItem', saleItemSchema);
