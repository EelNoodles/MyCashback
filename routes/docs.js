'use strict';

const express = require('express');
const { buildSpec } = require('../docs/openapi');

// Public: the spec contains no secrets, and external tools (Postman,
// Swagger Editor, code generators) should be able to fetch it directly.
const publicRouter = express.Router();

publicRouter.get('/openapi.json', (req, res) => {
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
  const spec = buildSpec({ baseUrl });
  spec.servers = [{ url: `${req.protocol}://${req.get('host')}${baseUrl}`, description: '目前伺服器' }];
  res.set('Cache-Control', 'no-cache');
  res.json(spec);
});

module.exports = { publicRouter };
