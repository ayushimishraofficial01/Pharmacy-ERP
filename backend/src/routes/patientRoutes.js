const express = require('express');
const ctrl = require('../controllers/patientController');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');

const router = express.Router();

router.use(authenticateUser);
// List is available to reception/clinic roles for search/booking purposes,
// but does not include clinical fields (see patientController.list).
router.get('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'DOCTOR', 'RECEPTIONIST'), ctrl.list);
// Full record (incl. clinical fields) restricted further — CRM/pharmacy-only
// roles (PHARMACIST, ACCOUNTANT) never get this, per Phase 8's rule against
// exposing sensitive patient info to unauthorized CRM users.
router.get('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'DOCTOR', 'RECEPTIONIST'), ctrl.getOne);
router.post('/', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'DOCTOR', 'RECEPTIONIST'), ctrl.create);
router.put('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'DOCTOR', 'RECEPTIONIST'), ctrl.update);

module.exports = router;
