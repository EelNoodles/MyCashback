'use strict';

const path = require('path');
const fs = require('fs');
const { Card, PaymentMethod } = require('../models');

function pickColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

const VALID_NETWORKS = ['visa', 'mastercard', 'jcb', 'amex', 'unionpay', 'other'];

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
    const { name, kind, issuer, lastFour, network, note } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'NAME_REQUIRED' });

    const file = req.file;
    const imageUrl = file ? `/uploads/${file.filename}` : null;

    const card = await Card.create({
      userId: req.user.id,
      name: String(name).trim(),
      kind: ['credit', 'debit', 'bank', 'other'].includes(kind) ? kind : 'credit',
      issuer: issuer ? String(issuer).trim() : null,
      lastFour: lastFour ? String(lastFour).trim().slice(-4) : null,
      network: VALID_NETWORKS.includes(network) ? network : null,
      imageUrl,
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
    const { name, kind, issuer, lastFour, network, note } = req.body;
    if (name !== undefined) card.name = String(name).trim();
    if (kind && ['credit', 'debit', 'bank', 'other'].includes(kind)) card.kind = kind;
    if (issuer !== undefined) card.issuer = issuer ? String(issuer).trim() : null;
    if (lastFour !== undefined) card.lastFour = lastFour ? String(lastFour).trim().slice(-4) : null;
    if (network !== undefined) card.network = VALID_NETWORKS.includes(network) ? network : null;
    if (note !== undefined) card.note = note || null;

    if (req.file) {
      // Remove old uploaded file when replaced
      if (card.imageUrl && card.imageUrl.startsWith('/uploads/')) {
        const old = path.resolve('./public', card.imageUrl.replace(/^\//, ''));
        fs.promises.unlink(old).catch(() => {});
      }
      card.imageUrl = `/uploads/${req.file.filename}`;
    }
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
    if (card.imageUrl && card.imageUrl.startsWith('/uploads/')) {
      const old = path.resolve('./public', card.imageUrl.replace(/^\//, ''));
      fs.promises.unlink(old).catch(() => {});
    }
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
