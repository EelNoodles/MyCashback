'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Exposes BASE_URL to views and JSON responses so that all generated
 * links / asset references / API URLs honour a sub-path deployment.
 *
 *   res.locals.baseUrl    -> "" (root) or "/myApp"
 *   res.locals.url('/x')  -> "/x" or "/myApp/x"
 *   res.locals.asset('/css/styles.css') -> "<base>/static/css/styles.css?v=..."
 */

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Used when a file cannot be hashed yet (e.g. styles.css not built at boot).
const FALLBACK_VERSION = Date.now().toString(36);

// Cache-busting version per asset, derived from the file's content hash so
// the `?v=` token changes only — and always — when the file actually changes.
const versionCache = new Map();

function assetVersion(relPath) {
  if (versionCache.has(relPath)) return versionCache.get(relPath);
  try {
    const buf = fs.readFileSync(path.join(PUBLIC_DIR, relPath));
    const version = crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
    versionCache.set(relPath, version);
    return version;
  } catch (_) {
    // File missing for now — don't cache, so a later build can be picked up.
    return FALLBACK_VERSION;
  }
}

module.exports = function baseUrlMiddleware(req, res, next) {
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');

  res.locals.baseUrl = baseUrl;

  res.locals.url = (p = '/') => {
    if (!p) p = '/';
    if (!p.startsWith('/')) p = '/' + p;
    return baseUrl + p;
  };

  res.locals.asset = (p = '/') => {
    if (!p) p = '/';
    if (!p.startsWith('/')) p = '/' + p;
    return baseUrl + '/static' + p + '?v=' + assetVersion(p);
  };

  next();
};
