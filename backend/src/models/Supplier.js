const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const supplierSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    supplierCode: { type: String, required: true, trim: true },
    supplierName: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true, default: '' },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, trim: true },
    alternatePhone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      validate: { validator: (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/.test(v), message: 'Invalid GSTIN format' },
    },
    pan: {
      type: String,
      trim: true,
      uppercase: true,
      validate: { validator: (v) => !v || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), message: 'Invalid PAN format' },
    },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, required: true, trim: true },
    stateCode: { type: String, required: true, trim: true }, // decides CGST+SGST vs IGST
    pincode: { type: String, trim: true, default: '' },
    paymentTerms: { type: String, default: 'NET_30' },
    creditLimit: { type: Number, default: 0, min: 0 },
    openingBalance: { type: Number, default: 0 },
    // Payable TO the supplier. Positive = we owe them. Negative = credit/advance held.
    currentBalance: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    // Phase 10 (requirement 7): a supplier can additionally act as a
    // distributor a purchase order can be sent to electronically. Reuses
    // Supplier rather than a new model — per the "do not create duplicate
    // Supplier" rule — since a distributor IS a supplier with an ordering
    // channel attached.
    isDistributor: { type: Boolean, default: false },
    distributorApiConfig: {
      // Never store the actual API key here — only which env var holds it,
      // so the integration architecture exists without ever putting real
      // credentials in the database. distributorApiAdapter.js reads
      // process.env[apiKeyEnvVar] at call time.
      baseUrl: { type: String, trim: true, default: null },
      apiKeyEnvVar: { type: String, trim: true, default: null },
      integrationStatus: { type: String, enum: ['NOT_CONFIGURED', 'CONFIGURED', 'ERROR'], default: 'NOT_CONFIGURED' },
      lastError: { type: String, default: null },
      lastSyncedAt: { type: Date, default: null },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

supplierSchema.index({ organizationId: 1, supplierCode: 1 }, { unique: true });
supplierSchema.index({ organizationId: 1, phone: 1 });
supplierSchema.index({ supplierName: 'text', companyName: 'text' });

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
