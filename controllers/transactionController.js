'use strict';

const { Op, fn, col } = require('sequelize');
const {
  CardTransaction,
  CardTransactionApiKey,
  Card,
  PaymentMethod,
  CashbackEvent
} = require('../models');
const { genToken, sha256Hex, maskKey } = require('../config/crypto');
const E = require('../services/rewardEngine');
const V = require('../utils/validate');

const CARD_ATTRS = ['id', 'name', 'imageUrl', 'network', 'color', 'lastFour'];
const PM_ATTRS = ['id', 'name', 'imageUrl', 'color'];
const MAX_BATCH = 200;

function txnInclude() {
  return [
    { model: Card, as: 'card', attributes: CARD_ATTRS },
    { model: PaymentMethod, as: 'paymentMethod', attributes: PM_ATTRS }
  ];
}

function toPublicTxn(row) {
  const o = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: o.id,
    cardId: o.cardId,
    card: o.card ? { id: o.card.id, name: o.card.name, imageUrl: o.card.imageUrl, network: o.card.network, color: o.card.color, lastFour: o.card.lastFour || null } : null,
    paymentMethodId: o.paymentMethodId,
    paymentMethod: o.paymentMethod ? { id: o.paymentMethod.id, name: o.paymentMethod.name, imageUrl: o.paymentMethod.imageUrl } : null,
    amount: o.amount,
    transactionAt: o.transactionAt,
    note: o.note,
    latitude: o.latitude != null ? Number(o.latitude) : null,
    longitude: o.longitude != null ? Number(o.longitude) : null,
    externalRef: o.externalRef,
    source: o.source,
    rawCardName: o.rawCardName || null,
    rawPaymentMethodName: o.rawPaymentMethodName || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
}

/** Optional { latitude, longitude } pair — both or neither, within range. */
function parseLatLng(body) {
  const hasLat = body.latitude !== undefined && body.latitude !== null && body.latitude !== '';
  const hasLng = body.longitude !== undefined && body.longitude !== null && body.longitude !== '';
  if (!hasLat && !hasLng) return { latitude: null, longitude: null };
  if (hasLat !== hasLng) throw V.httpError(400, 'LOCATION_INCOMPLETE', 'latitude 與 longitude 需一起提供');
  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw V.httpError(400, 'LOCATION_INVALID', 'latitude 需介於 -90~90、longitude 需介於 -180~180');
  }
  return { latitude: lat, longitude: lng };
}

function parseAmount(v) {
  const amt = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(amt) || amt <= 0 || amt > 1e10) {
    throw V.httpError(400, 'AMOUNT_INVALID', 'amount 必須是大於 0 的數字');
  }
  return Math.round(amt * 100) / 100;
}

function parseTxnAt(v, required) {
  if (v === undefined || v === null || v === '') {
    if (required) throw V.httpError(400, 'TRANSACTION_AT_INVALID', 'transactionAt 為必填');
    return new Date();
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw V.httpError(400, 'TRANSACTION_AT_INVALID', 'transactionAt 需為可解析的日期時間字串（建議 ISO 8601，例如 2026-07-04T13:05:00+08:00）');
  }
  return d;
}

// ─────────────────────────────────────────────────────────────
// Name resolution for external callers
// ─────────────────────────────────────────────────────────────

function nameKeys(row) {
  return [row.name, ...E.parseMerchantKeywords(row.aliases)].map(E.normalizeForMatch).filter(Boolean);
}

/**
 * Card lookup order: exact name → case/whitespace-insensitive name or alias
 * → card last four digits. Ambiguous last-four matches are rejected.
 */
