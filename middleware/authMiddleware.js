'use strict';

const { getAdmin } = require('../config/firebase');
const { User } = require('../models');
const logger = require('../config/logger');

const SESSION_COOKIE_NAME = 'session';

async function verifySessionCookie(sessionCookie) {
  if (!sessionCookie) return null;
  try {
    const admin = getAdmin();
    if (!admin.apps || admin.apps.length === 0) return null;
    // checkRevoked = true forces a revocation lookup.
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
    return decoded;
  } catch (err) {
    logger.debug('Session cookie verify failed', { err: err.message });
    return null;
  }
}

/**
 * Strict auth: blocks page or API request if no valid session cookie.
 * - HTML requests      -> redirect to /login
 * - JSON / API requests -> 401
 */
async function authMiddleware(req, res, next) {
  const cookie = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  const decoded = await verifySessionCookie(cookie);

  if (!decoded) {
    if (req.path.startsWith('/api') || req.xhr || req.get('accept')?.includes('application/json')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '請重新登入' });
    }
    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    return res.redirect(baseUrl + '/login');
  }

  // Lazily create local user row keyed by Firebase UID.
  let user;
  try {
    [user] = await User.findOrCreate({
      where: { firebaseUid: decoded.uid },
      defaults: {
        firebaseUid: decoded.uid,
        email: decoded.email || null,
        displayName: decoded.name || decoded.email || decoded.uid
      }
    });
    if (decoded.email && user.email !== decoded.email) {
      user.email = decoded.email;
      await user.save();
    }
  } catch (err) {
    logger.error('Failed to load/create user', { err: err.message });
    return res.status(500).json({ error: 'USER_LOOKUP_FAILED' });
  }

  req.user = user;
  req.firebase = decoded;
  res.locals.currentUser = {
    id: user.id,
    email: user.email,
    displayName: user.displayName
  };
  next();
}

/**
 * Soft auth: populates req.user when present but never blocks the request.
 * Useful for the /login page so we can redirect already-logged-in users away.
 */
async function optionalAuth(req, res, next) {
  const cookie = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  const decoded = await verifySessionCookie(cookie);
  if (decoded) {
    try {
      const [user] = await User.findOrCreate({
        where: { firebaseUid: decoded.uid },
        defaults: {
          firebaseUid: decoded.uid,
          email: decoded.email || null,
          displayName: decoded.name || decoded.email || decoded.uid
        }
      });
      req.user = user;
      req.firebase = decoded;
      res.locals.currentUser = {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      };
    } catch (_) {
      // ignore
    }
  }
  next();
}

module.exports = {
  authMiddleware,
  optionalAuth,
  SESSION_COOKIE_NAME
};
