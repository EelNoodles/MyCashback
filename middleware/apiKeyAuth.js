'use strict';

const { CardTransactionApiKey, User } = require('../models');
const { sha256Hex } = require('../config/crypto');
const logger = require('../config/logger');

/**
 * Auth for machine-to-machine endpoints called by an external bookkeeping
 * system: verifies a bearer token issued via the transactions API-key
 * management endpoints (see transactionController), instead of the
 * Firebase session cookie used by browser pages.
 */
async function apiKeyAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = (m ? m[1] : req.get('x-api-key') || '').trim();

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: '缺少 API 金鑰，請在 Authorization: Bearer <token> 帶入'
    });
  }

  try {
    const row = await CardTransactionApiKey.findOne({
      where: { keyHash: sha256Hex(token), isActive: true }
    });
    if (!row) return res.status(401).json({ error: 'INVALID_API_KEY' });

    const user = await User.findByPk(row.userId);
    if (!user) return res.status(401).json({ error: 'INVALID_API_KEY' });

    req.user = user;
    req.apiKey = row;
    row.update({ lastUsedAt: new Date() }).catch((err) => {
      logger.debug('Failed to bump apiKey.lastUsedAt', { err: err.message });
    });
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = apiKeyAuth;