async function resolveCard(userId, { cardName, cardLastFour }) {
  const name = String(cardName || '').trim();
  const last4 = String(cardLastFour || '').replace(/\D/g, '');
  if (!name && !last4) throw V.httpError(400, 'CARD_NAME_REQUIRED', '需提供 cardName（或 cardLastFour）');
  const cards = await Card.findAll({ where: { userId }, attributes: ['id', 'name', 'aliases', 'lastFour'] });
  if (name) {
    const exact = cards.find((c) => c.name === name);
    if (exact) return exact;
    const norm = E.normalizeForMatch(name);
    const fuzzy = cards.filter((c) => nameKeys(c).includes(norm));
    if (fuzzy.length === 1) return fuzzy[0];
  }
  if (last4.length === 4) {
    const byLast4 = cards.filter((c) => c.lastFour === last4);
    if (byLast4.length === 1) return byLast4[0];
  }
  throw V.httpError(422, 'CARD_NOT_FOUND',
    `找不到${name ? `名稱為「${name}」` : ''}${name && last4 ? '或' : ''}${last4 ? `末四碼 ${last4} ` : ''}的卡片，請先在「卡片與支付方式」建立，或把這個名稱加入卡片別名`,
    { knownCards: cards.map((c) => c.name).sort() });
}

async function resolvePaymentMethod(userId, paymentMethodName) {
  const name = paymentMethodName != null ? String(paymentMethodName).trim() : '';
  if (!name) return null;
  const pms = await PaymentMethod.findAll({ where: { userId }, attributes: ['id', 'name', 'aliases'] });
  const exact = pms.find((p) => p.name === name);
  if (exact) return exact;
  const norm = E.normalizeForMatch(name);
  const fuzzy = pms.filter((p) => nameKeys(p).includes(norm));
  if (fuzzy.length === 1) return fuzzy[0];
  throw V.httpError(422, 'PAYMENT_METHOD_NOT_FOUND',
    `找不到名稱為「${name}」的支付方式，請先在「卡片與支付方式」建立，或加入支付方式別名`,
    { knownPaymentMethods: pms.map((p) => p.name).sort() });
}

// ─────────────────────────────────────────────────────────────
// Matched campaigns per transaction
// ─────────────────────────────────────────────────────────────

async function loadMatchEvents(userId) {
  return (await CashbackEvent.findAll({
    where: { userId },
    include: [
      { model: Card, as: 'cards', through: { attributes: [] }, attributes: ['id'] },
      { model: PaymentMethod, as: 'paymentMethods', through: { attributes: [] }, attributes: ['id'] }
    ]
  })).map((e) => e.toJSON());
}

/** This transaction's own share of a campaign's reward (before caps). */
function standaloneReward(ev, txn) {
  if (ev.cashbackPercent != null && Number(ev.cashbackPercent) > 0) {
    const p = Math.min(6, Math.max(0, parseInt(ev.rewardPrecision, 10) || 0));
    return Number(E.percentRewardMicro(E.toCents(txn.amount), E.toPctMilli(ev.cashbackPercent), p, ev.rewardRounding)) / 1e6;
  }
  if (ev.cashbackFixed != null && ev.minimumSpendScope !== 'cycleTotal') return Number(ev.cashbackFixed);
  return null;
}

async function attachMatchedEvents(userId, txns, events) {
  const evs = events || await loadMatchEvents(userId);
  for (const txn of txns) {
    txn.matchedEvents = evs
      .filter((ev) => E.eventMatchesTransaction(ev, txn))
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        cashbackPercent: ev.cashbackPercent,
        cashbackFixed: ev.cashbackFixed,
        rewardType: ev.rewardType,
        maxReward: ev.maxReward,
        estimatedReward: standaloneReward(ev, txn),
        matchedKeyword: ev.requireMerchantMatch ? E.matchMerchantKeyword(ev, txn).keyword : null
      }));
  }
  return txns;
}

// ─────────────────────────────────────────────────────────────
// Ingest (API key) — POST /api/ingest/card-transactions
// ─────────────────────────────────────────────────────────────

