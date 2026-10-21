// Reconciled from Phase 2 (richest: dosage forms, schedule types, rack/shelf,
// text search, barcode), Phase 3 (medicineCode + Counter pattern, "purchases
// must snapshot pricing, never read it back from here" rule kept as a
// comment for whoever builds Purchase in Stage 3), and Phase 6
// (minStockLevel/reorderQty naming + defaultSupplier).
// Org-scoped (not branch-scoped) — a medicine master is shared across an
// org's branches; Batch (branch-scoped) is where actual stock/pricing lives.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;
const { DOSAGE_FORMS, SCHEDULE_TYPES } = require('../constants/medicineSchedules');

const medicineSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    medicineCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: [true, 'Medicine name is required'], trim: true },
    genericName: { type: String, trim: true, default: '' },
    brandName: { type: String, trim: true, default: '' },
    saltComposition: { type: String, trim: true, default: '' },
    // Phase 10 (requirement 2): denormalized, indexed copy of the parsed
    // salt/ingredient set — kept in sync via the pre-save hook below so
    // substitute lookups are a plain indexed query instead of a full
    // collection scan re-parsing saltComposition on every request. Never
    // set this directly; it's derived.
    saltCompositionNormalized: { type: [String], default: [] },

    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    manufacturer: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },
    defaultSupplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },

    dosageForm: { type: String, enum: DOSAGE_FORMS, default: 'Tablet' },
    strength: { type: String, trim: true, default: '' },
    batchNumber: { type: String, trim: true, default: '' },
    packSize: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: 'STRIP' },
    hsnCode: { type: String, trim: true, default: '' },
    gstRate: { type: Number, default: 12, min: 0, max: 100 },
    defaultDiscountType: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT'], default: 'PERCENTAGE' },
    defaultDiscountValue: { type: Number, default: 0, min: 0 },
    defaultRate: { type: Number, default: 0, min: 0 },
    defaultQuantity: { type: Number, default: 0, min: 0 },
    defaultMrp: { type: Number, default: 0, min: 0 },
    defaultExpiryDate: { type: Date, default: null },

    barcode: { type: String, trim: true, default: null },
    rack: { type: String, trim: true, default: '' },
    shelf: { type: String, trim: true, default: '' },

    // Reorder fields kept here from day one (Phase 8's Smart Reorder System
    // needs these, and retrofitting them onto every existing Medicine doc
    // later is exactly the kind of double-work this merge is meant to avoid).
    minimumStockLevel: { type: Number, default: 10, min: 0 },
    maximumStockLevel: { type: Number, default: 0, min: 0 }, // 0 = no cap set
    reorderLevel: { type: Number, default: 15, min: 0 },
    reorderQuantity: { type: Number, default: 20, min: 0 },
    safetyStock: { type: Number, default: 0, min: 0 },
    leadTimeDays: { type: Number, default: 0, min: 0 },

    prescriptionRequired: { type: Boolean, default: false },
    scheduleType: { type: String, enum: SCHEDULE_TYPES, default: 'NONE' },
    description: { type: String, trim: true, default: '' },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// NOTE for Stage 3 (Purchasing): PurchaseItem/Batch must snapshot their own
// rate/GST/etc at time of purchase — never read pricing back from this
// collection after the fact (Phase 3's rule, kept because it's correct).

medicineSchema.index({ organizationId: 1, medicineCode: 1 }, { unique: true });
medicineSchema.index({ organizationId: 1, barcode: 1 }, { unique: true, sparse: true });
medicineSchema.index({ organizationId: 1, category: 1 });
medicineSchema.index({ organizationId: 1, hsnCode: 1 });
medicineSchema.index({ organizationId: 1, saltComposition: 1 });
medicineSchema.index({ organizationId: 1, scheduleType: 1 });
medicineSchema.index({ organizationId: 1, saltCompositionNormalized: 1 });

medicineSchema.pre('save', function computeSaltCompositionNormalized(next) {
  if (this.isModified('saltComposition')) {
    // eslint-disable-next-line global-require
    const { normalizeSaltComposition } = require('../services/saltCompositionService');
    this.saltCompositionNormalized = normalizeSaltComposition(this.saltComposition);
  }
  next();
});

// medicineController.update uses findOneAndUpdate (a query, not a document
// save), so the pre('save') hook above never fires for edits made that way.
// Mirror the same derivation here so saltCompositionNormalized never goes
// stale after an update.
medicineSchema.pre('findOneAndUpdate', function computeSaltCompositionNormalizedOnUpdate(next) {
  const update = this.getUpdate() || {};
  const nextSaltComposition = update.saltComposition !== undefined ? update.saltComposition : update.$set?.saltComposition;
  if (nextSaltComposition !== undefined) {
    // eslint-disable-next-line global-require
    const { normalizeSaltComposition } = require('../services/saltCompositionService');
    const normalized = normalizeSaltComposition(nextSaltComposition);
    if (update.$set) update.$set.saltCompositionNormalized = normalized;
    else update.saltCompositionNormalized = normalized;
  }
  next();
});
medicineSchema.index({ organizationId: 1, manufacturer: 1 });
medicineSchema.index({ organizationId: 1, isActive: 1 });
medicineSchema.index({ name: 'text', genericName: 'text', brandName: 'text', saltComposition: 'text' });

const Medicine = mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);
module.exports = Medicine;
module.exports.DOSAGE_FORMS = DOSAGE_FORMS;
module.exports.SCHEDULE_TYPES = SCHEDULE_TYPES;
