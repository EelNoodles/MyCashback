'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');
const { PointExpiry, Point, FcmToken, User } = require('../models');
const { getAdmin } = require('../config/firebase');
const logger = require('../config/logger');

/**
 * Every day at 21:00 Asia/Taipei:
 *   1. Find all active PointExpiry records expiring within 7 days
 *   2. Group by user
 *   3. Send FCM push notification to each user's registered devices
 */
function startExpiryNotificationCron() {
  // '0 21 * * *' = daily at 21:00
  cron.schedule('0 21 * * *', async () => {
    logger.info('[Cron] Running point expiry notification check');
    try {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const in7Days = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

      // Get all active expiries within 7 days
      const expiries = await PointExpiry.findAll({
        where: {
          status: 'active',
          expiryDate: { [Op.between]: [todayStr, in7Days] }
        },
        include: [{ model: Point, as: 'point', attributes: ['id', 'name', 'issuer'] }],
        order: [['expiryDate', 'ASC']]
      });

      if (!expiries.length) {
        logger.info('[Cron] No expiring points found');
        return;
      }

      // Group by userId
      const byUser = new Map();
      for (const exp of expiries) {
        if (!byUser.has(exp.userId)) byUser.set(exp.userId, []);
        byUser.get(exp.userId).push(exp);
      }

      const admin = getAdmin();
      const messaging = admin.messaging();

      for (const [userId, userExpiries] of byUser) {
        // Get FCM tokens for this user
        const tokens = await FcmToken.findAll({ where: { userId } });
        if (!tokens.length) continue;

        // Build notification body
        const lines = userExpiries.map((e) => {
          const pointName = e.point ? e.point.name : '未知點數';
          const daysLeft = Math.ceil((new Date(e.expiryDate) - today) / 86400000);
          const dayStr = daysLeft <= 0 ? '今天到期' : `${daysLeft} 天後到期`;
          return `${pointName} ${Number(e.amount).toLocaleString()} 點 — ${dayStr} (${e.expiryDate})`;
        });

        const title = `⚠️ ${userExpiries.length} 筆點數即將到期`;
        const body = lines.slice(0, 5).join('\n') + (lines.length > 5 ? `\n...還有 ${lines.length - 5} 筆` : '');

        const deviceTokens = tokens.map((t) => t.token);

        try {
          const result = await messaging.sendEachForMulticast({
            tokens: deviceTokens,
            notification: { title, body },
            data: { type: 'point_expiry', count: String(userExpiries.length) },
            webpush: {
              notification: {
                icon: '/static/icons/icon-192.png',
                badge: '/static/icons/icon-192.png',
                vibrate: [200, 100, 200]
              }
            }
          });

          logger.info(`[Cron] Sent to user ${userId}: ${result.successCount} success, ${result.failureCount} fail`);

          // Clean up invalid tokens
          if (result.failureCount > 0) {
            const invalidTokens = [];
            result.responses.forEach((resp, idx) => {
              if (!resp.success && resp.error &&
                  (resp.error.code === 'messaging/invalid-registration-token' ||
                   resp.error.code === 'messaging/registration-token-not-registered')) {
                invalidTokens.push(deviceTokens[idx]);
              }
            });
            if (invalidTokens.length) {
              await FcmToken.destroy({ where: { token: { [Op.in]: invalidTokens } } });
              logger.info(`[Cron] Cleaned up ${invalidTokens.length} invalid tokens`);
            }
          }
        } catch (err) {
          logger.error(`[Cron] Failed to send to user ${userId}`, { err: err.message });
        }
      }
      logger.info('[Cron] Notification cycle complete');
    } catch (err) {
      logger.error('[Cron] Expiry notification error', { err: err.message });
    }
  }, {
    timezone: 'Asia/Taipei'
  });

  logger.info('[Cron] Point expiry notification scheduled at 21:00 Asia/Taipei');
}

module.exports = { startExpiryNotificationCron };
