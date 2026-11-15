'use strict';

/**
 * Small request-parsing helpers shared by controllers. Errors thrown with
 * httpError() are turned into `{ error: CODE, message }` JSON responses by
 * the global error handler in app.js.
 */

function httpError(status, code, message, extra) {
  return Object.assign(new Error(message || code), { status, code, expose: true }, extra ? { extra } : {});
}

function has(body, key) {
  return body != null && Object.prototype.hasOwnProperty.call(body, key);
}

/** '' / null / undefined → null; otherwise a finite number or a 400. */
function numberOrNull(v, field, { min = -Infinity, max = Infinity } = {}) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw httpError(400, 'INVALID_' + toCode(field), `${field} 必須是介於 ${min} ~ ${max} 的數字`);
  }
  return n;
}

function intOrNull(v, field, opts) {
  const n = numberOrNull(v, field, opts);
  return n == null ? null : Math.trunc(n);
}

function toCode(field) {
  return String(field).replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

function trimOrNull(v, max = 255) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/** 'YYYY-MM-DD' or null; anything else is a 400. */
function dateOnlyOrNull(v, field) {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00`).getTime())) {
    throw httpError(400, 'INVALID_' + toCode(field), `${field} 需為 YYYY-MM-DD 格式`);
  }
  return s;
}

/** Parses an ISO-ish date-time; null when empty; 400 when unparsable. */
function dateTimeOrNull(v, field) {
  if (v === '' || v === null || v === undefined) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw httpError(400, 'INVALID_' + toCode(field), `${field} 需為可解析的日期時間（建議 ISO 8601）`);
  }
  return d;
}

/** Only http(s) URLs are stored (blocks javascript: links in the UI). */
function urlOrNull(v, field = 'sourceUrl') {
  const s = trimOrNull(v, 1000);
  if (!s) return null;
  if (!/^https?:\/\/[^\s]+$/i.test(s)) {
    throw httpError(400, 'INVALID_' + toCode(field), `${field} 必須是 http:// 或 https:// 開頭的網址`);
  }
  return s;
}

function parseIdArray(v) {
  if (v === undefined || v === null || v === '') return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return Array.from(new Set(arr.map((x) => parseInt(String(x).trim(), 10)).filter((n) => Number.isFinite(n) && n > 0)));
}

function idParam(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pagination(query, { defaultSize = 20, maxSize = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Wraps an async handler so rejections reach next(err). */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  httpError,
  has,
  numberOrNull,
  intOrNull,
  trimOrNull,
  bool,
  dateOnlyOrNull,
  dateTimeOrNull,
  urlOrNull,
  parseIdArray,
  idParam,
  pagination,
  ah
};
