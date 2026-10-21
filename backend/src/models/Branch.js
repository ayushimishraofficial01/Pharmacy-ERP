// Ported from Phase 7.
const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const branchSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchCode: { type: String, required: true, trim: true, uppercase: true },
    branchName: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    gstin: { type: String, trim: true, uppercase: true },
    drugLicenseNumber: { type: String, trim: true },
    manager: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  },
  { timestamps: true }
);

// A branch code must be unique within an organization (not globally).
branchSchema.index({ organizationId: 1, branchCode: 1 }, { unique: true });
branchSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.models.Branch || mongoose.model('Branch', branchSchema);
