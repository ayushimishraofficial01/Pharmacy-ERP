const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let memoryServer;

async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log('[db] No MONGODB_URI detected; starting in-memory MongoDB for local development.');
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri);
    console.log(`[db] MongoDB connected: ${mongoose.connection.host}`);
    return mongoose.connection;
  } catch (err) {
    if (!process.env.MONGODB_URI && memoryServer) {
      await memoryServer.stop().catch(() => {});
      memoryServer = null;
    }
    throw err;
  }
}

module.exports = { connectDB, mongoose };
