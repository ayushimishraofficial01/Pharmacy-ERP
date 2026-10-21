const asyncHandler = require('express-async-handler');
const ChartOfAccount = require('../models/ChartOfAccount');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const list = asyncHandler(async (req, res) => {
  const accounts = await ChartOfAccount.find({ organizationId: req.organizationId, isActive: true }).sort({ code: 1 });
  return sendSuccess(res, { data: accounts });
});

const create = asyncHandler(async (req, res) => {
  const account = await ChartOfAccount.create({ ...req.body, organizationId: req.organizationId });
  return sendSuccess(res, { statusCode: 201, data: account });
});

module.exports = { list, create };
