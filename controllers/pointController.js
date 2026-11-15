'use strict';

const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { sequelize, Point, PointHistory, PointExpiry } = require('../models');
const E = require('../services/rewardEngine');
const V = require('../utils/validate');

function pickColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 70%, 55%)`;
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function removeUpload(imageUrl) {
  if (imageUrl && imageUrl.startsWith('/uploads/')) {
    const file = path.resolve('./public', imageUrl.replace(/^\//, ''));
    fs.promises.unlink(file).catch(() => {});
  }
}

/** YYYY-MM in APP_TIMEZONE. */
function monthKey(d) {
  return E.formatDateOnly(d).slice(0, 7);
}

/**
 * Rebuilds every history row's delta / balanceAfter in timeline order
 * (occurredAt asc, id asc) and syncs Point.currentBalance.
 *
 * A 'set' row is an absolute statement ("balance was X at that time"): its
 * targetBalance is the anchor and its delta is derived from whatever came
 * before — so inserting, editing or deleting an earlier row never changes
 * the balance the user stated. (Previously the derived delta was frozen at
 * creation and the stated balance drifted.)
 */
async function recalcPoint(pointId, transaction) {
  const rows = await PointHistory.findAll({
    where: { pointId },
    order: [['occurredAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
  let running = 0;
  for (const h of rows) {
    let delta = Number(h.delta);
    if (h.changeType === 'set') {
      const target = h.targetBalance != null ? Number(h.targetBalance) : Number(h.balanceAfter);
      delta = round2(target - running);
      running = round2(target);
      if (h.targetBalance == null || Number(h.targetBalance) !== running) h.targetBalance = running;
    } else {
      running = round2(running + delta);
    }
    if (Number(h.delta) !== delta) h.delta = delta;
    if (Number(h.balanceAfter) !== running) h.balanceAfter = running;
    if (h.changed()) await h.save({ transaction });
  }
  await Point.update({ currentBalance: running }, { where: { id: pointId }, transaction });
  return running;
}

async function ownedPoint(userId, id) {
  const point = await Point.findOne({ where: { id: V.idParam(id) || 0, userId } });
  if (!point) throw V.httpError(404, 'NOT_FOUND', '找不到此點數');
  return point;
}

function pointToPublic(p, extra = {}) {
  const o = typeof p.toJSON === 'function' ? p.toJSON() : p;
  const vpp = o.valuePerPoint != null ? Number(o.valuePerPoint) : null;
  return {
    ...o,
    currentBalance: Number(o.currentBalance),
    valuePerPoint: vpp,
    value: vpp != null ? round2(Number(o.currentBalance) * vpp) : null,
    fallbackColor: o.color || pickColorFromName(o.name || '?'),
    initials: (o.name || '?').trim().slice(0, 2).toUpperCase(),
    ...extra
  };
}

/** Month earned / spent across all of a user's points (APP_TIMEZONE months). */
async function monthFlows(userId, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const rows = await PointHistory.findAll({
    where: { occurredAt: { [Op.gte]: start, [Op.lt]: end } },
    include: [{ model: Point, as: 'point', attributes: ['id', 'valuePerPoint'], where: { userId } }],
    attributes: ['id', 'pointId', 'changeType', 'delta'],
    raw: true,
    nest: true
  });
  const byPoint = new Map();
  let earned = 0;
  let spent = 0;
  // Only explicit earn / spend count; 'set' rows are balance corrections.
  for (const r of rows) {
    const d = Number(r.delta);
    const b = byPoint.get(r.pointId) || { earned: 0, spent: 0 };
    if (r.changeType === 'earn') { b.earned += d; earned += d; }
    if (r.changeType === 'spend') { b.spent += -d; spent += -d; }
    byPoint.set(r.pointId, b);
  }
  return { earned: round2(earned), spent: round2(spent), byPoint };
}

exports.monthFlows = monthFlows;
exports.pointToPublic = pointToPublic;

// GET /api/points
exports.list = V.ah(async (req, res) => {
  const [points, expiries, flows] = await Promise.all([
    Point.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']] }),
    PointExpiry.findAll({ where: { userId: req.user.id, status: 'active' }, order: [['expiryDate', 'ASC']] }),
    monthFlows(req.user.id)
  ]);
  const today = E.startOfDay(new Date());
  res.json(points.map((p) => {
    const next = expiries.find((x) => x.pointId === p.id);
    const f = flows.byPoint.get(p.id) || { earned: 0, spent: 0 };
    return pointToPublic(p, {
      monthEarned: round2(f.earned),
      monthSpent: round2(f.spent),
      nextExpiry: next ? {
        id: next.id,
        amount: Number(next.amount),
        expiryDate: next.expiryDate,
        daysLeft: E.daysBetween(today, E.parseDateOnly(next.expiryDate))
      } : null
    });
  }));
});

// GET /api/points/:id
exports.get = V.ah(async (req, res) => {
  res.json(pointToPublic(await ownedPoint(req.user.id, req.params.id)));
});

// POST /api/points (multipart or JSON)
exports.create = V.ah(async (req, res) => {
  const b = req.body || {};
  const name = V.trimOrNull(b.name, 120);
  if (!name) throw V.httpError(400, 'NAME_REQUIRED', '請輸入點數名稱');
  const initial = V.numberOrNull(b.currentBalance, 'currentBalance', { min: 0, max: 1e12 }) || 0;
  const valuePerPoint = V.numberOrNull(b.valuePerPoint, 'valuePerPoint', { min: 0, max: 1e6 });
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const point = await sequelize.transaction(async (t) => {
    const p = await Point.create({
      userId: req.user.id,
      name,
      issuer: V.trimOrNull(b.issuer, 120),
      imageUrl,
      color: pickColorFromName(name),
      valuePerPoint,
      note: V.trimOrNull(b.note, 5000),
      currentBalance: initial
    }, { transaction: t });
    if (initial !== 0) {
      await PointHistory.create({
        pointId: p.id,
        changeType: 'set',
        delta: initial,
        targetBalance: initial,
        balanceAfter: initial,
        occurredAt: new Date(),
        note: '初始建立'
      }, { transaction: t });
    }
    return p;
  });
  res.status(201).json(pointToPublic(point));
});

// PUT /api/points/:id  (metadata only — balance changes go through histories)
exports.update = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const b = req.body || {};
  if (V.has(b, 'name')) {
    const name = V.trimOrNull(b.name, 120);
    if (!name) throw V.httpError(400, 'NAME_REQUIRED', '請輸入點數名稱');
    point.name = name;
  }
  if (V.has(b, 'issuer')) point.issuer = V.trimOrNull(b.issuer, 120);
  if (V.has(b, 'note')) point.note = V.trimOrNull(b.note, 5000);
  if (V.has(b, 'valuePerPoint')) point.valuePerPoint = V.numberOrNull(b.valuePerPoint, 'valuePerPoint', { min: 0, max: 1e6 });
  if (req.file) {
    removeUpload(point.imageUrl);
    point.imageUrl = `/uploads/${req.file.filename}`;
  } else if (V.bool(b.removeImage)) {
    removeUpload(point.imageUrl);
    point.imageUrl = null;
  }
  await point.save();
  res.json(pointToPublic(point));
});

// DELETE /api/points/:id
exports.remove = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  removeUpload(point.imageUrl);
  await sequelize.transaction(async (t) => {
    await PointHistory.destroy({ where: { pointId: point.id }, transaction: t });
    await PointExpiry.destroy({ where: { pointId: point.id }, transaction: t });
    await point.destroy({ transaction: t });
  });
  res.json({ ok: true });
});

// ---------- Histories ----------

function historyToPublic(h) {
  const o = typeof h.toJSON === 'function' ? h.toJSON() : h;
  return {
    ...o,
    delta: Number(o.delta),
    balanceAfter: Number(o.balanceAfter),
    targetBalance: o.targetBalance != null ? Number(o.targetBalance) : null
  };
}

// GET /api/points/:id/histories
exports.listHistories = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const histories = await PointHistory.findAll({
    where: { pointId: point.id },
    order: [['occurredAt', 'DESC'], ['id', 'DESC']]
  });
  const buckets = new Map();
  for (const h of histories) {
    const key = monthKey(h.occurredAt);
    if (!buckets.has(key)) buckets.set(key, { period: key, earned: 0, spent: 0, net: 0 });
    const b = buckets.get(key);
    const d = Number(h.delta);
    if (h.changeType === 'earn') b.earned += d;
    else if (h.changeType === 'spend') b.spent += -d;
    b.net = round2(b.net + d); // includes 'set' corrections
    b.earned = round2(b.earned);
    b.spent = round2(b.spent);
  }
  const stats = Array.from(buckets.values()).sort((a, b) => b.period.localeCompare(a.period));
  res.json({ point: pointToPublic(point), histories: histories.map(historyToPublic), stats });
});

function parseChange(body, { partial }) {
  const out = {};
  if (!partial || V.has(body, 'changeType')) {
    if (!['set', 'earn', 'spend'].includes(body.changeType)) {
      throw V.httpError(400, 'INVALID_CHANGE_TYPE', 'changeType 必須是 set / earn / spend');
    }
    out.changeType = body.changeType;
  }
  if (!partial || V.has(body, 'amount')) {
    const amt = V.numberOrNull(body.amount, 'amount', { min: 0, max: 1e12 });
    if (amt == null) throw V.httpError(400, 'INVALID_AMOUNT', '請輸入數量');
    out.amount = amt;
  }
  if (!partial || V.has(body, 'occurredAt')) out.occurredAt = V.dateTimeOrNull(body.occurredAt, 'occurredAt') || new Date();
  if (!partial || V.has(body, 'note')) out.note = V.trimOrNull(body.note, 500);
  return out;
}

function applyAmount(h, type, amount) {
  h.changeType = type;
  if (type === 'set') {
    h.targetBalance = amount;
    h.delta = 0; // derived in recalc
  } else {
    h.targetBalance = null;
    h.delta = type === 'earn' ? amount : -amount;
  }
}

// POST /api/points/:id/histories   body: { changeType, amount, occurredAt?, note? }
exports.addHistory = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const c = parseChange(req.body || {}, { partial: false });
  let created;
  const balance = await sequelize.transaction(async (t) => {
    const h = PointHistory.build({ pointId: point.id, occurredAt: c.occurredAt, note: c.note, balanceAfter: 0 });
    applyAmount(h, c.changeType, c.amount);
    created = await h.save({ transaction: t });
    return recalcPoint(point.id, t);
  });
  const fresh = await PointHistory.findByPk(created.id);
  res.status(201).json({ ok: true, history: historyToPublic(fresh), currentBalance: balance });
});

// PUT /api/points/:id/histories/:hid
exports.updateHistory = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const h = await PointHistory.findOne({ where: { id: V.idParam(req.params.hid) || 0, pointId: point.id } });
  if (!h) throw V.httpError(404, 'HISTORY_NOT_FOUND', '找不到此筆紀錄');
  const c = parseChange(req.body || {}, { partial: true });
  const type = c.changeType || h.changeType;
  let amount = c.amount;
  if (amount == null) {
    amount = h.changeType === 'set'
      ? Number(h.targetBalance != null ? h.targetBalance : h.balanceAfter)
      : Math.abs(Number(h.delta));
  }
  const balance = await sequelize.transaction(async (t) => {
    applyAmount(h, type, amount);
    if (c.occurredAt) h.occurredAt = c.occurredAt;
    if (V.has(c, 'note')) h.note = c.note;
    await h.save({ transaction: t });
    return recalcPoint(point.id, t);
  });
  const fresh = await PointHistory.findByPk(h.id);
  res.json({ ok: true, history: historyToPublic(fresh), currentBalance: balance });
});

// DELETE /api/points/:id/histories/:hid
exports.deleteHistory = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const h = await PointHistory.findOne({ where: { id: V.idParam(req.params.hid) || 0, pointId: point.id } });
  if (!h) throw V.httpError(404, 'HISTORY_NOT_FOUND', '找不到此筆紀錄');
  const balance = await sequelize.transaction(async (t) => {
    await h.destroy({ transaction: t });
    return recalcPoint(point.id, t);
  });
  res.json({ ok: true, currentBalance: balance });
});

// ---------- Expiries ----------

function expiryToPublic(x, today = E.startOfDay(new Date())) {
  const o = typeof x.toJSON === 'function' ? x.toJSON() : x;
  return { ...o, amount: Number(o.amount), daysLeft: E.daysBetween(today, E.parseDateOnly(o.expiryDate)) };
}

exports.listExpiries = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const rows = await PointExpiry.findAll({ where: { pointId: point.id }, order: [['expiryDate', 'ASC']] });
  res.json(rows.map((r) => expiryToPublic(r)));
});

exports.addExpiry = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const b = req.body || {};
  const amount = V.numberOrNull(b.amount, 'amount', { min: 0.01, max: 1e12 });
  const expiryDate = V.dateOnlyOrNull(b.expiryDate, 'expiryDate');
  if (amount == null || !expiryDate) throw V.httpError(400, 'AMOUNT_AND_DATE_REQUIRED', '請輸入到期數量與日期');
  const row = await PointExpiry.create({
    pointId: point.id,
    userId: req.user.id,
    amount,
    expiryDate,
    note: V.trimOrNull(b.note, 500)
  });
  res.status(201).json(expiryToPublic(row));
});

exports.updateExpiry = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const row = await PointExpiry.findOne({ where: { id: V.idParam(req.params.eid) || 0, pointId: point.id } });
  if (!row) throw V.httpError(404, 'EXPIRY_NOT_FOUND', '找不到此到期提醒');
  const b = req.body || {};
  if (V.has(b, 'amount')) {
    const amount = V.numberOrNull(b.amount, 'amount', { min: 0.01, max: 1e12 });
    if (amount == null) throw V.httpError(400, 'INVALID_AMOUNT', '請輸入到期數量');
    row.amount = amount;
  }
  if (V.has(b, 'expiryDate')) {
    const d = V.dateOnlyOrNull(b.expiryDate, 'expiryDate');
    if (!d) throw V.httpError(400, 'INVALID_EXPIRY_DATE', '請輸入到期日期');
    row.expiryDate = d;
  }
  if (V.has(b, 'status')) {
    if (!['active', 'dismissed'].includes(b.status)) throw V.httpError(400, 'INVALID_STATUS', 'status 必須是 active 或 dismissed');
    row.status = b.status;
  }
  if (V.has(b, 'note')) row.note = V.trimOrNull(b.note, 500);
  await row.save();
  res.json(expiryToPublic(row));
});

exports.deleteExpiry = V.ah(async (req, res) => {
  const point = await ownedPoint(req.user.id, req.params.id);
  const row = await PointExpiry.findOne({ where: { id: V.idParam(req.params.eid) || 0, pointId: point.id } });
  if (!row) throw V.httpError(404, 'EXPIRY_NOT_FOUND', '找不到此到期提醒');
  await row.destroy();
  res.json({ ok: true });
});

// GET /api/expiries/alerts — every active expiry reminder across points
exports.listAlerts = V.ah(async (req, res) => {
  const rows = await PointExpiry.findAll({
    where: { userId: req.user.id, status: 'active' },
    include: [{ model: Point, as: 'point', attributes: ['id', 'name', 'issuer', 'imageUrl', 'color', 'currentBalance'] }],
    order: [['expiryDate', 'ASC']]
  });
  const today = E.startOfDay(new Date());
  res.json(rows.map((r) => expiryToPublic(r, today)));
});

exports.recalcPoint = recalcPoint;
