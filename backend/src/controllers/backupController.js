const asyncHandler = require('express-async-handler');
const BackupLog = require('../models/BackupLog');
const BackupSchedule = require('../models/BackupSchedule');
const { runDatabaseBackup, runDatabaseRestore } = require('../services/backupRunnerService');
const { uploadToGoogleDrive, uploadToOneDrive } = require('../services/cloudBackupAdapter');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

// POST /api/backups — recorded by your ops process/script AFTER it actually
// runs a backup (e.g. mongodump). This endpoint does not run the backup
// itself — see BackupLog.js for why.
const record = asyncHandler(async (req, res) => {
  const { status, startedAt, completedAt, sizeBytes, location, checksum, triggeredBy, errorMessage } = req.body;
  if (!status || !startedAt || !completedAt) return sendError(res, { statusCode: 400, message: 'status, startedAt and completedAt are required' });

  const backup = await BackupLog.create({
    organizationId: req.organizationId,
    status,
    startedAt,
    completedAt,
    sizeBytes: sizeBytes || null,
    location: location || '',
    checksum: checksum || '',
    triggeredBy: triggeredBy || 'MANUAL',
    errorMessage: errorMessage || '',
    createdBy: req.user._id,
  });

  await logAction({ req, action: 'BACKUP', entityType: 'BackupLog', entityId: backup._id, description: `Backup recorded: ${status}` });
  return sendSuccess(res, { statusCode: 201, data: backup });
});

const list = asyncHandler(async (req, res) => {
  const backups = await BackupLog.find({ organizationId: req.organizationId }).sort({ createdAt: -1 }).limit(100);
  return sendSuccess(res, { data: backups });
});

// POST /api/backups/:id/authorize-restore — records authorization only.
// Actually performing a restore is an infrastructure operation outside this
// API's scope (there is no live database to restore INTO from within a
// request handler without extreme risk) — this endpoint's job is the
// authorization record Phase 8 asks for, which your ops process then checks
// before running the real restore.
const authorizeRestore = asyncHandler(async (req, res) => {
  const backup = await BackupLog.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.organizationId },
    { restoredAt: new Date(), restoreAuthorizedBy: req.user._id, restoreNotes: req.body.notes || '' },
    { new: true }
  );
  if (!backup) return sendError(res, { statusCode: 404, message: 'Backup record not found' });

  await logAction({ req, action: 'RESTORE', entityType: 'BackupLog', entityId: backup._id, description: `Restore authorized for backup ${backup._id} by ${req.user.email}` });
  return sendSuccess(res, { message: 'Restore authorized and recorded. Your ops process must still perform the actual restore.', data: backup });
});

module.exports = { record, list, authorizeRestore };

