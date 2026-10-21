const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const expenseCategorySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

expenseCategorySchema.index({ organizationId: 1, name: 1 }, { unique: true });

const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent', 'Electricity', 'Internet', 'Staff Salary', 'Doctor Payment',
  'Transport', 'Delivery', 'Maintenance', 'Software', 'Marketing',
  'Office Supplies', 'Cleaning', 'Telephone', 'Bank Charges', 'Miscellaneous',
];

const ExpenseCategory = mongoose.models.ExpenseCategory || mongoose.model('ExpenseCategory', expenseCategorySchema);
module.exports = ExpenseCategory;
module.exports.DEFAULT_EXPENSE_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES;
