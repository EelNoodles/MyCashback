'use strict';

const { getAdmin } = require('../config/firebase');
const { SESSION_COOKIE_NAME } = require('../middleware/authMiddleware');
const logger = require('../config/logger');

const SESSION_MAX_AGE = parseInt(process.env.SESSION_COOKIE_MAX_AGE, 10) || 5 * 24 * 60 * 60 * 1000;

/**
 * POST /auth/sessionLogin
 * Body: { idToken }
 * Verifies the Firebase ID token and exchanges it for a long-lived
 * session cookie that we drop on the user's browser.
 */
exports.sessionLogin = async (req, res) => {
  const idToken = req.body && req.body.idToken;
  if (!idToken) {
    return res.status(400).json({ error: 'MISSING_ID_TOKEN' });
  }

  try {
    const admin = getAdmin();
    if (!admin.apps || admin.apps.length === 0) {
      return res.status(500).json({ error: 'FIREBASE_NOT_CONFIGURED' });
    }
    // Reject tokens older than 5 minutes (Firebase guideline).
    const decoded = await admin.auth().verifyIdToken(idToken, true);
    const ageMs = Date.now() - decoded.auth_time * 1000;
    if (ageMs > 5 * 60 * 1000) {
      return res.status(401).json({ error: 'RECENT_LOGIN_REQUIRED' });
    }

    const cookie = await admin.auth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE
    });
    res.cookie(SESSION_COOKIE_NAME, cookie, {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.warn('sessionLogin failed', { err: err.message });
    return res.status(401).json({ error: 'INVALID_ID_TOKEN' });
  }
};

/**
 * POST /auth/logout
 * Revokes refresh tokens (best-effort) and clears the session cookie.
 */
exports.logout = async (req, res) => {
  const cookie = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  if (cookie) {
    try {
      const admin = getAdmin();
      const decoded = await admin.auth().verifySessionCookie(cookie);
      await admin.auth().revokeRefreshTokens(decoded.sub);
    } catch (_) {
      // ignore
    }
  }
  return res.json({ ok: true });
};

exports.me = (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  return res.json({
    id: req.user.id,
    email: req.user.email,
    displayName: req.user.displayName
  });
};
