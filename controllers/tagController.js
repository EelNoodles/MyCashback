'use strict';

const { Card, PaymentMethod } = require('../models');

function pickColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

// ---------- Cards ----------
exports.listCards = async (req, res, next) => {
  try {
    const cards = await Card.findAll({
      where: { userId: req.user.id },
      order: [['kind', 'ASC'], ['name', 'ASC']]
    });
    res.json(cards);
  } catch (err) { next(err); }
};

exports.createCard = async (req, res, next) => {
  try {
    const { name, kind, issuer, note } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED' });
    const card = await Card.create({
      userId: req.user.id,
      name: String(name).trim(),
      kind: ['credit', 'debit', 'bank', 'other'].includes(kind) ? kind : 'credit',
      issuer: issuer ? String(issuer).trim() : null,
      color: pickColorFromName(String(name)),
      note: note || null
    });
    res.status(201).json(card);
  } catch (err) {
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
    const { name, kind, issuer, note } = req.body;
    if (name !== undefined) card.name = String(name).trim();
    if (kind && ['credit', 'debit', 'bank', 'other'].includes(kind)) card.kind = kind;
    if (issuer !== undefined) card.issuer = issuer ? String(issuer).trim() : null;
    if (note !== undefined) card.note = note || null;
    await card.save();
    res.json(card);
  } catch (err) {
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
    await card.destroy();
    res.json({ ok: true });
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
    const pm = await PaymentMethod.create({
      userId: req.user.id,
      name: String(name).trim(),
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
    await pm.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};
