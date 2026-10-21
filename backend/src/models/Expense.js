const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    expenseNumber: { type: String, required: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    description: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'], required: true },
    vendor: { type: String, default: '' },
    referenceNumber: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['RECORDED', 'CANCELLED'], default: 'RECORDED' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, required: true },
  },
  { timestamps: true }
);

expenseSchema.index({ organizationId: 1, branchId: 1, expenseNumber: 1 }, { unique: true });
expenseSchema.index({ branchId: 1, date: -1 });
expenseSchema.index({ branchId: 1, category: 1 });
expenseSchema.index({ branchId: 1, status: 1 });

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
