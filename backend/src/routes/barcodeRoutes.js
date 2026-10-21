const express = require('express');
const ctrl = require('../controllers/barcodeController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/scan', ctrl.scan);
router.post('/assign', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.assignBarcode);

module.exports = router;
