'use strict';

const express = require('express');
const ctrl = require('../controllers/tagController');

const router = express.Router();

router.get('/cards', ctrl.listCards);
router.post('/cards', ctrl.createCard);
router.put('/cards/:id', ctrl.updateCard);
router.delete('/cards/:id', ctrl.deleteCard);

router.get('/payment-methods', ctrl.listPaymentMethods);
router.post('/payment-methods', ctrl.createPaymentMethod);
router.put('/payment-methods/:id', ctrl.updatePaymentMethod);
router.delete('/payment-methods/:id', ctrl.deletePaymentMethod);

module.exports = router;
