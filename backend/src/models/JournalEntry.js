const { mongoose } = require('../config/db');
const { Schema } = mongoose;

const journalLineSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: 'ChartOfAccount', required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const journalEntrySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    date: { type: Date, required: true, default: Date.now },
    reference: { type: String, default: '' },
    narration: { type: String, default: '' },
    lines: {
      type: [journalLineSchema],
      required: true,
      validate: {
        validator: function validateBalanced(lines) {
          const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
          const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
          return Math.abs(totalDebit - totalCredit) < 0.01;
        },
        message: 'Journal entry is not balanced: total debit must equal total credit',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

journalEntrySchema.index({ branchId: 1, date: -1 });

module.exports = mongoose.models.JournalEntry || mongoose.model('JournalEntry', journalEntrySchema);
