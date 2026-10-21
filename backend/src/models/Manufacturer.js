// Ported from Phase 3, org-scoped.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const manufacturerSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

manufacturerSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Manufacturer || mongoose.model('Manufacturer', manufacturerSchema);