async function ingestOne(userId, body) {
  const b = body || {};
  const amount = parseAmount(b.amount);
  const transactionAt = parseTxnAt(b.transactionAt, false);
  const latLng = parseLatLng(b);
  const externalRef = V.trimOrNull(b.externalRef, 120);

  if (externalRef) {
    const existing = await CardTransaction.findOne({ where: { userId, externalRef }, include: txnInclude() });
    if (existing) return { status: 200, created: false, txn: existing };
  }

  const card = await resolveCard(userId, b);
  const pm = await resolvePaymentMethod(userId, b.paymentMethodName);
  try {
    const created = await CardTransaction.create({
      userId,
      cardId: card.id,
      paymentMethodId: pm ? pm.id : null,
      rawCardName: V.trimOrNull(b.cardName, 120) || card.name,
      rawPaymentMethodName: V.trimOrNull(b.paymentMethodName, 120),
      amount,
      transactionAt,
      note: V.trimOrNull(b.note, 255),
      latitude: latLng.latitude,
      longitude: latLng.longitude,
      externalRef,
      source: 'api'
    });
    return { status: 201, created: true, txn: await CardTransaction.findByPk(created.id, { include: txnInclude() }) };
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError' && externalRef) {
      // Two concurrent retries with the same externalRef — return the winner.
      const existing = await CardTransaction.findOne({ where: { userId, externalRef }, include: txnInclude() });
      if (existing) return { status: 200, created: false, txn: existing };
      throw V.httpError(409, 'DUPLICATE_EXTERNAL_REF', 'externalRef 重複');
    }
    throw err;
  }
}

function sendError(res, err) {
  const status = err.status || 500;
  return res.status(status).json({ error: err.code || 'INTERNAL_ERROR', message: err.message, ...(err.extra || {}) });
}

exports.ingest = async (req, res, next) => {
  try {
    const r = await ingestOne(req.user.id, req.body);
    const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(r.txn)]);
    res.status(r.status).json(txn);
  } catch (err) {
    if (err.expose) return sendError(res, err);
    next(err);
  }
};

// POST /api/ingest/card-transactions/batch  body: { transactions: [...] }
exports.ingestBatch = async (req, res, next) => {
  try {
    const list = req.body && Array.isArray(req.body.transactions) ? req.body.transactions : null;
    if (!list) return res.status(400).json({ error: 'TRANSACTIONS_REQUIRED', message: 'body 需為 { "transactions": [ ... ] }' });
    if (list.length > MAX_BATCH) return res.status(413).json({ error: 'BATCH_TOO_LARGE', message: `單次最多 ${MAX_BATCH} 筆` });
    const results = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const r = await ingestOne(req.user.id, list[i]);
        results.push({ index: i, status: r.created ? 'created' : 'duplicate', id: r.txn.id, externalRef: r.txn.externalRef });
      } catch (err) {
        if (!err.expose) throw err;
        results.push({ index: i, status: 'error', error: err.code, message: err.message, ...(err.extra || {}) });
      }
    }
    const count = (s) => results.filter((r) => r.status === s).length;
    res.json({ created: count('created'), duplicates: count('duplicate'), errors: count('error'), results });
  } catch (err) { next(err); }
};

async function findByRef(userId, ref) {
  const externalRef = String(ref || '').trim();
  const row = externalRef ? await CardTransaction.findOne({ where: { userId, externalRef }, include: txnInclude() }) : null;
  if (!row) throw V.httpError(404, 'NOT_FOUND', `找不到 externalRef 為「${externalRef}」的交易`);
  return row;
}

// GET /api/ingest/card-transactions/:externalRef
exports.ingestGet = async (req, res, next) => {
  try {
    const row = await findByRef(req.user.id, req.params.externalRef);
    const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(row)]);
    res.json(txn);
  } catch (err) { if (err.expose) return sendError(res, err); next(err); }
};

