'use strict';

const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { sequelize, Point, PointHistory, PointExpiry } = require('../models');
const logger = require('../config/logger');

function pickColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Recompute every history row's balanceAfter (ordered by occurredAt asc, id asc)
 * for a given point and update Point.currentBalance to the latest value.
 */
async function recalcPoint(pointId, transaction) {
  const histories = await PointHistory.findAll({
    where: { pointId },
    order: [['occurredAt', 'ASC'], ['id', 'ASC']],
    transaction
  });

  let running = 0;
  for (const h of histories) {
    if (h.changeType === 'set') {
      running = toNumber(h.delta) === 0 && toNumber(h.balanceAfter) !== 0
        ? toNumber(h.balanceAfter)
        : running + toNumber(h.delta);
      // For 'set', delta is the diff vs previous running balance; balanceAfter == running
    } else {
      running += toNumber(h.delta);
    }
    h.balanceAfter = running;
    await h.save({ transaction });
  }

  await Point.update(
    { currentBalance: running },
    { where: { id: pointId }, transaction }
  );
  return running;
}

// GET /api/points
exports.list = async (req, res, next) => {
  try {
    const points = await Point.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(points.map((p) => ({
      ...p.toJSON(),
      fallbackColor: p.color || pickColorFromName(p.name || '?'),
      initials: (p.name || '?').trim().slice(0, 2).toUpperCase()
    })));
  } catch (err) { next(err); }
};

// GET /api/points/:id
exports.get = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(point);
  } catch (err) { next(err); }
};

// POST /api/points (multipart or json)
exports.create = async (req, res, next) => {
  try {
    const { name, issuer, note, currentBalance } = req.body;
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });

    const file = req.file;
    const imageUrl = file ? `/uploads/${file.filename}` : null;

    const initialBalance = toNumber(currentBalance, 0);

    const result = await sequelize.transaction(async (t) => {
      const point = await Point.create({
        userId: req.user.id,
        name: String(name).trim(),
        issuer: issuer ? String(issuer).trim() : null,
        imageUrl,
        color: pickColorFromName(String(name)),
        note: note || null,
        currentBalance: initialBalance
      }, { transaction: t });

      if (initialBalance !== 0) {
        await PointHistory.create({
          pointId: point.id,
          changeType: 'set',
          delta: initialBalance,
          balanceAfter: initialBalance,
          occurredAt: new Date(),
          note: '初始建立'
        }, { transaction: t });
      }
      return point;
    });

    res.status(201).json(result);
  } catch (err) { next(err); }
};

// PUT /api/points/:id (metadata only — balance changes go through history)
exports.update = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const { name, issuer, note } = req.body;
    if (name !== undefined) point.name = String(name).trim();
    if (issuer !== undefined) point.issuer = issuer ? String(issuer).trim() : null;
    if (note !== undefined) point.note = note || null;
    if (req.file) {
      // remove old uploaded file (best effort) when replaced
      if (point.imageUrl && point.imageUrl.startsWith('/uploads/')) {
        const old = path.resolve('./public', point.imageUrl.replace(/^\//, ''));
        fs.promises.unlink(old).catch(() => {});
      }
      point.imageUrl = `/uploads/${req.file.filename}`;
    }
    await point.save();
    res.json(point);
  } catch (err) { next(err); }
};

