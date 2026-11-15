'use strict';

/**
 * Pins the process time zone before anything else touches Date.
 *
 * Every calendar calculation in the app — cashback cycle boundaries
 * ("每月 1 號重置"), "today", month buckets for statistics, the daily push
 * cron — is done with local-time Date methods. On a VPS whose system clock is
 * UTC that silently shifted every boundary by 8 hours for a Taiwan user (a
 * purchase at 01:00 on the 1st landed in the previous month's cycle). Setting
 * TZ here makes "local time" mean the user's time zone everywhere.
 *
 * Override with APP_TIMEZONE (IANA name). Must be required first in server.js.
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Taipei';
process.env.TZ = APP_TIMEZONE;

module.exports = { APP_TIMEZONE };
