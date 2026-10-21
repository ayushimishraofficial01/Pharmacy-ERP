const asyncHandler = require('express-async-handler');
const aiService = require('../services/aiService');
const { computeKpis } = require('./businessAnalyticsController');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// GET /api/ai-insights?from=&to=
// Phase 8 section 14: AI MUST NOT diagnose patients, prescribe medicines,
// recommend medical treatment, modify prescriptions, or make clinical
// decisions. Enforced structurally here, not just by instruction: this
// controller only ever touches business analytics (Sale/Expense/Batch
// aggregates) — it has no code path to Patient/Prescription/Consultation
// data at all, so there's nothing clinical it could leak or reason about
// even if asked to.
const insights = asyncHandler(async (req, res) => {
  if (!aiService.isEnabled()) {
    return sendSuccess(res, { data: { enabled: false, message: 'AI Business Insights is disabled. Set AI_ENABLED=true and configure AI_PROVIDER/AI_API_KEY to use this feature. The rest of the ERP is unaffected.' } });
  }

  const { from, to } = req.query;
  if (!from || !to) return sendError(res, { statusCode: 400, message: 'from and to query params are required (YYYY-MM-DD)' });

  const kpis = await computeKpis({ organizationId: req.organizationId, branchId: req.branchId, from, to });

  const prompt = [
    'You are a business analyst for a pharmacy. Given only these aggregated figures',
    '(no patient or personal data), write 3-5 short, concrete business observations.',
    'Do not give medical advice, diagnoses, or treatment recommendations of any kind.',
    `Revenue: ${kpis.revenue}, Gross Profit: ${kpis.grossProfit}, Gross Margin: ${kpis.grossMargin}%,`,
    `Net Profit: ${kpis.netProfit}, Bills: ${kpis.numberOfBills}, Avg Bill: ${kpis.averageBillValue},`,
    `Inventory Value: ${kpis.inventoryValue}, Inventory Turnover: ${kpis.inventoryTurnover}, Outstanding: ${kpis.outstanding}.`,
  ].join(' ');

  try {
    const text = await aiService.complete(prompt);
    return sendSuccess(res, { data: { enabled: true, label: 'Business Insight — Not Medical Advice', insight: text, basedOn: kpis } });
  } catch (err) {
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

module.exports = { insights };