// POST /api/backups/run — actually runs mongodump (requirement 11), unlike
// `record` above which only logs a backup an external ops script already
// performed. Requires the `mongodump` binary + MONGODB_URI in this
// environment; fails honestly (FAILED status, real error message) rather
// than fabricating SUCCESS if either is missing.
const run = asyncHandler(async (req, res) => {
  const startedAt = new Date();
  const provider = req.body.provider || 'LOCAL';

  try {
    const { archivePath, sizeBytes } = await runDatabaseBackup({});

    let uploadResult = { uploaded: false };
    if (provider === 'GOOGLE_DRIVE') uploadResult = await uploadToGoogleDrive({ filePath: archivePath, folderId: req.body.folderId });
    else if (provider === 'ONEDRIVE') uploadResult = await uploadToOneDrive({ filePath: archivePath, remoteFolderPath: req.body.remoteFolderPath });

    const backup = await BackupLog.create({
      organizationId: req.organizationId,
      status: 'SUCCESS',
      startedAt,
      completedAt: new Date(),
      sizeBytes,
      location: archivePath,
      filePath: archivePath,
      provider,
      uploadStatus: provider === 'LOCAL' ? 'NOT_ATTEMPTED' : uploadResult.uploaded ? 'UPLOADED' : 'FAILED',
      remoteFileId: uploadResult.remoteFileId || null,
      remoteUrl: uploadResult.remoteUrl || null,
      errorMessage: uploadResult.error || '',
      triggeredBy: 'MANUAL',
      createdBy: req.user._id,
    });

    await logAction({ req, action: 'BACKUP', entityType: 'BackupLog', entityId: backup._id, description: `Backup run: ${backup.status}, upload ${backup.uploadStatus}` });
    return sendSuccess(res, { statusCode: 201, data: backup });
  } catch (err) {
    const backup = await BackupLog.create({
      organizationId: req.organizationId,
      status: 'FAILED',
      startedAt,
      completedAt: new Date(),
      provider,
      errorMessage: err.message,
      triggeredBy: 'MANUAL',
      createdBy: req.user._id,
    });
    await logAction({ req, action: 'BACKUP', entityType: 'BackupLog', entityId: backup._id, description: `Backup run FAILED: ${err.message}` });
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

// POST /api/backups/:id/restore — executes mongorestore. Requires the
// target BackupLog to already have restoreAuthorizedBy set (via
// authorize-restore above) — a two-step confirm-then-execute flow for a
// destructive operation, never a single click.
const restore = asyncHandler(async (req, res) => {
  const backup = await BackupLog.findOne({ _id: req.params.id, organizationId: req.organizationId });
  if (!backup) return sendError(res, { statusCode: 404, message: 'Backup record not found' });
  if (!backup.restoreAuthorizedBy) return sendError(res, { statusCode: 400, message: 'This restore has not been authorized yet — call POST /:id/authorize-restore first' });
  if (!backup.filePath) return sendError(res, { statusCode: 400, message: 'This backup has no local filePath recorded (it may have been logged externally, or already uploaded and removed locally) — restore it manually' });

  try {
    await runDatabaseRestore({ archivePath: backup.filePath });
    await logAction({ req, action: 'RESTORE', entityType: 'BackupLog', entityId: backup._id, description: `Restore executed for backup ${backup._id}` });
    return sendSuccess(res, { message: 'Restore completed', data: backup });
  } catch (err) {
    await logAction({ req, action: 'RESTORE', entityType: 'BackupLog', entityId: backup._id, description: `Restore FAILED: ${err.message}` });
    return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
  }
});

// GET/PUT /api/backups/schedule — Phase 10 (requirement 11): stores desired
// cadence. Does NOT run anything by itself — see BackupSchedule.js for why.
const getSchedule = asyncHandler(async (req, res) => {
  const schedule = await BackupSchedule.findOne({ organizationId: req.organizationId });
  return sendSuccess(res, { data: schedule || null });
});

const updateSchedule = asyncHandler(async (req, res) => {
  const { isActive, cadence, hourOfDay, dayOfWeek, dayOfMonth, provider } = req.body;
  const update = { updatedBy: req.user._id };
  if (isActive !== undefined) update.isActive = isActive;
  if (cadence !== undefined) update.cadence = cadence;
  if (hourOfDay !== undefined) update.hourOfDay = Number(hourOfDay);
  if (dayOfWeek !== undefined) update.dayOfWeek = Number(dayOfWeek);
  if (dayOfMonth !== undefined) update.dayOfMonth = Number(dayOfMonth);
  if (provider !== undefined) update.provider = provider;

  const schedule = await BackupSchedule.findOneAndUpdate({ organizationId: req.organizationId }, update, { new: true, upsert: true, setDefaultsOnInsert: true });
  await logAction({ req, action: 'BACKUP_SCHEDULE_UPDATED', entityType: 'BackupSchedule', entityId: schedule._id, description: `Backup schedule set to ${schedule.cadence}, active=${schedule.isActive}` });
  return sendSuccess(res, { data: schedule, message: 'Schedule saved. An external scheduler (OS cron / cloud scheduler) must call POST /api/backups/run at this cadence — this app has no in-process job runner.' });
});

module.exports = { record, list, authorizeRestore, run, restore, getSchedule, updateSchedule };
