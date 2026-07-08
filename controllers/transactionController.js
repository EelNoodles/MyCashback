'use strict';

const { Op } = require('sequelize');
const {
  CardTransaction,
  CardTransactionApiKey,
  Card,
  PaymentMethod,
  CashbackEvent
} = require('../models');
const { genToken, sha256Hex, maskKey } = require('../config/crypto');
const { eventMatchesTransaction, matchMerchantKeyword } = require('../services/cashbackCycleService');

function txnInclude() {
  return [
    { model: Card, as: 'card', attributes: ['id', 'name', 'imageUrl', 'network', 'color'] },
    { model: PaymentMethod, as: 'paymentMethod', attributes: ['id', 'name', 'imageUrl'] }
  ];
}

function toPublicTxn(row) {
  const o = row.toJSON();
  return {
    id: o.id,
    cardId: o.cardId,
    card: o.card ? { id: o.card.id, name: o.card.name, imageUrl: o.card.imageUrl, network: o.card.network, color: o.card.color } : null,
    paymentMethodId: o.paymentMethodId,
    paymentMethod: o.paymentMethod ? { id: o.paymentMethod.id, name: o.paymentMethod.name, imageUrl: o.paymentMethod.imageUrl } : null,
    amount: o.amount,
    transactionAt: o.transactionAt,
    note: o.note,
    latitude: o.latitude != null ? Number(o.latitude) : null,
    longitude: o.longitude != null ? Number(o.longitude) : null,
    externalRef: o.externalRef,
    source: o.source,
    createdAt: o.createdAt
  };
}

// Validates an optional { latitude, longitude } pair: both present and in
// range, or both absent — never just one. Returns { latitude, longitude }
// (nulls when omitted) or throws a 400-tagged error.
function parseLatLng(body) {
  const hasLat = body.latitude !== undefined && body.latitude !== null && body.latitude !== '';
  const hasLng = body.longitude !== undefined && body.longitude !== null && body.longitude !== '';
  if (!hasLat && !hasLng) return { latitude: null, longitude: null };
  if (hasLat !== hasLng) {
    throw Object.assign(new Error('LOCATION_INCOMPLETE'), { status: 400, code: 'LOCATION_INCOMPLETE' });
  }
  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw Object.assign(new Error('LOCATION_INVALID'), { status: 400, code: 'LOCATION_INVALID' });
  }
  return { latitude: lat, longitude: lng };
}

async function reload(row) {
  return CardTransaction.findByPk(row.id, { include: txnInclude() });
}

// Tags each transaction with the cashback events it counts towards (card +
// payment method rule match, within the event's active date range), so the
// management page can show "this transaction qualifies for campaign X".
async function attachMatchedEvents(userId, txns) {
  const events = await CashbackEvent.findAll({
    where: { userId },
    include: [
      { model: Card, as: 'cards', through: { attributes: [] }, attributes: ['id'] },
      { model: PaymentMethod, as: 'paymentMethods', through: { attributes: [] }, attributes: ['id'] }
    ]
  });

  for (const txn of txns) {
    txn.matchedEvents = events
      .filter((ev) => eventMatchesTransaction(ev, txn))
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        cashbackPercent: ev.cashbackPercent,
        cashbackFixed: ev.cashbackFixed,
        rewardType: ev.rewardType,
        maxReward: ev.maxReward,
        matchedKeyword: ev.requireMerchantMatch ? matchMerchantKeyword(ev, txn).keyword : null
      }));
  }
  return txns;
}

