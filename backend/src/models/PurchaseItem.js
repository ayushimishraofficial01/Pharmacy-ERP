// Snapshots ALL pricing/tax data at time of purchase — never joins back to
// Medicine for historical values (a price change next month must never
// alter last month's recorded purchase cost).
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const purchaseItemSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    purchase: { type: Schema.Types.ObjectId, ref: 'Purchase', required: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true }, // snapshot, survives a later rename
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNumber: { type: String, required: true },
    manufacturingDate: Date,
    expiryDate: { type: Date, required: true },

    quantity: { type: Number, required: true, min: 1 }, // paid-for quantity
    freeQuantity: { type: Number, required: true, default: 0, min: 0 },
    // total stock added = quantity + freeQuantity

    purchaseRate: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    sellingRate: { type: Number, required: true, min: 0 },

    discountType: { type: String, enum: ['PERCENTAGE', 'FLAT'], default: 'PERCENTAGE' },
    discountValue: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, required: true, default: 0 },

    gstRate: { type: Number, required: true, default: 0, min: 0, max: 100 },
    taxableAmount: { type: Number, required: true },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true },

    // How many units of `quantity` have already been returned, to enforce
    // return eligibility without re-scanning all returns each time.
    returnedQuantity: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

purchaseItemSchema.index({ purchase: 1 });
purchaseItemSchema.index({ organizationId: 1, medicine: 1 });
purchaseItemSchema.index({ batch: 1 });

module.exports = mongoose.models.PurchaseItem || mongoose.model('PurchaseItem', purchaseItemSchema);