// DELETE /api/points/:id
exports.remove = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    if (point.imageUrl && point.imageUrl.startsWith('/uploads/')) {
      const old = path.resolve('./public', point.imageUrl.replace(/^\//, ''));
      fs.promises.unlink(old).catch(() => {});
    }
    await point.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ---------- Histories ----------

// GET /api/points/:id/histories
exports.listHistories = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const histories = await PointHistory.findAll({
      where: { pointId: point.id },
      order: [['occurredAt', 'DESC'], ['id', 'DESC']]
    });

    // Build per-period analytics: month-bucket spent / earned / netChange
    const buckets = new Map();
    for (const h of histories) {
      const key = (h.occurredAt instanceof Date ? h.occurredAt : new Date(h.occurredAt))
        .toISOString().slice(0, 7); // YYYY-MM
      if (!buckets.has(key)) buckets.set(key, { period: key, earned: 0, spent: 0, net: 0 });
      const bucket = buckets.get(key);
      const delta = Number(h.delta);
      if (h.changeType === 'spend' || delta < 0) bucket.spent += Math.abs(delta);
      else if (h.changeType === 'earn' || delta > 0) bucket.earned += delta;
      else if (h.changeType === 'set') bucket.net += delta;
      bucket.net = bucket.earned - bucket.spent;
    }
    const stats = Array.from(buckets.values()).sort((a, b) => b.period.localeCompare(a.period));

    res.json({ point, histories, stats });
  } catch (err) { next(err); }
};

// POST /api/points/:id/histories
// body: { changeType: 'set'|'earn'|'spend', amount, occurredAt?, note? }
exports.addHistory = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const { changeType, amount, occurredAt, note } = req.body;
    if (!['set', 'earn', 'spend'].includes(changeType)) {
      return res.status(400).json({ error: 'INVALID_CHANGE_TYPE' });
    }
    const amt = toNumber(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT' });
    }

    const occurred = occurredAt ? new Date(occurredAt) : new Date();
    if (Number.isNaN(occurred.getTime())) {
      return res.status(400).json({ error: 'INVALID_DATE' });
    }

    let delta;
    if (changeType === 'earn') delta = amt;
    else if (changeType === 'spend') delta = -amt;
    else {
      // 'set' means user states "current balance is X at this point in time".
      // We still represent it as a relative delta vs the running balance immediately before this
      // entry (recalc will normalise). For now we record amt as the absolute target;
      // recalc will fix delta/balanceAfter properly.
      delta = 0; // placeholder; recalc will rebuild
    }

    await sequelize.transaction(async (t) => {
      // For 'set' we need balanceAfter to anchor the running balance.
      const created = await PointHistory.create({
        pointId: point.id,
        changeType,
        delta,
        balanceAfter: changeType === 'set' ? amt : 0,
        occurredAt: occurred,
        note: note || null
      }, { transaction: t });

      if (changeType === 'set') {
        // Compute the implied delta = amt - prevRunningBalance
        const prevRows = await PointHistory.findAll({
          where: {
            pointId: point.id,
            id: { [Op.ne]: created.id },
            [Op.or]: [
              { occurredAt: { [Op.lt]: occurred } },
              {
                occurredAt: occurred,
                id: { [Op.lt]: created.id }
              }
            ]
          },
          transaction: t
        });
        let prev = 0;
        for (const r of prevRows) {
          if (r.changeType === 'set') prev = Number(r.balanceAfter);
          else prev += Number(r.delta);
        }
        created.delta = amt - prev;
        await created.save({ transaction: t });
      }

      await recalcPoint(point.id, t);
    });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
};

