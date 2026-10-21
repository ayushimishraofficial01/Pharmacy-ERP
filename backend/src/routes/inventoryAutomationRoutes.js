const express = require('express');
const ctrl = require('../controllers/inventoryAutomationController');
const authenticateUser = require('../middleware/authenticateUser');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/status', ctrl.status);
router.get('/smart-reorder', ctrl.smartReorder);

module.exports = router;
