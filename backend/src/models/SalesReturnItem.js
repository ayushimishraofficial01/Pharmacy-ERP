const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const salesReturnItemSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    salesReturn: { type: Schema.Types.ObjectId, ref: 'SalesReturn', required: true, index: true },
    originalSaleItem: { type: Schema.Types.ObjectId, ref: 'SaleItem', required: true },

    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },

    medicineNameSnapshot: { type: String, required: true },
    batchNumberSnapshot: { type: String, required: true },

    quantity: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true, min: 0 },

    gstRate: { type: Number, required: true, default: 0 },
    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },

    // Whether returned stock actually goes back into sellable inventory.
    disposition: { type: String, enum: ['RESTOCK', 'DAMAGED', 'EXPIRED', 'NON_RESTOCKABLE'], required: true, default: 'RESTOCK' },

    stockTransaction: { type: Schema.Types.ObjectId, ref: 'StockTransaction', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.SalesReturnItem || mongoose.model('SalesReturnItem', salesReturnItemSchema);
