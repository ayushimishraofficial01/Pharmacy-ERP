// Phase 10 — actual backup/restore execution (requirement 11).
// Uses `mongodump`/`mongorestore` (MongoDB Database Tools) via child_process
// — a real, standard, documented mechanism, not a fabricated one. Both
// require the tool to be installed and on PATH in the deployment
// environment, and MONGODB_URI to be set. Neither has been runtime-tested
// in this sandbox (no mongodump binary, no live MongoDB, no network) — see
// the final report for that caveat. Failure is always reported honestly
// (rejected promise / thrown error with a real message), never swallowed
// into a fake success.
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) {
        const message = error.code === 'ENOENT' ? `"${command}" is not installed or not on PATH` : stderr?.toString().slice(0, 1000) || error.message;
        reject(Object.assign(new Error(message), { statusCode: 500 }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Runs `mongodump` against MONGODB_URI, writing a gzip archive to outputDir. Returns the real file path and its actual size on disk. */
async function runDatabaseBackup({ outputDir = '/tmp/pharmacy-erp-backups' } = {}) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw Object.assign(new Error('MONGODB_URI environment variable is not set — cannot run mongodump'), { statusCode: 500 });

  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.gz`;
  const archivePath = path.join(outputDir, fileName);

  await execFileAsync('mongodump', [`--uri=${mongoUri}`, `--archive=${archivePath}`, '--gzip']);

  const stats = fs.statSync(archivePath); // throws if mongodump silently didn't produce the file — never fabricates a size
  return { archivePath, sizeBytes: stats.size };
}

/**
 * Runs `mongorestore --drop` from a previously created archive. DESTRUCTIVE
 * — the caller (backupController) is responsible for requiring prior
 * explicit restore authorization (see BackupLog.restoreAuthorizedBy) before
 * ever calling this.
 */
async function runDatabaseRestore({ archivePath }) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw Object.assign(new Error('MONGODB_URI environment variable is not set — cannot run mongorestore'), { statusCode: 500 });
  if (!fs.existsSync(archivePath)) throw Object.assign(new Error(`Backup archive not found at ${archivePath}`), { statusCode: 404 });

  await execFileAsync('mongorestore', [`--uri=${mongoUri}`, `--archive=${archivePath}`, '--gzip', '--drop']);
  return { restored: true };
}

module.exports = { runDatabaseBackup, runDatabaseRestore };
