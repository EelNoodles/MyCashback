'use strict';

/**
 * Read-only API for the user's own tools (spreadsheets, iOS Shortcuts,
 * bookkeeping apps), authenticated with the same API key as /api/ingest.
 */

const { Op } = require('sequelize');
const { Card, CardTransaction, Point, PointExpiry } = require('../models');
const svc = require('../services/cashbackCycleService');
const E = require('../services/rewardEngine');
const V = require('../utils/validate');
const cashback = require('./cashbackController');
const txnCtrl = require('./transactionController');
const dashboard = require('./dashboardController');
const pointCtrl = require('./pointController');

/** Absolute URL for an uploaded image so external tools can fetch it directly. */
function absoluteUrl(req, relPath) {
  if (!relPath) return null;
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}${baseUrl}${relPath}`;
}

function eventToPublic(ev, req) {
  return {
    id: ev.id,
    title: ev.title,
    description: ev.description,
    note: ev.note,
    cashbackPercent: ev.cashbackPercent,
    cashbackFixed: ev.cashbackFixed,
    rewardType: ev.rewardType,
    maxReward: ev.maxReward,
    minimumSpend: ev.minimumSpend,
    minimumSpendScope: ev.minimumSpendScope || 'perTransaction',
    startDate: ev.startDate,
    endDate: ev.endDate,
    cycleType: ev.cycleType,
    cycleAnchorDay: ev.cycleAnchorDay,
    matchUnspecifiedPayment: ev.matchUnspecifiedPayment,
    requireMerchantMatch: ev.requireMerchantMatch,
    merchantKeywords: ev.requireMerchantMatch ? E.parseMerchantKeywords(ev.merchantKeywords) : [],
    excludeMerchantMatch: ev.excludeMerchantMatch,
    excludeMerchantKeywords: ev.excludeMerchantMatch ? E.parseMerchantKeywords(ev.excludeMerchantKeywords) : [],
    rewardRounding: ev.rewardRounding,
    rewardCalcMode: ev.rewardCalcMode,
    rewardPrecision: ev.rewardPrecision,
    requiresRegistration: !!ev.requiresRegistration,
    registeredAt: ev.registeredAt || null,
    needsRegistration: E.needsRegistration(ev),
    cards: (ev.cards || []).map((c) => ({ id: c.id, name: c.name, imageUrl: absoluteUrl(req, c.imageUrl) })),
    paymentMethods: (ev.paymentMethods || []).map((p) => ({ id: p.id, name: p.name })),
    sourceUrl: ev.sourceUrl,
    timing: ev.timing,
    usage: ev.usage
  };
}

const STATUSES = ['active', 'ongoing', 'upcoming', 'expired', 'all'];
const statusOf = (q) => (STATUSES.includes(q) ? q : 'active');

// GET /api/external/cards?status=active|ongoing|upcoming|expired|all
exports.listCardsSummary = V.ah(async (req, res) => {
  const userId = req.user.id;
  const [cards, events] = await Promise.all([
    Card.findAll({ where: { userId }, order: [['kind', 'ASC'], ['name', 'ASC']] }),
    cashback.findEvents(userId, { status: statusOf(req.query.status) }).then((evs) => svc.withUsage(evs))
  ]);
  res.json({
    generatedAt: new Date().toISOString(),
    cards: cards.map((card) => ({
      id: card.id,
      name: card.name,
      kind: card.kind,
      issuer: card.issuer,
      network: card.network,
      lastFour: card.lastFour,
      color: card.color,
      imageUrl: absoluteUrl(req, card.imageUrl),
      events: events
        .filter((ev) => (ev.cards || []).some((c) => c.id === card.id))
        .map((ev) => eventToPublic(ev, req))
    }))
  });
});

// GET /api/external/events?status=&cardId=&paymentMethodId=&q=
exports.listEvents = V.ah(async (req, res) => {
  const events = await cashback.findEvents(req.user.id, { ...req.query, status: statusOf(req.query.status) });
  const out = await svc.withUsage(events);
  res.json({ generatedAt: new Date().toISOString(), events: out.map((ev) => eventToPublic(ev, req)) });
});

// GET /api/external/recommend?amount=&merchant=&cardId=&paymentMethodId=&at=&limit=
exports.recommend = V.ah(async (req, res) => {
  const result = await cashback.recommendFor(req.user.id, req.query);
  result.options = result.options.map((o) => ({
    ...o,
    card: { ...o.card, imageUrl: absoluteUrl(req, o.card.imageUrl) },
    paymentMethod: o.paymentMethod ? { ...o.paymentMethod, imageUrl: absoluteUrl(req, o.paymentMethod.imageUrl) } : null
  }));
  const best = result.options[0];
  result.best = best && best.totalReward > 0
    ? {
      text: `${best.card.name}${best.paymentMethod ? ' + ' + best.paymentMethod.name : ''}：約回饋 ${best.totalReward}（${best.effectiveRate}%）`,
      cardName: best.card.name,
      paymentMethodName: best.paymentMethod ? best.paymentMethod.name : null,
      totalReward: best.totalReward,
      effectiveRate: best.effectiveRate
    }
    : null;
  res.json(result);
});

// GET /api/external/summary
exports.summary = V.ah(async (req, res) => {
  res.json(await dashboard.buildSummary(req.user.id));
});

// GET /api/external/transactions?from=&to=&cardId=&paymentMethodId=&q=&page=&pageSize=
exports.listTransactions = V.ah(async (req, res) => {
  const where = txnCtrl.listWhere(req.user.id, req.query);
  const { page, pageSize, offset } = V.pagination(req.query, { defaultSize: 50, maxSize: 500 });
  const { rows, count } = await CardTransaction.findAndCountAll({
    where,
    include: txnCtrl.txnInclude(),
    order: [['transactionAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset,
    distinct: true
  });
  res.json({ items: await txnCtrl.attachMatchedEvents(req.user.id, rows.map(txnCtrl.toPublicTxn)), total: count, page, pageSize });
});

// GET /api/external/points
exports.listPoints = V.ah(async (req, res) => {
  const [rows, expiries] = await Promise.all([
    Point.findAll({ where: { userId: req.user.id }, order: [['name', 'ASC']] }),
    PointExpiry.findAll({ where: { userId: req.user.id, status: 'active', expiryDate: { [Op.gte]: E.todayDateOnly() } }, order: [['expiryDate', 'ASC']] })
  ]);
  res.json({
    generatedAt: new Date().toISOString(),
    points: rows.map((p) => {
      const o = pointCtrl.pointToPublic(p);
      return {
        id: o.id,
        name: o.name,
        issuer: o.issuer,
        currentBalance: o.currentBalance,
        valuePerPoint: o.valuePerPoint,
        value: o.value,
        imageUrl: absoluteUrl(req, o.imageUrl),
        expiries: expiries.filter((x) => x.pointId === p.id).map((x) => ({ amount: Number(x.amount), expiryDate: x.expiryDate, note: x.note }))
      };
    })
  });
});
