// Phase 10 — which medicines a distributor supplies, and at what price
// (requirement 7). Distinct from Batch/Purchase pricing — this is the
// distributor's CATALOG (what they say they can supply), not stock you
// already own.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const distributorProductSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true }, // must have isDistributor: true
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    distributorProductCode: { type: String, trim: true, default: '' }, // the distributor's own SKU/code for this product
    distributorPrice: { type: Number, required: true, min: 0 },
    minOrderQuantity: { type: Number, default: 1, min: 1 },
    isAvailable: { type: Boolean, default: true },
    lastSyncedAt: { type: Date, default: null }, // set once a real distributor API sync populates this
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

distributorProductSchema.index({ organizationId: 1, supplier: 1, medicine: 1 }, { unique: true });

const DistributorProduct = mongoose.models.DistributorProduct || mongoose.model('DistributorProduct', distributorProductSchema);
module.exports = DistributorProduct;
