'use strict';

const path = require('path');
const fs = require('fs');
const { fn, col } = require('sequelize');
const { Card, PaymentMethod, CardTransaction, EventCard, EventPaymentMethod } = require('../models');
const { encryptSecret, decryptSecret } = require('../config/crypto');
const E = require('../services/rewardEngine');

function aliasesText(v) {
  const list = E.parseMerchantKeywords(v);
  return list.length ? list.join('\n').slice(0, 2000) : null;
}

async function countBy(model, key, where) {
  const rows = await model.findAll({ where, attributes: [key, [fn('COUNT', col(key)), 'n']], group: [key], raw: true });
  return new Map(rows.map((r) => [Number(r[key]), Number(r.n)]));
}

function pickColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

const VALID_NETWORKS = ['visa', 'mastercard', 'jcb', 'amex', 'unionpay', 'other'];

/**
 * Normalise a raw PAN input from the form: strip non-digits and require a
 * plausible length (13-19). Returns the digit string, or null when the user
 * left it blank; throws with a 400-tagged error on an invalid length.
 */
function normalisePan(raw) {
  if (raw == null || raw === '') return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 13 || digits.length > 19) {
    throw Object.assign(new Error('INVALID_PAN'), { status: 400, code: 'INVALID_PAN' });
  }
  return digits;
}

function cardToPublic(card) {
  const o = card.toJSON();
  const hasPan = !!o.pan;
  delete o.pan;
  o.hasPan = hasPan;
  return o;
}

// ---------- Cards ----------
exports.listCards = async (req, res, next) => {
  try {
    const cards = await Card.findAll({
      where: { userId: req.user.id },
      order: [['kind', 'ASC'], ['name', 'ASC']]
    });
    const ids = cards.map((c) => c.id);
    const [txnCounts, eventCounts] = ids.length
      ? await Promise.all([
        countBy(CardTransaction, 'cardId', { userId: req.user.id }),
        countBy(EventCard, 'cardId', { cardId: ids })
      ])
      : [new Map(), new Map()];
    res.json(cards.map((c) => ({
      ...cardToPublic(c),
      transactionCount: txnCounts.get(c.id) || 0,
      eventCount: eventCounts.get(c.id) || 0
    })));
  } catch (err) { next(err); }
};

exports.createCard = async (req, res, next) => {
  try {
    const { name, kind, issuer, pan, network, note } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED', message: '請輸入名稱' });

    const panDigits = normalisePan(pan);

    const file = req.file;
    const imageUrl = file ? `/uploads/${file.filename}` : null;

    const card = await Card.create({
      userId: req.user.id,
      name: String(name).trim(),
      kind: ['credit', 'debit', 'bank', 'other'].includes(kind) ? kind : 'credit',
      issuer: issuer ? String(issuer).trim() : null,
      lastFour: panDigits ? panDigits.slice(-4) : null,
      pan: panDigits ? encryptSecret(panDigits) : null,
      network: VALID_NETWORKS.includes(network) ? network : null,
      imageUrl,
      color: pickColorFromName(String(name)),
      aliases: aliasesText(req.body.aliases),
      note: note || null
    });
    res.status(201).json(cardToPublic(card));
  } catch (err) {
    if (err.code === 'INVALID_PAN') return res.status(400).json({ error: 'INVALID_PAN', message: '卡號需為 13~19 位數字' });
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME', message: '已有相同名稱' });
    }
    next(err);
  }
};

