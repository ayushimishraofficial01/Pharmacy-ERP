const express = require('express');
const ctrl = require('../controllers/whatsappOrderController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/availability', ctrl.checkAvailability);
router.get('/orders', ctrl.list);
router.get('/orders/:id', ctrl.getOne);
router.post('/orders', ctrl.create);
router.patch('/orders/:id/status', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST', 'RECEPTIONIST'), ctrl.updateStatus);
router.patch('/orders/:id/confirm-item', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.confirmItem);
router.post('/orders/:id/convert', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.convert);

module.exports = router;
