const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const incomeSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    incomeNumber: { type: String, required: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    source: { type: String, enum: ['PHARMACY_SALE', 'CONSULTATION', 'OTHER_INCOME'], required: true },
    description: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'], required: true },
    reference: { type: String, default: '' },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', default: null },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null },
    status: { type: String, enum: ['RECORDED', 'CANCELLED'], default: 'RECORDED' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, required: true },
  },
  { timestamps: true }
);

incomeSchema.index({ branchId: 1, date: -1 });
incomeSchema.index({ branchId: 1, source: 1 });

module.exports = mongoose.models.Income || mongoose.model('Income', incomeSchema);
