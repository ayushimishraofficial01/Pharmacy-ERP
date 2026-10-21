const express = require('express');
const ctrl = require('../controllers/purchaseController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.createPurchase);

module.exports = router;
