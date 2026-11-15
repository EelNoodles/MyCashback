'use strict';

const { CardTransactionApiKey, User } = require('../models');
const { sha256Hex } = require('../config/crypto');
const logger = require('../config/logger');

/**
 * Auth for machine-to-machine endpoints (/api/ingest/*, /api/external/*):
 * verifies a bearer token issued from the app's「API 金鑰」settings instead
 * of the Firebase session cookie used by browser pages.
 *
 * Accepts `Authorization: Bearer <token>` or `X-API-Key: <token>`.
 * Each key is limited to API_RATE_LIMIT requests per minute (default 300).
 */

const WINDOW_MS = 60 * 1000;
const LIMIT = parseInt(process.env.API_RATE_LIMIT, 10) || 300;
const buckets = new Map(); // keyHash -> { start, count }

function rateLimited(hash, res) {
  const now = Date.now();
  let b = buckets.get(hash);
  if (!b || now - b.start >= WINDOW_MS) {
    b = { start: now, count: 0 };
    buckets.set(hash, b);
    if (buckets.size > 5000) buckets.clear();
  }
  b.count += 1;
  res.set('X-RateLimit-Limit', String(LIMIT));
  res.set('X-RateLimit-Remaining', String(Math.max(0, LIMIT - b.count)));
  if (b.count > LIMIT) {
    res.set('Retry-After', String(Math.ceil((b.start + WINDOW_MS - now) / 1000)));
    return true;
  }
  return false;
}

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
    const hash = sha256Hex(token);
    if (rateLimited(hash, res)) {
      return res.status(429).json({ error: 'RATE_LIMITED', message: `每把金鑰每分鐘最多 ${LIMIT} 次請求，請稍後再試` });
    }
    const row = await CardTransactionApiKey.findOne({ where: { keyHash: hash, isActive: true } });
    if (!row) return res.status(401).json({ error: 'INVALID_API_KEY', message: 'API 金鑰無效或已停用' });

    const user = await User.findByPk(row.userId);
    if (!user) return res.status(401).json({ error: 'INVALID_API_KEY', message: 'API 金鑰無效或已停用' });

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

apiKeyAuth._resetRateLimits = () => buckets.clear();

module.exports = apiKeyAuth;
