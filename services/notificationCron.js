'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');
const { FcmToken } = require('../models');
const { getAdmin } = require('../config/firebase');
const logger = require('../config/logger');

/**
 * Daily reminder push (21:00 in APP_TIMEZONE). For every user with a
 * registered device, builds the same attention list the dashboard shows and
 * sends the actionable items:
 *   - points expiring within 7 days
 *   - campaigns ending within 3 days that still have reward left to earn
 *   - cycles resetting tomorrow with reward left in this cycle
 *   - campaigns that require registration but aren't registered yet
 */

const fmt = (n) => Number(n || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 });

function lineFor(a) {
  switch (a.type) {
    case 'point_expiring':
      return a.daysLeft <= 7 ? `⏰ ${a.title} ${fmt(a.amount)} 點${a.daysLeft <= 0 ? '今天' : ` ${a.daysLeft} 天後`}到期` : null;
    case 'event_ending':
      return a.daysLeft <= 3 ? `🏁 ${a.title} 剩 ${a.daysLeft} 天${a.remainingReward > 0 ? `，還可拿 ${fmt(a.remainingReward)}` : ''}` : null;
    case 'cycle_ending':
      return a.daysLeft <= 1 ? `🔄 ${a.title} 本期今天結束，還可拿 ${fmt(a.remainingReward)}` : null;
    case 'registration_needed':
      return `📝 ${a.title} 需要登錄，還沒登錄`;
    default:
      return null;
  }
}

async function buildMessage(userId) {
  const { buildSummary } = require('../controllers/dashboardController');
  const summary = await buildSummary(userId);
  const lines = summary.attention.map(lineFor).filter(Boolean);
  if (!lines.length) return null;
  return {
    title: `MyCashback：${lines.length} 件事需要注意`,
    body: lines.slice(0, 5).join('\n') + (lines.length > 5 ? `\n…還有 ${lines.length - 5} 項` : ''),
    count: lines.length
  };
}

async function runOnce() {
  const tokens = await FcmToken.findAll();
  if (!tokens.length) return { users: 0, sent: 0 };
  const byUser = new Map();
  for (const t of tokens) {
    if (!byUser.has(t.userId)) byUser.set(t.userId, []);
    byUser.get(t.userId).push(t.token);
  }
  const admin = getAdmin();
  if (!admin.apps || !admin.apps.length) {
    logger.warn('[Cron] Firebase not configured; skipping push');
    return { users: byUser.size, sent: 0 };
  }
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  let sent = 0;
  for (const [userId, deviceTokens] of byUser) {
    try {
      const msg = await buildMessage(userId);
      if (!msg) continue;
      const result = await admin.messaging().sendEachForMulticast({
        tokens: deviceTokens,
        notification: { title: msg.title, body: msg.body },
        data: { type: 'daily_digest', count: String(msg.count), url: `${base}/` },
        webpush: {
          notification: { icon: `${base}/static/icons/icon-192.png`, badge: `${base}/static/icons/icon-192.png` },
          fcmOptions: { link: `${base}/` }
        }
      });
      sent += result.successCount;
      const invalid = [];
      result.responses.forEach((r, i) => {
        const code = r.error && r.error.code;
        if (!r.success && (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered')) {
          invalid.push(deviceTokens[i]);
        }
      });
      if (invalid.length) await FcmToken.destroy({ where: { token: { [Op.in]: invalid } } });
    } catch (err) {
      logger.error(`[Cron] push failed for user ${userId}`, { err: err.message });
    }
  }
  logger.info(`[Cron] daily digest: ${sent} notifications sent to ${byUser.size} user(s)`);
  return { users: byUser.size, sent };
}

function startNotificationCron() {
  cron.schedule('0 21 * * *', () => {
    runOnce().catch((err) => logger.error('[Cron] digest error', { err: err.message }));
  }, { timezone: process.env.TZ || 'Asia/Taipei' });
  logger.info(`[Cron] daily digest scheduled at 21:00 ${process.env.TZ || 'Asia/Taipei'}`);
}

module.exports = { startNotificationCron, startExpiryNotificationCron: startNotificationCron, buildMessage, runOnce };
