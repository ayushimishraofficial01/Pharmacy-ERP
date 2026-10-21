const express = require('express');
const ctrl = require('../controllers/batchController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/medicine/:medicineId', ctrl.listForMedicine);
router.post('/adjust', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.adjustStock);

module.exports = router;
