// Phase 8 section 15: provider-agnostic AI service. Reads AI_ENABLED /
// AI_PROVIDER / AI_API_KEY / AI_MODEL from env. If disabled or misconfigured,
// every caller must degrade gracefully — the ERP core (Stages 1-8) never
// calls this, only aiInsightsController does, and it always returns a clear
// "not configured" response rather than faking a result.
//
// No provider SDK is installed/called here (no network access in this
// sandbox to add one, and doing so silently would violate the "don't fake
// success" principle) — this is the integration point + guardrails,
// documented as a TODO for whichever provider you wire in.
function isEnabled() {
  return String(process.env.AI_ENABLED || '').toLowerCase() === 'true';
}

/**
 * Sends a prompt to the configured provider and returns raw text.
 * >>> INTEGRATION POINT: wire this to your chosen provider's SDK using
 * AI_PROVIDER/AI_API_KEY/AI_MODEL from env. Never send passwords, JWTs,
 * payment credentials, or raw patient data — callers are responsible for
 * passing only aggregated, de-identified figures (see
 * aiInsightsController.js, which only ever sends numeric summaries).
 */
async function complete(prompt) {
  if (!isEnabled()) {
    const err = new Error('AI features are disabled (AI_ENABLED is not "true"). The rest of the ERP works normally without this.');
    err.statusCode = 503;
    throw err;
  }
  if (!process.env.AI_API_KEY || !process.env.AI_PROVIDER) {
    const err = new Error('AI is enabled but AI_PROVIDER/AI_API_KEY are not configured.');
    err.statusCode = 503;
    throw err;
  }
  const err = new Error(`AI provider "${process.env.AI_PROVIDER}" is not wired up yet — implement the call in aiService.js. Not faking a response.`);
  err.statusCode = 501;
  throw err;
}

module.exports = { isEnabled, complete };
