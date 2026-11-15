'use strict';

const express = require('express');
const ctrl = require('../controllers/transactionController');

const router = express.Router();

// Static paths before "/:id".
router.get('/api-keys', ctrl.listApiKeys);
router.post('/api-keys', ctrl.createApiKey);
router.put('/api-keys/:keyId', ctrl.updateApiKey);
router.delete('/api-keys/:keyId', ctrl.removeApiKey);

router.get('/locations', ctrl.listLocations);
router.get('/stats', ctrl.stats);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.get);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
