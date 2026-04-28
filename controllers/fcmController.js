'use strict';

const { FcmToken } = require('../models');

// POST /api/fcm/token — register or refresh FCM token
exports.register = async (req, res, next) => {
  try {
    const { token, deviceInfo } = req.body;
    if (!token) return res.status(400).json({ error: 'TOKEN_REQUIRED' });

    // Upsert: if this token already exists (maybe different user), update it
    const [record, created] = await FcmToken.findOrCreate({
      where: { token },
      defaults: {
        userId: req.user.id,
        token,
        deviceInfo: deviceInfo || null
      }
    });
    if (!created) {
      record.userId = req.user.id;
      record.deviceInfo = deviceInfo || record.deviceInfo;
      await record.save();
    }
    res.json({ ok: true, created });
  } catch (err) { next(err); }
};

// DELETE /api/fcm/token — remove a specific token (e.g. on logout)
exports.remove = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'TOKEN_REQUIRED' });
    await FcmToken.destroy({ where: { token, userId: req.user.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
};
