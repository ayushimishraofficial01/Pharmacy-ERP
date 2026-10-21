const express = require('express');
const ctrl = require('../controllers/reportBuilderController');
const authenticateUser = require('../middleware/authenticateUser');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
router.get('/sales', ctrl.salesReport);

module.exports = router;
