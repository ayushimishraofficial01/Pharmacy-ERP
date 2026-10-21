const express = require('express');
const ctrl = require('../controllers/familyController');
const authenticateUser = require('../middleware/authenticateUser');

const router = express.Router();

router.use(authenticateUser);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/ledger', ctrl.ledger);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/members', ctrl.addMember);
router.delete('/:id/members/:memberId', ctrl.removeMember);

module.exports = router;
