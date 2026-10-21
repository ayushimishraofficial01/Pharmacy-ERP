const express = require('express');
const ctrl = require('../controllers/stockMovementController');
const authenticateUser = require('../middleware/authenticateUser');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/report', ctrl.report);

module.exports = router;