exports.updateCard = async (req, res, next) => {
  try {
    const card = await Card.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!card) return res.status(404).json({ error: 'NOT_FOUND', message: '找不到此卡片' });
    const { name, kind, issuer, pan, network, note } = req.body;
    if (name !== undefined) card.name = String(name).trim();
    if (kind && ['credit', 'debit', 'bank', 'other'].includes(kind)) card.kind = kind;
    if (issuer !== undefined) card.issuer = issuer ? String(issuer).trim() : null;
    if (network !== undefined) card.network = VALID_NETWORKS.includes(network) ? network : null;
    if (note !== undefined) card.note = note || null;
    if (req.body.aliases !== undefined) card.aliases = aliasesText(req.body.aliases);
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED', message: '請輸入名稱' });
    if (req.body.removePan === true || req.body.removePan === 'true') {
      card.pan = null;
    }

    // PAN update rules:
    //   - field absent or empty string → leave the stored PAN untouched
    //   - non-empty → validate, encrypt, replace, and refresh lastFour
    if (typeof pan === 'string' && pan.trim() !== '') {
      const panDigits = normalisePan(pan);
      if (panDigits) {
        card.pan = encryptSecret(panDigits);
        card.lastFour = panDigits.slice(-4);
      }
    }

    if (req.file) {
      // Remove old uploaded file when replaced
      if (card.imageUrl && card.imageUrl.startsWith('/uploads/')) {
        const old = path.resolve('./public', card.imageUrl.replace(/^\//, ''));
        fs.promises.unlink(old).catch(() => {});
      }
      card.imageUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.removeImage === 'true' || req.body.removeImage === true) {
      if (card.imageUrl && card.imageUrl.startsWith('/uploads/')) {
        fs.promises.unlink(path.resolve('./public', card.imageUrl.replace(/^\//, ''))).catch(() => {});
      }
      card.imageUrl = null;
    }
    await card.save();
    res.json(cardToPublic(card));
  } catch (err) {
    if (err.code === 'INVALID_PAN') return res.status(400).json({ error: 'INVALID_PAN', message: '卡號需為 13~19 位數字' });
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME', message: '已有相同名稱' });
    }
    next(err);
  }
};

exports.deleteCard = async (req, res, next) => {
  try {
    const card = await Card.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!card) return res.status(404).json({ error: 'NOT_FOUND', message: '找不到此卡片' });
    if (card.imageUrl && card.imageUrl.startsWith('/uploads/')) {
      const old = path.resolve('./public', card.imageUrl.replace(/^\//, ''));
      fs.promises.unlink(old).catch(() => {});
    }
    await card.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// GET /api/tags/cards/:id/pan — returns the plaintext PAN on-demand so it
// never rides along with the regular list response.
exports.getCardPan = async (req, res, next) => {
  try {
    const card = await Card.findOne({
      where: { id: req.params.id, userId: req.user.id },
      attributes: ['id', 'pan']
    });
    if (!card) return res.status(404).json({ error: 'NOT_FOUND', message: '找不到此卡片' });
    if (!card.pan) return res.status(404).json({ error: 'NO_PAN_STORED', message: '此卡尚未儲存完整卡號' });
    res.json({ pan: decryptSecret(card.pan) });
  } catch (err) { next(err); }
};

// ---------- Payment methods ----------
exports.listPaymentMethods = async (req, res, next) => {
  try {
    const list = await PaymentMethod.findAll({
      where: { userId: req.user.id },
      order: [['name', 'ASC']]
    });
    const ids = list.map((p) => p.id);
    const [txnCounts, eventCounts] = ids.length
      ? await Promise.all([
        countBy(CardTransaction, 'paymentMethodId', { userId: req.user.id }),
        countBy(EventPaymentMethod, 'paymentMethodId', { paymentMethodId: ids })
      ])
      : [new Map(), new Map()];
    res.json(list.map((p) => ({
      ...p.toJSON(),
      transactionCount: txnCounts.get(p.id) || 0,
      eventCount: eventCounts.get(p.id) || 0
    })));
  } catch (err) { next(err); }
};

exports.createPaymentMethod = async (req, res, next) => {
  try {
    const { name, note } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED', message: '請輸入名稱' });

    const file = req.file;
    const imageUrl = file ? `/uploads/${file.filename}` : null;

    const pm = await PaymentMethod.create({
      userId: req.user.id,
      name: String(name).trim(),
      imageUrl,
      color: pickColorFromName(String(name)),
      aliases: aliasesText(req.body.aliases),
      note: note || null
    });
    res.status(201).json(pm);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME', message: '已有相同名稱' });
    }
    next(err);
  }
};

exports.updatePaymentMethod = async (req, res, next) => {
  try {
    const pm = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!pm) return res.status(404).json({ error: 'NOT_FOUND', message: '找不到此支付方式' });
    const { name, note } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED', message: '請輸入名稱' });
    if (name !== undefined) pm.name = String(name).trim();
    if (note !== undefined) pm.note = note || null;
    if (req.body.aliases !== undefined) pm.aliases = aliasesText(req.body.aliases);

    if (req.file) {
      if (pm.imageUrl && pm.imageUrl.startsWith('/uploads/')) {
        const old = path.resolve('./public', pm.imageUrl.replace(/^\//, ''));
        fs.promises.unlink(old).catch(() => {});
      }
      pm.imageUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.removeImage === 'true' || req.body.removeImage === true) {
      if (pm.imageUrl && pm.imageUrl.startsWith('/uploads/')) {
        fs.promises.unlink(path.resolve('./public', pm.imageUrl.replace(/^\//, ''))).catch(() => {});
      }
      pm.imageUrl = null;
    }
    await pm.save();
    res.json(pm);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME', message: '已有相同名稱' });
    }
    next(err);
  }
};

exports.deletePaymentMethod = async (req, res, next) => {
  try {
    const pm = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!pm) return res.status(404).json({ error: 'NOT_FOUND', message: '找不到此支付方式' });
    if (pm.imageUrl && pm.imageUrl.startsWith('/uploads/')) {
      const old = path.resolve('./public', pm.imageUrl.replace(/^\//, ''));
      fs.promises.unlink(old).catch(() => {});
    }
    await pm.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};
