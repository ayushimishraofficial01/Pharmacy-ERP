// Phase 10 — distributor API integration architecture (requirement 7).
//
// This is a GENERIC REST adapter shape, not a real integration with any
// named distributor. No specific distributor's actual API contract is
// invented here — the payload/response shape below is a reasonable generic
// convention (POST /orders with a product-code+quantity line list, expecting
// an order id back) that WILL need to be adjusted to match whatever real
// distributor API gets connected. It has not been tested against any live
// endpoint (this sandbox has no network access).
//
// Credentials are never stored in the DB — Supplier.distributorApiConfig
// only stores which environment variable holds the API key
// (`apiKeyEnvVar`), read here at call time via process.env.
//
// If no baseUrl is configured for the supplier, this correctly does nothing
// and reports "manual" mode — sending a distributor order by phone/email/
// portal remains fully supported without ever touching this function.
async function sendOrderToDistributor(supplier, order) {
  const config = supplier.distributorApiConfig || {};

  if (!config.baseUrl) {
    return { sent: false, mode: 'MANUAL', message: 'No distributor API configured for this supplier — record this order as sent manually (phone/email/portal).' };
  }

  const apiKey = config.apiKeyEnvVar ? process.env[config.apiKeyEnvVar] : null;
  if (!apiKey) {
    return { sent: false, mode: 'ERROR', message: `Distributor API is configured (${config.baseUrl}) but environment variable "${config.apiKeyEnvVar}" is not set` };
  }

  if (typeof fetch !== 'function') {
    return { sent: false, mode: 'ERROR', message: 'No fetch implementation available in this Node runtime (requires Node 18+)' };
  }

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        orderNumber: order.orderNumber,
        items: order.items.map((i) => ({ productCode: i.distributorProductCode, quantity: i.requestedQuantity, unitPrice: i.unitPrice })),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { sent: false, mode: 'ERROR', message: `Distributor API responded ${response.status}: ${text}`.slice(0, 500) };
    }

    const data = await response.json().catch(() => ({}));
    return { sent: true, mode: 'API', externalOrderReference: data.orderId || data.reference || data.id || null };
  } catch (err) {
    return { sent: false, mode: 'ERROR', message: `Distributor API request failed: ${err.message}` };
  }
}

module.exports = { sendOrderToDistributor };
