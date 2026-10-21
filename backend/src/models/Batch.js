// Reconciled from Phase 3 (richest: purchaseRate/mrp/sellingRate/gstRate
// snapshot, supplier/lastPurchase links, isExpired virtual). Branch-scoped
// (not org-scoped) since physical stock is location-specific — the same
// medicine can have different batches sitting in different branches.
// IMPORTANT: only stockService (Stage 2 below) is allowed to mutate
// `quantity`/`reservedQuantity` directly — every other module goes through
// it so StockTransaction stays the single source of truth for stock history.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const batchSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batchNumber: { type: String, required: true, trim: true },
    manufacturingDate: Date,
    expiryDate: { type: Date, required: true, index: true },

    quantity: { type: Number, required: true, default: 0, min: 0 }, // physical stock in this batch
    reservedQuantity: { type: Number, default: 0, min: 0 }, // held against unconfirmed sales/orders

    // Phase 10 (requirement 8): batch-level barcode, distinct from
    // Medicine.barcode. Optional — many suppliers only barcode the outer
    // medicine pack, not each individual batch. sparse+unique per branch so
    // two different physical batches can never resolve to the same scan.
    barcode: { type: String, trim: true, default: null },

    purchaseRate: { type: Number, required: true },
    mrp: { type: Number, required: true },
    sellingRate: { type: Number, required: true },
    gstRate: { type: Number, required: true, default: 0 },

    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    lastPurchase: { type: Schema.Types.ObjectId, ref: 'Purchase', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

batchSchema.index({ organizationId: 1, branchId: 1, medicine: 1, batchNumber: 1 }, { unique: true });
batchSchema.index({ branchId: 1, expiryDate: 1 });
batchSchema.index({ branchId: 1, medicine: 1 });
batchSchema.index({ branchId: 1, barcode: 1 }, { unique: true, sparse: true });

batchSchema.virtual('isExpired').get(function isExpired() {
  return this.expiryDate < new Date();
});
batchSchema.virtual('availableQuantity').get(function availableQuantity() {
  return Math.max(0, this.quantity - this.reservedQuantity);
});
batchSchema.set('toJSON', { virtuals: true });

const Batch = mongoose.models.Batch || mongoose.model('Batch', batchSchema);
module.exports = Batch;
