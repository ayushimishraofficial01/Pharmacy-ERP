const express = require('express');
const ctrl = require('../controllers/prescriptionController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'DOCTOR'), ctrl.create);
router.get('/patient/:patientId', ctrl.listForPatient);
router.get('/:id', ctrl.getOne);
router.patch('/:id/dispense', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'PHARMACIST'), ctrl.dispense);

module.exports = router;
