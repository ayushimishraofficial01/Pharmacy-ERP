// Local development fallback: if no external Mongo URI is configured, the app
// will start an in-memory Mongo instance instead of exiting. This keeps the app
// runnable without Atlas IP whitelisting while still preserving the real check
// for a missing JWT_SECRET in production-like environments.
const REQUIRED = ['JWT_SECRET'];

function assertRequiredEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[startup] Missing required environment variable(s): ${missing.join(', ')}`);
    console.error('[startup] Copy .env.example to .env and fill these in before starting the server.');
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('[startup] WARNING: JWT_SECRET is shorter than 32 characters. Use a long, random value in production.');
  }
}

module.exports = { assertRequiredEnv };