// PUT /api/points/:id/histories/:hid
exports.updateHistory = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const history = await PointHistory.findOne({
      where: { id: req.params.hid, pointId: point.id }
    });
    if (!history) return res.status(404).json({ error: 'HISTORY_NOT_FOUND' });

    const { changeType, amount, occurredAt, note } = req.body;
    if (changeType && !['set', 'earn', 'spend'].includes(changeType)) {
      return res.status(400).json({ error: 'INVALID_CHANGE_TYPE' });
    }
    const amt = amount !== undefined ? toNumber(amount) : null;
    if (amt !== null && (!Number.isFinite(amt) || amt < 0)) {
      return res.status(400).json({ error: 'INVALID_AMOUNT' });
    }

    await sequelize.transaction(async (t) => {
      if (changeType) history.changeType = changeType;
      if (occurredAt) {
        const d = new Date(occurredAt);
        if (Number.isNaN(d.getTime())) throw Object.assign(new Error('INVALID_DATE'), { status: 400 });
        history.occurredAt = d;
      }
      if (note !== undefined) history.note = note || null;

      const finalType = history.changeType;
      if (amt !== null) {
        if (finalType === 'earn') history.delta = amt;
        else if (finalType === 'spend') history.delta = -amt;
        else if (finalType === 'set') {
          history.balanceAfter = amt;
          // delta will be recomputed below
        }
      }
      await history.save({ transaction: t });

      // For 'set', recompute the implied delta vs prior cumulative.
      if (history.changeType === 'set') {
        const prevRows = await PointHistory.findAll({
          where: {
            pointId: point.id,
            id: { [Op.ne]: history.id },
            [Op.or]: [
              { occurredAt: { [Op.lt]: history.occurredAt } },
              {
                occurredAt: history.occurredAt,
                id: { [Op.lt]: history.id }
              }
            ]
          },
          transaction: t
        });
        let prev = 0;
        for (const r of prevRows) {
          if (r.changeType === 'set') prev = Number(r.balanceAfter);
          else prev += Number(r.delta);
        }
        history.delta = Number(history.balanceAfter) - prev;
        await history.save({ transaction: t });
      }

      await recalcPoint(point.id, t);
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
};

// DELETE /api/points/:id/histories/:hid
exports.deleteHistory = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const history = await PointHistory.findOne({
      where: { id: req.params.hid, pointId: point.id }
    });
    if (!history) return res.status(404).json({ error: 'HISTORY_NOT_FOUND' });

    await sequelize.transaction(async (t) => {
      await history.destroy({ transaction: t });
      await recalcPoint(point.id, t);
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error('deleteHistory error', { err: err.message });
    next(err);
  }
};

// ---------- Point Expiries ----------

// GET /api/points/:id/expiries
exports.listExpiries = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const expiries = await PointExpiry.findAll({
      where: { pointId: point.id },
      order: [['expiryDate', 'ASC']]
    });
    res.json(expiries);
  } catch (err) { next(err); }
};

// POST /api/points/:id/expiries
exports.addExpiry = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const { amount, expiryDate, note } = req.body;
    if (!amount || !expiryDate) return res.status(400).json({ error: 'AMOUNT_AND_DATE_REQUIRED' });

    const expiry = await PointExpiry.create({
      pointId: point.id,
      userId: req.user.id,
      amount: Number(amount),
      expiryDate,
      note: note || null
    });
    res.status(201).json(expiry);
  } catch (err) { next(err); }
};

// PUT /api/points/:id/expiries/:eid
exports.updateExpiry = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const expiry = await PointExpiry.findOne({
      where: { id: req.params.eid, pointId: point.id }
    });
    if (!expiry) return res.status(404).json({ error: 'EXPIRY_NOT_FOUND' });

    const { amount, expiryDate, status, note } = req.body;
    if (amount !== undefined) expiry.amount = Number(amount);
    if (expiryDate !== undefined) expiry.expiryDate = expiryDate;
    if (status && ['active', 'dismissed'].includes(status)) expiry.status = status;
    if (note !== undefined) expiry.note = note || null;
    await expiry.save();
    res.json(expiry);
  } catch (err) { next(err); }
};

// DELETE /api/points/:id/expiries/:eid
exports.deleteExpiry = async (req, res, next) => {
  try {
    const point = await Point.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!point) return res.status(404).json({ error: 'NOT_FOUND' });

    const expiry = await PointExpiry.findOne({
      where: { id: req.params.eid, pointId: point.id }
    });
    if (!expiry) return res.status(404).json({ error: 'EXPIRY_NOT_FOUND' });
    await expiry.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// GET /api/expiries/alerts — dashboard: all active expiry alerts for this user
exports.listAlerts = async (req, res, next) => {
  try {
    const alerts = await PointExpiry.findAll({
      where: { userId: req.user.id, status: 'active' },
      include: [{ model: Point, as: 'point', attributes: ['id', 'name', 'issuer', 'imageUrl', 'color'] }],
      order: [['expiryDate', 'ASC']]
    });
    res.json(alerts);
  } catch (err) { next(err); }
};

