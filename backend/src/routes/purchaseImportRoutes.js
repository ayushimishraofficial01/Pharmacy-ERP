const express = require('express');
const ctrl = require('../controllers/purchaseImportController');
const upload = require('../middleware/uploadTabularFile');
const authenticateUser = require('../middleware/authenticateUser');
const authorizeRoles = require('../middleware/authorizeRoles');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch, authorizeRoles('SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'));
router.post('/headers', upload.single('file'), ctrl.headers);
router.post('/preview', upload.single('file'), ctrl.preview);
router.post('/confirm', upload.single('file'), ctrl.confirm);

module.exports = router;
