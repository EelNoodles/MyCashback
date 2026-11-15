'use strict';

const express = require('express');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const ctrl = require('../controllers/transactionController');

// Machine-to-machine write endpoints for an external bookkeeping system,
// authenticated by a self-issued API key (not the browser session) —
// mounted in app.js *before* the session authMiddleware.
const router = express.Router();

router.use(apiKeyAuth);
router.post('/card-transactions', ctrl.ingest);
router.post('/card-transactions/batch', ctrl.ingestBatch);
router.get('/card-transactions/:externalRef', ctrl.ingestGet);
router.put('/card-transactions/:externalRef', ctrl.ingestUpdate);
router.delete('/card-transactions/:externalRef', ctrl.ingestDelete);

module.exports = router;
