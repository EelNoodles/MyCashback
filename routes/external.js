'use strict';

const express = require('express');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const ctrl = require('../controllers/externalController');

// Read-only endpoints for the user's own external tools, authenticated by
// the same self-issued API key as /api/ingest — mounted in app.js *before*
// the session authMiddleware so no browser login is needed.
const router = express.Router();

router.use(apiKeyAuth);
router.get('/cards', ctrl.listCardsSummary);
router.get('/events', ctrl.listEvents);
router.get('/recommend', ctrl.recommend);
router.get('/summary', ctrl.summary);
router.get('/transactions', ctrl.listTransactions);
router.get('/points', ctrl.listPoints);

module.exports = router;
