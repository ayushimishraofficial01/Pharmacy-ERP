// Ported from Phase 4 — this is the POS/billing header record.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const paymentEntrySchema = new Schema(
  {
    method: { type: String, enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER'], required: true },
    amount: { type: Number, required: true, min: 0 },
    referenceNumber: { type: String, default: null },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
  },
  { _id: false }
);

const saleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    saleNumber: { type: String, required: true, trim: true },
    invoiceNumber: { type: String, required: true, trim: true },

    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    walkInCustomerName: { type: String, default: null },
    walkInCustomerMobile: { type: String, default: null },

    saleDate: { type: Date, required: true, default: Date.now },

    items: [{ type: Schema.Types.ObjectId, ref: 'SaleItem' }],

    subtotal: { type: Number, required: true, default: 0 },
    itemDiscount: { type: Number, required: true, default: 0 },
    billDiscount: { type: Number, required: true, default: 0 },
    billDiscountType: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT', null], default: null },
    billDiscountValue: { type: Number, default: 0 },
    totalDiscount: { type: Number, required: true, default: 0 },

    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    taxType: { type: String, enum: ['INTRA_STATE', 'INTER_STATE'], default: 'INTRA_STATE' },

    calculatedTotal: { type: Number, required: true, default: 0 },
    roundOff: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },

    payments: [paymentEntrySchema],
    paidAmount: { type: Number, required: true, default: 0 },
    outstandingAmount: { type: Number, required: true, default: 0 },
    paymentStatus: { type: String, enum: ['PAID', 'PARTIAL', 'UNPAID'], required: true, default: 'UNPAID' },

    saleType: { type: String, enum: ['CASH', 'CREDIT', 'MIXED'], required: true, default: 'CASH' },
    status: { type: String, enum: ['COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED'], required: true, default: 'COMPLETED' },

    // Traceability only — does not change how a Sale is processed. Stage 7's
    // WhatsApp order conversion sets these; POS sales leave them at default.
    sourceChannel: { type: String, enum: ['POS', 'WHATSAPP'], default: 'POS' },
    sourceRef: { type: Schema.Types.ObjectId, ref: 'WhatsAppOrder', default: null },

    storeState: { type: String, default: null },
    customerState: { type: String, default: null },

    prescriptionVerified: { type: Boolean, default: false },
    prescriptionVerifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    prescriptionVerifiedAt: { type: Date, default: null },

    // Phase 10 (requirement 3): populated whenever this sale contains a
    // Schedule H/H1/narcotic item. Kept sale-level (not per-line) since one
    // prescription/doctor reference typically covers the whole bill; a
    // per-line schedule snapshot still lives on SaleItem for reporting.
    hasRestrictedItems: { type: Boolean, default: false },
    // Phase 10 (requirement 6): doctor who referred this sale, for
    // commission purposes. Independent of restrictedSaleInfo.doctor below
    // (that one is a compliance/prescription reference for Schedule H/H1/X
    // items specifically) — a non-restricted sale can still carry a
    // referring doctor for commission, and a restricted sale's referring
    // doctor may differ from its prescribing doctor. When only one is
    // supplied, saleController defaults the other to match.
    referringDoctor: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null },
    referringDoctorName: { type: String, trim: true, default: null },
    restrictedSaleInfo: {
      doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null },
      doctorName: { type: String, trim: true, default: null },
      doctorRegistrationNo: { type: String, trim: true, default: null },
      prescription: { type: Schema.Types.ObjectId, ref: 'Prescription', default: null },
      prescriptionReference: { type: String, trim: true, default: null },
      prescriptionDate: { type: Date, default: null },
      patientName: { type: String, trim: true, default: null },
    },

    idempotencyKey: { type: String, default: null },

    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: null },

    notes: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

saleSchema.index({ organizationId: 1, branchId: 1, saleNumber: 1 }, { unique: true });
saleSchema.index({ organizationId: 1, branchId: 1, invoiceNumber: 1 }, { unique: true });
saleSchema.index({ organizationId: 1, branchId: 1, idempotencyKey: 1 }, { sparse: true });
saleSchema.index({ branchId: 1, saleDate: -1 });
saleSchema.index({ branchId: 1, status: 1 });
saleSchema.index({ branchId: 1, paymentStatus: 1 });
saleSchema.index({ customer: 1 });
saleSchema.index({ organizationId: 1, branchId: 1, hasRestrictedItems: 1, saleDate: -1 });
saleSchema.index({ organizationId: 1, referringDoctor: 1, saleDate: -1 });

module.exports = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
