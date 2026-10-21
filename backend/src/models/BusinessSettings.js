// Merged from Phase 1's BusinessSettings, rescoped per-branch (falls back to
// org-level defaults when branchId is null) so multi-branch orgs can
// override GST/invoice settings per branch.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const businessSettingsSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    invoicePrefix: { type: String, trim: true, default: 'INV' },
    gstEnabled: { type: Boolean, default: true },
    defaultGstPercent: { type: Number, default: 12 },
    lowStockThreshold: { type: Number, default: 10 },
    currency: { type: String, default: 'INR' },
    // Used by Stage 3/4 GST calculations (interstate CGST+SGST vs IGST split).
    state: { type: String, trim: true, default: '' },
    stateCode: { type: String, trim: true, default: '09' },
    pricesIncludeGST: { type: Boolean, default: false },
    requirePrescriptionVerification: { type: Boolean, default: true },
    maxDiscountPercent: { type: Number, default: 20 },
    // Phase 10 (requirement 14): configurable thresholds for classifying
    // stock movement. Velocities are units/day (30-day trailing average);
    // the day counts are "days since last sale". A medicine that has NEVER
    // sold is treated as dead stock regardless of these thresholds.
    stockMovementThresholds: {
      fastMovingVelocity: { type: Number, default: 1 }, // >= this many units/day sold = fast moving
      slowMovingVelocity: { type: Number, default: 0.2 }, // <= this many units/day (but still selling) = slow moving
      nonMovingDays: { type: Number, default: 60 }, // no sale in this many days (but in stock) = non-moving
      deadStockDays: { type: Number, default: 180 }, // no sale in this many days = dead stock
    },

    // Phase 11 (Feature 3, requirement 11): configurable invoice/bill
    // template. Nothing here hardcodes pharmacy identity — GSTIN/name/
    // address/drug-license still come live from Organization/Branch at
    // print time (invoiceService.js). This block only controls LAYOUT and
    // which optional sections render.
    invoiceTemplate: {
      paperSize: { type: String, enum: ['THERMAL_57MM', 'THERMAL_58MM', 'THERMAL_80MM', 'A6', 'A5', 'A4'], default: 'A4' },
      fontSize: { type: String, enum: ['SMALL', 'MEDIUM', 'LARGE'], default: 'MEDIUM' },
      invoiceTitle: { type: String, trim: true, default: 'GST INVOICE' },
      showLogo: { type: Boolean, default: true },
      logoUrl: { type: String, trim: true, default: null },
      showDrugLicense: { type: Boolean, default: true },
      showPatientSection: { type: Boolean, default: true },
      showDoctorSection: { type: Boolean, default: true },
      showQrCode: { type: Boolean, default: false },
      // 'UPI' -> a UPI payment QR built from upiId below. 'NONE' disables.
      // (GST e-invoice QR requires an actual IRP-signed payload, which needs
      // live GST portal integration — see gstPortalService.js — so it is
      // intentionally not offered here until that's configured.)
      qrType: { type: String, enum: ['NONE', 'UPI'], default: 'NONE' },
      upiId: { type: String, trim: true, default: null },
      upiPayeeName: { type: String, trim: true, default: null },
      termsAndConditions: { type: String, trim: true, default: 'Goods once sold will not be taken back. Medicines cannot be exchanged.' },
      returnPolicy: { type: String, trim: true, default: '' },
      customerCareText: { type: String, trim: true, default: '' },
      footerMessage: { type: String, trim: true, default: 'Thank you for your visit. Get well soon!' },
    },
  },
  { timestamps: true }
);

businessSettingsSchema.index({ organizationId: 1, branchId: 1 }, { unique: true });

const BusinessSettings =
  mongoose.models.BusinessSettings || mongoose.model('BusinessSettings', businessSettingsSchema);
module.exports = BusinessSettings;
