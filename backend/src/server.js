require('dotenv').config();
const { assertRequiredEnv } = require('./config/assertEnv');
assertRequiredEnv();

const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('[server] MongoDB connection failed:', err.message);
    console.error('[server] Server not started. Start MongoDB and run the backend again.');
    process.exitCode = 1;
    return;
  }
  app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
}

start();
