const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const { sendSuccess } = require('../utils/apiResponse');

// GET /api/crm-analytics/segments
// Phase 8 section 9: New/Regular/High Value/Inactive/Credit Customer
// segments, with total spend, purchase frequency, last purchase, outstanding,
// average bill value. Deliberately returns ONLY these aggregate fields —
// never patient/clinical data (Phase 8's explicit rule against exposing
// sensitive patient info to unauthorized CRM users; this endpoint has no
// route into Patient at all, so there's nothing to leak).
const segments = asyncHandler(async (req, res) => {
  const customers = await Customer.find({ organizationId: req.organizationId, isActive: true });
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const results = [];
  for (const customer of customers) {
    const sales = await Sale.find({ organizationId: req.organizationId, customer: customer._id, status: { $ne: 'CANCELLED' } }).sort({ saleDate: -1 });
    const totalSpend = sales.reduce((s, sale) => s + sale.grandTotal, 0);
    const purchaseFrequency = sales.length;
    const lastPurchase = sales[0]?.saleDate || null;
    const averageBillValue = purchaseFrequency > 0 ? totalSpend / purchaseFrequency : 0;

    let segment;
    if (customer.outstandingBalance > 0) segment = 'CREDIT_CUSTOMER';
    else if (!lastPurchase) segment = 'NEW';
    else if (lastPurchase < ninetyDaysAgo) segment = 'INACTIVE';
    else if (totalSpend >= 20000) segment = 'HIGH_VALUE'; // fixed default threshold — Stage 9+ could make this configurable per org
    else segment = 'REGULAR';

    results.push({
      customer: { _id: customer._id, name: customer.name, mobile: customer.mobile },
      segment,
      totalSpend: Number(totalSpend.toFixed(2)),
      purchaseFrequency,
      lastPurchase,
      outstanding: customer.outstandingBalance,
      averageBillValue: Number(averageBillValue.toFixed(2)),
    });
  }

  const bySegment = results.reduce((acc, r) => {
    acc[r.segment] = (acc[r.segment] || 0) + 1;
    return acc;
  }, {});

  return sendSuccess(res, { data: { customers: results, segmentCounts: bySegment } });
});

module.exports = { segments };