// ─────────────────────────────────────────────────────────────
// POST /api/ingest/card-transactions  (API-key auth, called by an external
// bookkeeping system — see middleware/apiKeyAuth.js)
// ─────────────────────────────────────────────────────────────
exports.ingest = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cardName, paymentMethodName, amount, transactionAt, note, externalRef } = req.body || {};

    const cardNameTrim = String(cardName || '').trim();
    if (!cardNameTrim) return res.status(400).json({ error: 'CARD_NAME_REQUIRED' });

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'AMOUNT_INVALID', message: 'amount 必須是大於 0 的數字' });
    }

    const txAt = transactionAt ? new Date(transactionAt) : new Date();
    if (Number.isNaN(txAt.getTime())) {
      return res.status(400).json({ error: 'TRANSACTION_AT_INVALID', message: 'transactionAt 需為可解析的日期時間字串 (建議 ISO 8601)' });
    }

    let latLng;
    try {
      latLng = parseLatLng(req.body || {});
    } catch (e) {
      return res.status(400).json({ error: e.code, message: e.code === 'LOCATION_INCOMPLETE' ? 'latitude 與 longitude 需一起提供' : 'latitude/longitude 超出範圍' });
    }

    const externalRefTrim = externalRef != null ? String(externalRef).trim().slice(0, 120) : null;

    // Idempotency: replaying the same externalRef returns the existing record.
    if (externalRefTrim) {
      const existing = await CardTransaction.findOne({
        where: { userId, externalRef: externalRefTrim },
        include: txnInclude()
      });
      if (existing) return res.status(200).json(toPublicTxn(existing));
    }

    const card = await Card.findOne({ where: { userId, name: cardNameTrim } });
    if (!card) {
      const known = await Card.findAll({ where: { userId }, attributes: ['name'], order: [['name', 'ASC']] });
      return res.status(422).json({
        error: 'CARD_NOT_FOUND',
        message: `找不到名稱為「${cardNameTrim}」的卡片，請先在「卡片與支付方式」建立相同名稱`,
        knownCards: known.map((c) => c.name)
      });
    }

    const pmNameTrim = paymentMethodName != null ? String(paymentMethodName).trim() : '';
    let paymentMethod = null;
    if (pmNameTrim) {
      paymentMethod = await PaymentMethod.findOne({ where: { userId, name: pmNameTrim } });
      if (!paymentMethod) {
        const known = await PaymentMethod.findAll({ where: { userId }, attributes: ['name'], order: [['name', 'ASC']] });
        return res.status(422).json({
          error: 'PAYMENT_METHOD_NOT_FOUND',
          message: `找不到名稱為「${pmNameTrim}」的支付方式，請先在「卡片與支付方式」建立相同名稱`,
          knownPaymentMethods: known.map((p) => p.name)
        });
      }
    }

    const created = await CardTransaction.create({
      userId,
      cardId: card.id,
      paymentMethodId: paymentMethod ? paymentMethod.id : null,
      rawCardName: cardNameTrim,
      rawPaymentMethodName: pmNameTrim || null,
      amount: amt,
      transactionAt: txAt,
      note: note ? String(note).trim().slice(0, 255) : null,
      latitude: latLng.latitude,
      longitude: latLng.longitude,
      externalRef: externalRefTrim,
      source: 'api'
    });

    res.status(201).json(toPublicTxn(await reload(created)));
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      // Race: two concurrent retries with the same externalRef.
      const externalRefTrim = req.body && req.body.externalRef ? String(req.body.externalRef).trim() : null;
      const existing = externalRefTrim
        ? await CardTransaction.findOne({ where: { userId: req.user.id, externalRef: externalRefTrim }, include: txnInclude() })
        : null;
      if (existing) return res.status(200).json(toPublicTxn(existing));
      return res.status(409).json({ error: 'DUPLICATE_EXTERNAL_REF' });
    }
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// Session-authenticated CRUD for the management page
// ─────────────────────────────────────────────────────────────

// GET /api/transactions?cardId=&paymentMethodId=&from=&to=&q=&page=&pageSize=
exports.list = async (req, res, next) => {
  try {
    const where = { userId: req.user.id };
    if (req.query.cardId) where.cardId = parseInt(req.query.cardId, 10);
    if (req.query.paymentMethodId === 'none') {
      where.paymentMethodId = null;
    } else if (req.query.paymentMethodId) {
      where.paymentMethodId = parseInt(req.query.paymentMethodId, 10);
    }
    if (req.query.from || req.query.to) {
      where.transactionAt = {};
      if (req.query.from) where.transactionAt[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.transactionAt[Op.lte] = new Date(req.query.to);
    }
    if (req.query.q) {
      where.note = { [Op.like]: `%${String(req.query.q).trim()}%` };
    }
    if (['api', 'manual'].includes(req.query.source)) {
      where.source = req.query.source;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

    const { rows, count } = await CardTransaction.findAndCountAll({
      where,
      include: txnInclude(),
      order: [['transactionAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.json({
      items: await attachMatchedEvents(req.user.id, rows.map(toPublicTxn)),
      total: count,
      page,
      pageSize
    });
  } catch (err) { next(err); }
};

// GET /api/transactions/:id
exports.get = async (req, res, next) => {
  try {
    const row = await CardTransaction.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: txnInclude()
    });
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(row)]);
    res.json(txn);
  } catch (err) { next(err); }
};

// POST /api/transactions  (manual entry from the management page)
exports.create = async (req, res, next) => {
  try {
    const { cardId, paymentMethodId, amount, transactionAt, note } = req.body || {};
    const amt = Number(amount);
    if (!cardId) return res.status(400).json({ error: 'CARD_ID_REQUIRED' });
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'AMOUNT_INVALID' });
    const txAt = transactionAt ? new Date(transactionAt) : new Date();
    if (Number.isNaN(txAt.getTime())) return res.status(400).json({ error: 'TRANSACTION_AT_INVALID' });

    let latLng;
    try {
      latLng = parseLatLng(req.body || {});
    } catch (e) {
      return res.status(400).json({ error: e.code });
    }

    const card = await Card.findOne({ where: { id: cardId, userId: req.user.id } });
    if (!card) return res.status(400).json({ error: 'CARD_NOT_FOUND' });

    let paymentMethod = null;
    if (paymentMethodId) {
      paymentMethod = await PaymentMethod.findOne({ where: { id: paymentMethodId, userId: req.user.id } });
      if (!paymentMethod) return res.status(400).json({ error: 'PAYMENT_METHOD_NOT_FOUND' });
    }

    const created = await CardTransaction.create({
      userId: req.user.id,
      cardId: card.id,
      paymentMethodId: paymentMethod ? paymentMethod.id : null,
      rawCardName: card.name,
      rawPaymentMethodName: paymentMethod ? paymentMethod.name : null,
      amount: amt,
      transactionAt: txAt,
      note: note ? String(note).trim().slice(0, 255) : null,
      latitude: latLng.latitude,
      longitude: latLng.longitude,
      source: 'manual'
    });

    const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(await reload(created))]);
    res.status(201).json(txn);
  } catch (err) { next(err); }
};

