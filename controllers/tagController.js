'use strict';

const path = require('path');
const fs = require('fs');
const { Card, PaymentMethod } = require('../models');
const { encryptSecret, decryptSecret } = require('../config/crypto');

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
    res.json(cards.map(cardToPublic));
  } catch (err) { next(err); }
};

exports.createCard = async (req, res, next) => {
  try {
    const { name, kind, issuer, pan, network, note } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED' });

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
      note: note || null
    });
    res.status(201).json(cardToPublic(card));
  } catch (err) {
    if (err.code === 'INVALID_PAN') return res.status(400).json({ error: 'INVALID_PAN' });
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME' });
    }
    next(err);
  }
};

exports.updateCard = async (req, res, next) => {
  try {
    const card = await Card.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!card) return res.status(404).json({ error: 'NOT_FOUND' });
    const { name, kind, issuer, pan, network, note } = req.body;
    if (name !== undefined) card.name = String(name).trim();
    if (kind && ['credit', 'debit', 'bank', 'other'].includes(kind)) card.kind = kind;
    if (issuer !== undefined) card.issuer = issuer ? String(issuer).trim() : null;
    if (network !== undefined) card.network = VALID_NETWORKS.includes(network) ? network : null;
    if (note !== undefined) card.note = note || null;

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
    }
    await card.save();
    res.json(cardToPublic(card));
  } catch (err) {
    if (err.code === 'INVALID_PAN') return res.status(400).json({ error: 'INVALID_PAN' });
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME' });
    }
    next(err);
  }
};

exports.deleteCard = async (req, res, next) => {
  try {
    const card = await Card.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!card) return res.status(404).json({ error: 'NOT_FOUND' });
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
    if (!card) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!card.pan) return res.status(404).json({ error: 'NO_PAN_STORED' });
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
    res.json(list);
  } catch (err) { next(err); }
};

exports.createPaymentMethod = async (req, res, next) => {
  try {
    const { name, note } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED' });

    const file = req.file;
    const imageUrl = file ? `/uploads/${file.filename}` : null;

    const pm = await PaymentMethod.create({
      userId: req.user.id,
      name: String(name).trim(),
      imageUrl,
      color: pickColorFromName(String(name)),
      note: note || null
    });
    res.status(201).json(pm);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME' });
    }
    next(err);
  }
};

exports.updatePaymentMethod = async (req, res, next) => {
  try {
    const pm = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!pm) return res.status(404).json({ error: 'NOT_FOUND' });
    const { name, note } = req.body;
    if (name !== undefined) pm.name = String(name).trim();
    if (note !== undefined) pm.note = note || null;

    if (req.file) {
      if (pm.imageUrl && pm.imageUrl.startsWith('/uploads/')) {
        const old = path.resolve('./public', pm.imageUrl.replace(/^\//, ''));
        fs.promises.unlink(old).catch(() => {});
      }
      pm.imageUrl = `/uploads/${req.file.filename}`;
    }
    await pm.save();
    res.json(pm);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'DUPLICATE_NAME' });
    }
    next(err);
  }
};

exports.deletePaymentMethod = async (req, res, next) => {
  try {
    const pm = await PaymentMethod.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!pm) return res.status(404).json({ error: 'NOT_FOUND' });
    if (pm.imageUrl && pm.imageUrl.startsWith('/uploads/')) {
      const old = path.resolve('./public', pm.imageUrl.replace(/^\//, ''));
      fs.promises.unlink(old).catch(() => {});
    }
    await pm.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};