// PUT /api/ingest/card-transactions/:externalRef  — partial update (e.g. corrected amount)
exports.ingestUpdate = async (req, res, next) => {
  try {
    const row = await findByRef(req.user.id, req.params.externalRef);
    const b = req.body || {};
    if (V.has(b, 'cardName') || V.has(b, 'cardLastFour')) {
      const card = await resolveCard(req.user.id, b);
      row.cardId = card.id;
      row.rawCardName = V.trimOrNull(b.cardName, 120) || card.name;
    }
    if (V.has(b, 'paymentMethodName')) {
      const pm = await resolvePaymentMethod(req.user.id, b.paymentMethodName);
      row.paymentMethodId = pm ? pm.id : null;
      row.rawPaymentMethodName = V.trimOrNull(b.paymentMethodName, 120);
    }
    if (V.has(b, 'amount')) row.amount = parseAmount(b.amount);
    if (V.has(b, 'transactionAt')) row.transactionAt = parseTxnAt(b.transactionAt, true);
    if (V.has(b, 'note')) row.note = V.trimOrNull(b.note, 255);
    if (V.has(b, 'latitude') || V.has(b, 'longitude')) Object.assign(row, parseLatLng(b));
    await row.save();
    const fresh = await CardTransaction.findByPk(row.id, { include: txnInclude() });
    const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(fresh)]);
    res.json(txn);
  } catch (err) { if (err.expose) return sendError(res, err); next(err); }
};

// DELETE /api/ingest/card-transactions/:externalRef  — e.g. the purchase was refunded / voided
exports.ingestDelete = async (req, res, next) => {
  try {
    const row = await findByRef(req.user.id, req.params.externalRef);
    await row.destroy();
    res.json({ ok: true, id: row.id, externalRef: row.externalRef });
  } catch (err) { if (err.expose) return sendError(res, err); next(err); }
};

// ─────────────────────────────────────────────────────────────
// Session CRUD for the app
// ─────────────────────────────────────────────────────────────

function listWhere(userId, query) {
  const where = { userId };
  const and = [];
  const cardId = V.idParam(query.cardId);
  if (cardId) where.cardId = cardId;
  if (query.paymentMethodId === 'none') where.paymentMethodId = null;
  else if (V.idParam(query.paymentMethodId)) where.paymentMethodId = V.idParam(query.paymentMethodId);
  const from = V.dateTimeOrNull(query.from, 'from');
  const to = V.dateTimeOrNull(query.to, 'to');
  if (from || to) {
    where.transactionAt = {};
    if (from) where.transactionAt[Op.gte] = from;
    if (to) where.transactionAt[Op.lte] = to;
  }
  const minAmount = V.numberOrNull(query.minAmount, 'minAmount', { min: 0 });
  const maxAmount = V.numberOrNull(query.maxAmount, 'maxAmount', { min: 0 });
  if (minAmount != null || maxAmount != null) {
    where.amount = {};
    if (minAmount != null) where.amount[Op.gte] = minAmount;
    if (maxAmount != null) where.amount[Op.lte] = maxAmount;
  }
  if (['api', 'manual'].includes(query.source)) where.source = query.source;
  const q = String(query.q || '').trim();
  if (q) {
    const like = { [Op.like]: `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%` };
    and.push({
      [Op.or]: [
        { note: like },
        { rawCardName: like },
        { rawPaymentMethodName: like },
        { '$card.name$': like },
        { '$paymentMethod.name$': like }
      ]
    });
  }
  if (and.length) where[Op.and] = and;
  return where;
}

