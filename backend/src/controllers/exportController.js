// Phase 10 — export endpoints (requirement 20). RBAC applied per-entity
// (patient/prescription data requires a smaller role set than general
// business data — see exportService.js's allowedRoles) in addition to
// authenticateUser at the route level.
const asyncHandler = require('express-async-handler');
const { getEntity, listEntities } = require('../services/exportService');
const { toCsv, toXlsxBuffer } = require('../services/tabularExportService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const list = asyncHandler(async (req, res) => {
  return sendSuccess(res, { data: listEntities() });
});

// GET /api/export/:entity?format=csv|xlsx
const exportEntity = asyncHandler(async (req, res) => {
  const entity = getEntity(req.params.entity);
  if (!entity) return sendError(res, { statusCode: 404, message: `Unknown export entity "${req.params.entity}". See GET /api/export for the list.` });

  if (!entity.allowedRoles.includes(req.user.role)) {
    return sendError(res, { statusCode: 403, message: `Your role is not authorized to export "${entity.label}"` });
  }

  const rows = await entity.fetch(req);
  const format = (req.query.format || 'csv').toLowerCase();

  await logAction({ req, action: 'DATA_EXPORTED', entityType: entity.label, entityId: null, description: `Exported ${rows.length} row(s) of "${entity.label}" as ${format}` });

  if (format === 'xlsx') {
    try {
      const buffer = toXlsxBuffer(rows, entity.columns, entity.label.slice(0, 31));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}.xlsx"`);
      return res.status(200).send(buffer);
    } catch (err) {
      return sendError(res, { statusCode: err.statusCode || 500, message: err.message });
    }
  }

  const csv = toCsv(rows, entity.columns);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}.csv"`);
  return res.status(200).send(csv);
});

module.exports = { list, exportEntity };
