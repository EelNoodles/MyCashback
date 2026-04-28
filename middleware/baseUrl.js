'use strict';

/**
 * Exposes BASE_URL to views and JSON responses so that all generated
 * links / asset references / API URLs honour a sub-path deployment.
 *
 *   res.locals.baseUrl    -> "" (root) or "/myApp"
 *   res.locals.url('/x')  -> "/x" or "/myApp/x"
 *   res.locals.asset('/css/styles.css') -> "<base>/static/css/styles.css?v=..."
 */

// Cache-busting: changes on every server restart (i.e. every deploy)
const ASSET_VERSION = Date.now().toString(36);

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
    return baseUrl + '/static' + p + '?v=' + ASSET_VERSION;
  };

  next();
};
