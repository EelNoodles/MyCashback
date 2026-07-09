'use strict';

const express = require('express');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const ctrl = require('../controllers/externalController');

// Read-only endpoints for the user's own external tools, authenticated by
// the same self-issued API key as the ingest endpoint (not the Firebase
// session cookie) — mounted in server.js *before* the session authMiddleware
// so it stays reachable without a browser login.
const router = express.Router();

router.get('/cards', apiKeyAuth, ctrl.listCardsSummary);

module.exports = router;
