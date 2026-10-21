const asyncHandler = require('express-async-handler');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { signToken } = require('../utils/token');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAction } = require('../services/auditLogService');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// POST /api/auth/register-organization
// Creates a new Organization + its first Branch + a SUPER_ADMIN user.
// This is the only route that creates a User without an existing
// authenticated SUPER_ADMIN/ADMIN — every other user is created by an
// admin via a (future) user-management route.
const registerOrganization = asyncHandler(async (req, res) => {
  const { organizationName, branchName, adminName, email, password, phone } = req.body;

  if (!organizationName || !branchName || !adminName || !email || !password) {
    return sendError(res, { statusCode: 400, message: 'organizationName, branchName, adminName, email and password are required.' });
  }

  const organization = await Organization.create({ name: organizationName });
  const branch = await Branch.create({
    organizationId: organization._id,
    branchCode: 'MAIN',
    branchName,
  });

  const user = await User.create({
    organizationId: organization._id,
    branchId: branch._id,
    name: adminName,
    email,
    phone,
    password,
    role: 'SUPER_ADMIN',
  });

  const token = signToken({ id: user._id, organizationId: organization._id, role: user.role });

  await logAction({
    req: { organizationId: organization._id, branchId: branch._id, user, ip: req.ip },
    action: 'ORGANIZATION_REGISTERED',
    entityType: 'Organization',
    entityId: organization._id,
    description: `Organization "${organization.name}" registered by ${user.email}`,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Organization registered successfully.',
    data: { token, user, organization, branch },
  });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return sendError(res, { statusCode: 400, message: 'Email and password are required.' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password +failedLoginAttempts +lockedUntil');

  // Generic message on every failure path — never reveal whether the email exists.
  const genericFail = () => sendError(res, { statusCode: 401, message: 'Invalid email or password.' });

  if (!user) return genericFail();

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return sendError(res, { statusCode: 403, message: 'Account temporarily locked due to repeated failed logins. Try again later.' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    }
    await user.save();
    await logAction({
      req: { organizationId: user.organizationId, branchId: user.branchId, user: null, ip: req.ip },
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user._id,
      description: `Failed login attempt for ${user.email}`,
    });
    return genericFail();
  }

  if (!user.isActive) {
    return sendError(res, { statusCode: 403, message: 'Account is deactivated. Contact your administrator.' });
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  const token = signToken({ id: user._id, organizationId: user.organizationId, role: user.role });

  await logAction({
    req: { organizationId: user.organizationId, branchId: user.branchId, user, ip: req.ip },
    action: 'LOGIN',
    entityType: 'User',
    entityId: user._id,
    description: `${user.email} logged in`,
  });

  return sendSuccess(res, { message: 'Logged in successfully.', data: { token, user } });
});

// POST /api/auth/logout — stateless JWT, so this exists mainly to audit-log
// the event; the client discards its token. (Phase 9's Session model can
// replace this with real server-side session revocation once wired in.)
const logout = asyncHandler(async (req, res) => {
  await logAction({ req, action: 'LOGOUT', entityType: 'User', entityId: req.user._id, description: `${req.user.email} logged out` });
  return sendSuccess(res, { message: 'Logged out successfully.' });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, { message: 'OK', data: { user: req.user } });
});

module.exports = { registerOrganization, login, logout, getMe };
