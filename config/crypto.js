'use strict';

const crypto = require('crypto');
const logger = require('./logger');

/**
 * Symmetric encryption for secrets stored at rest (Gemini API keys, etc.).
 * Uses AES-256-GCM with a per-secret random IV and the auth tag bundled in.
 *
 * The 32-byte key is derived from AI_KEY_ENC_SECRET if set, otherwise from
 * SESSION_SECRET. If neither is set in production, we log a warning and fall
 * back to a constant — encryption still happens but is not meaningful.
 */

let warnedAboutDefault = false;

function getKey() {
  const secret = process.env.AI_KEY_ENC_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret === 'dev-secret' || secret === 'please-change-me-to-a-long-random-string') {
    if (!warnedAboutDefault && process.env.NODE_ENV === 'production') {
      warnedAboutDefault = true;
      logger.warn('AI_KEY_ENC_SECRET / SESSION_SECRET not set in production — stored API keys are not meaningfully encrypted.');
    }
    return crypto.createHash('sha256').update('mycashback-default-key').digest();
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

exports.encryptSecret = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
};

exports.decryptSecret = (b64) => {
  const buf = Buffer.from(String(b64), 'base64');
  if (buf.length < 28) throw new Error('encrypted payload too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
};

exports.maskKey = (k) => {
  const s = String(k || '');
  if (s.length <= 8) return '••••';
  return s.slice(0, 4) + '…' + s.slice(-4);
};

/**
 * One-way SHA-256 hex digest, used to store lookup-only hashes of
 * self-issued API tokens (the plaintext token is never persisted).
 */
exports.sha256Hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/**
 * Generates a self-issued bearer token: "<prefix>_<43 url-safe base64 chars>".
 */
exports.genToken = (prefix) => `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