// GET /api/transactions
exports.list = V.ah(async (req, res) => {
  const where = listWhere(req.user.id, req.query);
  const { page, pageSize, offset } = V.pagination(req.query, { defaultSize: 20, maxSize: 200 });

  const [{ rows, count }, sums] = await Promise.all([
    CardTransaction.findAndCountAll({
      where,
      include: txnInclude(),
      order: [['transactionAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset,
      distinct: true
    }),
    CardTransaction.findOne({
      where,
      include: txnInclude().map((i) => ({ ...i, attributes: [] })),
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true
    })
  ]);

  res.json({
    items: await attachMatchedEvents(req.user.id, rows.map(toPublicTxn)),
    total: count,
    page,
    pageSize,
    summary: { count, totalAmount: Math.round(Number(sums && sums.total ? sums.total : 0) * 100) / 100 }
  });
});

// GET /api/transactions/stats?from=&to=  (spend grouped by card / payment method / day)
exports.stats = V.ah(async (req, res) => {
  const where = listWhere(req.user.id, req.query);
  const base = { where, include: txnInclude().map((i) => ({ ...i, attributes: [] })), raw: true };
  const amountSum = [fn('SUM', col('amount')), 'total'];
  const cnt = [fn('COUNT', col('CardTransaction.id')), 'count'];
  const day = fn('DATE', col('transactionAt'));
  const [byCard, byPm, byDay] = await Promise.all([
    CardTransaction.findAll({ ...base, attributes: ['cardId', [col('card.name'), 'name'], amountSum, cnt], group: ['cardId', 'card.name'] }),
    CardTransaction.findAll({ ...base, attributes: ['paymentMethodId', [col('paymentMethod.name'), 'name'], amountSum, cnt], group: ['paymentMethodId', 'paymentMethod.name'] }),
    CardTransaction.findAll({ ...base, attributes: [[day, 'date'], amountSum, cnt], group: [day], order: [[day, 'ASC']] })
  ]);
  const shape = (rows, key) => rows.map((r) => ({
    [key]: r[key] != null ? r[key] : null,
    name: r.name || null,
    total: Math.round(Number(r.total || 0) * 100) / 100,
    count: Number(r.count || 0)
  })).sort((a, b) => b.total - a.total);
  const total = byCard.reduce((s, r) => s + Number(r.total || 0), 0);
  res.json({
    totalAmount: Math.round(total * 100) / 100,
    count: byCard.reduce((s, r) => s + Number(r.count || 0), 0),
    byCard: shape(byCard, 'cardId'),
    byPaymentMethod: shape(byPm, 'paymentMethodId'),
    byDay: byDay.map((r) => ({ date: String(r.date).slice(0, 10), total: Math.round(Number(r.total || 0) * 100) / 100, count: Number(r.count || 0) }))
  });
});

// GET /api/transactions/:id
exports.get = V.ah(async (req, res) => {
  const row = await CardTransaction.findOne({ where: { id: V.idParam(req.params.id) || 0, userId: req.user.id }, include: txnInclude() });
  if (!row) throw V.httpError(404, 'NOT_FOUND', '找不到此筆交易');
  const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(row)]);
  res.json(txn);
});

async function ownedCard(userId, id) {
  const card = await Card.findOne({ where: { id: V.idParam(id) || 0, userId } });
  if (!card) throw V.httpError(400, 'CARD_NOT_FOUND', '找不到指定的卡片');
  return card;
}

async function ownedPm(userId, id) {
  if (id === null || id === undefined || id === '' || id === 'none') return null;
  const pm = await PaymentMethod.findOne({ where: { id: V.idParam(id) || 0, userId } });
  if (!pm) throw V.httpError(400, 'PAYMENT_METHOD_NOT_FOUND', '找不到指定的支付方式');
  return pm;
}

// POST /api/transactions  (manual entry)
exports.create = V.ah(async (req, res) => {
  const b = req.body || {};
  if (!b.cardId) throw V.httpError(400, 'CARD_ID_REQUIRED', '請選擇卡片');
  const amount = parseAmount(b.amount);
  const transactionAt = parseTxnAt(b.transactionAt, false);
  const latLng = parseLatLng(b);
  const card = await ownedCard(req.user.id, b.cardId);
  const pm = await ownedPm(req.user.id, b.paymentMethodId);
  const created = await CardTransaction.create({
    userId: req.user.id,
    cardId: card.id,
    paymentMethodId: pm ? pm.id : null,
    rawCardName: card.name,
    rawPaymentMethodName: pm ? pm.name : null,
    amount,
    transactionAt,
    note: V.trimOrNull(b.note, 255),
    latitude: latLng.latitude,
    longitude: latLng.longitude,
    source: 'manual'
  });
  const row = await CardTransaction.findByPk(created.id, { include: txnInclude() });
  const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(row)]);
  res.status(201).json(txn);
});

