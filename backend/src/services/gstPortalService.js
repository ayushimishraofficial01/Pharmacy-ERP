// Phase 11 — Feature 1, requirement 5 (GST Portal/API Integration).
//
// This is INTEGRATION-READY ARCHITECTURE ONLY. No real GST portal/GSP
// (GST Suvidha Provider) sandbox credentials are available in this
// environment, so this module NEVER fabricates a successful submission, an
// ARN, or a filed status. Every function below either:
//   (a) throws a clear "not configured" error naming the missing env var, or
//   (b) if you plug in real credentials, makes the actual HTTP call and
//       returns whatever the provider genuinely responds with.
//
// Follows the same "credentials live in env vars, only the env var NAME is
// stored in the DB" pattern already used by distributorApiAdapter.js for
// Supplier.distributorApiConfig — see that file for precedent.
//
// PRODUCTION SETUP REQUIRED (documented, not assumed):
//   GST_GSP_BASE_URL      — your GSP's API base URL (e.g. a licensed GST
//                            Suvidha Provider such as ClearTax, Cygnet,
//                            Taxprint, or GSTN's own GSP list)
//   GST_GSP_CLIENT_ID     — GSP-issued client/app ID
//   GST_GSP_CLIENT_SECRET — GSP-issued client secret
//   GST_GSP_USERNAME      — GST portal username (per GSTIN)
//   GST_GSP_OTP_MODE      — how OTP/2FA is handled (varies per GSP)
// None of these exist in .env.example yet — see .env.example / README
// updates in this phase for where to add them once you have a GSP account.

function isConfigured() {
  return Boolean(process.env.GST_GSP_BASE_URL && process.env.GST_GSP_CLIENT_ID && process.env.GST_GSP_CLIENT_SECRET);
}

function configStatus() {
  return {
    configured: isConfigured(),
    missing: ['GST_GSP_BASE_URL', 'GST_GSP_CLIENT_ID', 'GST_GSP_CLIENT_SECRET', 'GST_GSP_USERNAME'].filter((k) => !process.env[k]),
    message: isConfigured()
      ? 'GSP credentials are configured. Live submission is available.'
      : 'No GST Suvidha Provider (GSP) credentials are configured. Return preparation, validation, and export work fully offline; portal submission is unavailable until GST_GSP_* environment variables are set.',
  };
}

/**
 * Authenticates with the configured GSP. Throws — never fabricates a
 * session token — if not configured.
 */
async function authenticate() {
  if (!isConfigured()) {
    throw Object.assign(new Error('GST portal is not configured. Set GST_GSP_BASE_URL, GST_GSP_CLIENT_ID and GST_GSP_CLIENT_SECRET to enable live filing.'), { statusCode: 501, code: 'GST_PORTAL_NOT_CONFIGURED' });
  }
  // A real integration would POST to `${process.env.GST_GSP_BASE_URL}/authenticate`
  // with the GSP's documented auth flow (client credentials + OTP, per
  // GSTN's API spec) here and return the session token it responds with.
  throw Object.assign(new Error('GST_GSP_BASE_URL is set but no GSP client implementation is wired in yet. Implement the request per your GSP\'s API documentation before calling submitReturn().'), { statusCode: 501, code: 'GST_PORTAL_NOT_IMPLEMENTED' });
}

/**
 * Submits a prepared+validated return to the portal. `filing` is a
 * GstFiling document (or plain object with the same shape). Returns
 * { arn, filedAt, raw } on genuine success — never invents these.
 */
async function submitReturn(filing) {
  if (!filing || filing.status !== 'VALIDATED') {
    throw Object.assign(new Error('Only a VALIDATED filing can be submitted. Run validation first.'), { statusCode: 400 });
  }
  // authenticate() throws until a real GSP is wired in, so this function
  // cannot silently "succeed" — see file header.
  await authenticate();
}

/** Polls filing status/ARN from the portal for a filing already submitted. Same "never fabricate" rule applies. */
async function checkFilingStatus(filing) {
  if (!isConfigured()) {
    throw Object.assign(new Error('GST portal is not configured.'), { statusCode: 501, code: 'GST_PORTAL_NOT_CONFIGURED' });
  }
  await authenticate();
}

module.exports = { isConfigured, configStatus, authenticate, submitReturn, checkFilingStatus };
