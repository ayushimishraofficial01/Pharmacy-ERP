const express = require('express');
const ctrl = require('../controllers/invoiceController');
const authenticateUser = require('../middleware/authenticateUser');
const requireBranch = require('../middleware/requireBranch');

const router = express.Router();

router.use(authenticateUser, requireBranch);
// GET /api/invoices/:saleId — kept as its own resource (not nested under
// /api/sales) so it can grow independent auth rules later without touching
// saleRoutes.js.
router.get('/:saleId', ctrl.getInvoice);

module.exports = router;
