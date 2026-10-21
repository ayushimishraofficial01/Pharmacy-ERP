const express = require('express');
const ctrl = require('../controllers/doctorCommissionController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);

router.get('/rules', ctrl.listRules);
router.post('/rules', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.createRule);
router.put('/rules/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.updateRule);
router.delete('/rules/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.deactivateRule);

router.get('/ledger', ctrl.listLedger);
router.get('/summary', ctrl.summary);

router.post('/payouts', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'), ctrl.createPayout);
router.get('/payouts', ctrl.listPayouts);

router.get('/reports/manufacturer-wise', ctrl.manufacturerWiseSales);
router.get('/reports/doctor-wise', ctrl.doctorWiseSales);

module.exports = router;