// PUT /api/transactions/:id  (partial)
exports.update = V.ah(async (req, res) => {
  const row = await CardTransaction.findOne({ where: { id: V.idParam(req.params.id) || 0, userId: req.user.id } });
  if (!row) throw V.httpError(404, 'NOT_FOUND', '找不到此筆交易');
  const b = req.body || {};
  if (V.has(b, 'cardId')) {
    const card = await ownedCard(req.user.id, b.cardId);
    row.cardId = card.id;
    row.rawCardName = card.name;
  }
  if (V.has(b, 'paymentMethodId')) {
    const pm = await ownedPm(req.user.id, b.paymentMethodId);
    row.paymentMethodId = pm ? pm.id : null;
    row.rawPaymentMethodName = pm ? pm.name : null;
  }
  if (V.has(b, 'amount')) row.amount = parseAmount(b.amount);
  if (V.has(b, 'transactionAt')) row.transactionAt = parseTxnAt(b.transactionAt, true);
  if (V.has(b, 'note')) row.note = V.trimOrNull(b.note, 255);
  if (V.has(b, 'latitude') || V.has(b, 'longitude')) Object.assign(row, parseLatLng(b));
  await row.save();
  const fresh = await CardTransaction.findByPk(row.id, { include: txnInclude() });
  const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(fresh)]);
  res.json(txn);
});

// DELETE /api/transactions/:id
exports.remove = V.ah(async (req, res) => {
  const row = await CardTransaction.findOne({ where: { id: V.idParam(req.params.id) || 0, userId: req.user.id } });
  if (!row) throw V.httpError(404, 'NOT_FOUND', '找不到此筆交易');
  await row.destroy();
  res.json({ ok: true });
});

// GET /api/transactions/locations?cardId=&from=&to=
exports.listLocations = V.ah(async (req, res) => {
  const where = listWhere(req.user.id, req.query);
  where.latitude = { [Op.ne]: null };
  where.longitude = { [Op.ne]: null };
  const rows = await CardTransaction.findAll({
    where,
    include: txnInclude(),
    order: [['transactionAt', 'DESC']],
    limit: 5000
  });
  res.json(rows.map(toPublicTxn));
});

// ─────────────────────────────────────────────────────────────
// API keys (shared by ingest + external read API)
// ─────────────────────────────────────────────────────────────

function keyToPublic(row) {
  return {
    id: row.id,
    name: row.name,
    keyMask: row.keyMask,
    isActive: !!row.isActive,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt
  };
}

exports.listApiKeys = V.ah(async (req, res) => {
  const rows = await CardTransactionApiKey.findAll({ where: { userId: req.user.id }, order: [['id', 'ASC']] });
  res.json(rows.map(keyToPublic));
});

exports.createApiKey = V.ah(async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) throw V.httpError(400, 'NAME_REQUIRED', '請輸入金鑰名稱');
  if (name.length > 120) throw V.httpError(400, 'NAME_TOO_LONG', '名稱最多 120 字');
  const token = genToken('mcb');
  const row = await CardTransactionApiKey.create({
    userId: req.user.id,
    name,
    keyHash: sha256Hex(token),
    keyMask: maskKey(token),
    isActive: true
  });
  // The plaintext token is only ever returned here.
  res.status(201).json({ ...keyToPublic(row), token });
});

exports.updateApiKey = V.ah(async (req, res) => {
  const row = await CardTransactionApiKey.findOne({ where: { id: V.idParam(req.params.keyId) || 0, userId: req.user.id } });
  if (!row) throw V.httpError(404, 'NOT_FOUND', '找不到此金鑰');
  if (typeof req.body.name === 'string') {
    const name = req.body.name.trim();
    if (!name) throw V.httpError(400, 'NAME_REQUIRED', '請輸入金鑰名稱');
    row.name = name.slice(0, 120);
  }
  if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
  await row.save();
  res.json(keyToPublic(row));
});

exports.removeApiKey = V.ah(async (req, res) => {
  const row = await CardTransactionApiKey.findOne({ where: { id: V.idParam(req.params.keyId) || 0, userId: req.user.id } });
  if (!row) throw V.httpError(404, 'NOT_FOUND', '找不到此金鑰');
  await row.destroy();
  res.json({ ok: true });
});

exports.toPublicTxn = toPublicTxn;
exports.txnInclude = txnInclude;
exports.attachMatchedEvents = attachMatchedEvents;
exports.listWhere = listWhere;