// PUT /api/transactions/:id
exports.update = async (req, res, next) => {
  try {
    const row = await CardTransaction.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

    const { cardId, paymentMethodId, amount, transactionAt, note } = req.body || {};

    if (cardId !== undefined) {
      const card = await Card.findOne({ where: { id: cardId, userId: req.user.id } });
      if (!card) return res.status(400).json({ error: 'CARD_NOT_FOUND' });
      row.cardId = card.id;
      row.rawCardName = card.name;
    }
    if (paymentMethodId !== undefined) {
      if (!paymentMethodId) {
        row.paymentMethodId = null;
        row.rawPaymentMethodName = null;
      } else {
        const pm = await PaymentMethod.findOne({ where: { id: paymentMethodId, userId: req.user.id } });
        if (!pm) return res.status(400).json({ error: 'PAYMENT_METHOD_NOT_FOUND' });
        row.paymentMethodId = pm.id;
        row.rawPaymentMethodName = pm.name;
      }
    }
    if (amount !== undefined) {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'AMOUNT_INVALID' });
      row.amount = amt;
    }
    if (transactionAt !== undefined) {
      const txAt = new Date(transactionAt);
      if (Number.isNaN(txAt.getTime())) return res.status(400).json({ error: 'TRANSACTION_AT_INVALID' });
      row.transactionAt = txAt;
    }
    if (note !== undefined) row.note = note ? String(note).trim().slice(0, 255) : null;
    if (req.body.latitude !== undefined || req.body.longitude !== undefined) {
      try {
        const latLng = parseLatLng(req.body || {});
        row.latitude = latLng.latitude;
        row.longitude = latLng.longitude;
      } catch (e) {
        return res.status(400).json({ error: e.code });
      }
    }

    await row.save();
    const [txn] = await attachMatchedEvents(req.user.id, [toPublicTxn(await reload(row))]);
    res.json(txn);
  } catch (err) { next(err); }
};

// GET /api/transactions/locations?cardId=&from=&to=
// Lightweight, unpaginated feed of geotagged transactions for the map view
// (markers + heatmap) — deliberately separate from list() since a map wants
// every matching point at once rather than a page of a table.
exports.listLocations = async (req, res, next) => {
  try {
    const where = {
      userId: req.user.id,
      latitude: { [Op.ne]: null },
      longitude: { [Op.ne]: null }
    };
    if (req.query.cardId) where.cardId = parseInt(req.query.cardId, 10);
    if (req.query.from || req.query.to) {
      where.transactionAt = {};
      if (req.query.from) where.transactionAt[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.transactionAt[Op.lte] = new Date(req.query.to);
    }

    const rows = await CardTransaction.findAll({
      where,
      include: txnInclude(),
      order: [['transactionAt', 'DESC']],
      limit: 5000
    });

    res.json(rows.map(toPublicTxn));
  } catch (err) { next(err); }
};

// DELETE /api/transactions/:id
exports.remove = async (req, res, next) => {
  try {
    const row = await CardTransaction.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    await row.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────
// API key management (issues the tokens the ingest endpoint accepts)
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

// GET /api/transactions/api-keys
exports.listApiKeys = async (req, res, next) => {
  try {
    const rows = await CardTransactionApiKey.findAll({
      where: { userId: req.user.id },
      order: [['id', 'ASC']]
    });
    res.json(rows.map(keyToPublic));
  } catch (err) { next(err); }
};

// POST /api/transactions/api-keys  body: { name }
exports.createApiKey = async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
    if (name.length > 120) return res.status(400).json({ error: 'NAME_TOO_LONG' });

    const token = genToken('mcb');
    const row = await CardTransactionApiKey.create({
      userId: req.user.id,
      name,
      keyHash: sha256Hex(token),
      keyMask: maskKey(token),
      isActive: true
    });

    // Plaintext token is only ever returned here — it cannot be retrieved again.
    res.status(201).json({ ...keyToPublic(row), token });
  } catch (err) { next(err); }
};

// PUT /api/transactions/api-keys/:keyId  body: { name?, isActive? }
exports.updateApiKey = async (req, res, next) => {
  try {
    const row = await CardTransactionApiKey.findOne({
      where: { id: req.params.keyId, userId: req.user.id }
    });
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });

    if (typeof req.body.name === 'string') {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
      row.name = name;
    }
    if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;

    await row.save();
    res.json(keyToPublic(row));
  } catch (err) { next(err); }
};

// DELETE /api/transactions/api-keys/:keyId
exports.removeApiKey = async (req, res, next) => {
  try {
    const row = await CardTransactionApiKey.findOne({
      where: { id: req.params.keyId, userId: req.user.id }
    });
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    await row.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};
