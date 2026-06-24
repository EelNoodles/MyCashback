'use strict';

const { sequelize, AiApiKey } = require('../models');
const { encryptSecret, decryptSecret, maskKey } = require('../config/crypto');
const logger = require('../config/logger');

function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    keyMask: row.keyMask,
    isActive: !!row.isActive,
    createdAt: row.createdAt
  };
}

// GET /api/ai/keys
exports.list = async (req, res, next) => {
  try {
    const rows = await AiApiKey.findAll({
      where: { userId: req.user.id },
      order: [['isActive', 'DESC'], ['id', 'ASC']]
    });
    res.json(rows.map(toPublic));
  } catch (err) { next(err); }
};

// POST /api/ai/keys  body: { name, key, makeActive? }
exports.create = async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    const key = String((req.body && req.body.key) || '').trim();
    const makeActive = !!(req.body && req.body.makeActive);
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
    if (!key) return res.status(400).json({ error: 'KEY_REQUIRED' });
    if (name.length > 120) return res.status(400).json({ error: 'NAME_TOO_LONG' });
    if (key.length > 500) return res.status(400).json({ error: 'KEY_TOO_LONG' });

    const created = await sequelize.transaction(async (t) => {
      const existingCount = await AiApiKey.count({ where: { userId: req.user.id }, transaction: t });
      const activate = makeActive || existingCount === 0;
      if (activate) {
        await AiApiKey.update(
          { isActive: false },
          { where: { userId: req.user.id, isActive: true }, transaction: t }
        );
      }
      return AiApiKey.create({
        userId: req.user.id,
        name,
        keyEnc: encryptSecret(key),
        keyMask: maskKey(key),
        isActive: activate
      }, { transaction: t });
    });

    res.status(201).json(toPublic(created));
  } catch (err) { next(err); }
};

// PUT /api/ai/keys/:id  body: { name?, isActive? }
exports.update = async (req, res, next) => {
  try {
    const row = await AiApiKey.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

    const updates = {};
    if (typeof req.body.name === 'string') {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
      if (name.length > 120) return res.status(400).json({ error: 'NAME_TOO_LONG' });
      updates.name = name;
    }

    await sequelize.transaction(async (t) => {
      if (req.body.isActive === true && !row.isActive) {
        await AiApiKey.update(
          { isActive: false },
          { where: { userId: req.user.id, isActive: true }, transaction: t }
        );
        updates.isActive = true;
      }
      Object.assign(row, updates);
      await row.save({ transaction: t });
    });

    res.json(toPublic(row));
  } catch (err) { next(err); }
};

// DELETE /api/ai/keys/:id
exports.remove = async (req, res, next) => {
  try {
    const row = await AiApiKey.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    const wasActive = !!row.isActive;

    await sequelize.transaction(async (t) => {
      await row.destroy({ transaction: t });
      if (wasActive) {
        // Promote the next remaining key so the user still has something configured.
        const fallback = await AiApiKey.findOne({
          where: { userId: req.user.id },
          order: [['id', 'ASC']],
          transaction: t
        });
        if (fallback) {
          fallback.isActive = true;
          await fallback.save({ transaction: t });
        }
      }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
};

/**
 * Used by aiController to resolve the active key for the current user, falling
 * back to the GEMINI_API_KEY env var. Returns the raw API key string or null.
 */
exports.resolveActiveKey = async (userId) => {
  if (userId) {
    try {
      const row = await AiApiKey.findOne({ where: { userId, isActive: true } });
      if (row) return decryptSecret(row.keyEnc);
    } catch (err) {
      logger.warn('Failed to decrypt user AI key, falling back to env', { err: err.message });
    }
  }
  return process.env.GEMINI_API_KEY || null;
};
