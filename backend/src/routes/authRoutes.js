const express = require('express');
const rateLimit = require('express-rate-limit');
const { registerOrganization, login, logout, getMe } = require('../controllers/authController');
const authenticateUser = require('../middleware/authenticateUser');

const router = express.Router();

// Brute-force protection on the login endpoint specifically.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.', errors: null },
});

// Separate, tighter limit on org registration — this is the one endpoint
// that creates data with no auth at all, so it needs its own protection
// against being used to spam-create organizations or enumerate whether an
// email is already registered (via the duplicate-key error).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many registration attempts from this network. Please try again later.', errors: null },
});

router.post('/register-organization', registerLimiter, registerOrganization);
router.post('/login', loginLimiter, login);
router.post('/logout', authenticateUser, logout);
router.get('/me', authenticateUser, getMe);

module.exports = router;
