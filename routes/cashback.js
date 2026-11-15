'use strict';

const express = require('express');
const ctrl = require('../controllers/cashbackController');

const router = express.Router();

// Static paths first so they are never captured by "/:id".
router.get('/rewards-audit', ctrl.rewardsAudit);
router.get('/recommend', ctrl.recommend);
router.get('/receipts', ctrl.listReceipts);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/duplicate', ctrl.duplicate);
router.put('/:id/registration', ctrl.setRegistration);
router.post('/:id/receipts', ctrl.createReceipt);
router.put('/:id/receipts/:rid', ctrl.updateReceipt);
router.delete('/:id/receipts/:rid', ctrl.removeReceipt);

module.exports = router;
