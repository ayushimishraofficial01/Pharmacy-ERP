const express = require('express');
const ctrl = require('../controllers/distributorController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);

router.get('/', ctrl.listDistributors);
router.put('/:supplierId/config', authorizeRoles('SUPER_ADMIN', 'ADMIN'), ctrl.configureDistributor);

router.get('/products', ctrl.listProducts);
router.put('/products', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.upsertProduct);

router.get('/orders', ctrl.listOrders);
router.get('/orders/:id', ctrl.getOrder);
router.post('/orders', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.createOrder);
router.post('/orders/:id/send', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.sendOrderHandler);
router.put('/orders/:id/status', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.updateOrderStatus);

module.exports = router;
