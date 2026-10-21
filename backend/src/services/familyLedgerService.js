// Phase 10 — family ledger consolidation (requirement 5).
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const Payment = require('../models/Payment');

/**
 * Build the consolidated ledger for a family: combined outstanding balance,
 * purchase history, and payment history across every member who has a
 * linked Customer record. Members added by name only (no linked Customer)
 * are listed but contribute nothing to the financials — they simply have no
 * billing history yet.
 */
async function getConsolidatedLedger({ organizationId, family }) {
  const customerIds = family.members.map((m) => m.customer).filter(Boolean);

  if (customerIds.length === 0) {
    return { outstandingBalance: 0, memberBalances: [], purchases: [], payments: [] };
  }

  const customers = await Customer.find({ _id: { $in: customerIds }, organizationId });
  const outstandingBalance = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
  const memberBalances = customers.map((c) => ({ customerId: c._id, name: c.name, outstandingBalance: c.outstandingBalance || 0 }));

  const purchases = await Sale.find({ organizationId, customer: { $in: customerIds } })
    .select('saleNumber invoiceNumber saleDate customer grandTotal paymentStatus')
    .populate('customer', 'name')
    .sort({ saleDate: -1 });

  const payments = await Payment.find({ organizationId, customer: { $in: customerIds } })
    .select('paymentNumber direction method amount paymentDate customer')
    .populate('customer', 'name')
    .sort({ paymentDate: -1 });

  return { outstandingBalance, memberBalances, purchases, payments };
}

module.exports = { getConsolidatedLedger };
