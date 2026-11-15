'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  CashbackEvent,
  Card,
  PaymentMethod,
  RewardReceipt
} = require('../models');
const svc = require('../services/cashbackCycleService');
const E = require('../services/rewardEngine');
const V = require('../utils/validate');

const CARD_ATTRS = ['id', 'name', 'kind', 'issuer', 'lastFour', 'network', 'imageUrl', 'color'];
const PM_ATTRS = ['id', 'name', 'imageUrl', 'color'];
const STATUSES = ['active', 'ongoing', 'upcoming', 'expired', 'all'];
const CYCLE_TYPES = ['none', 'weekly', 'biweekly', 'monthly'];
const REWARD_TYPES = ['point', 'cash', 'coupon', 'other'];

function eventInclude() {
  return [
    { model: Card, as: 'cards', attributes: CARD_ATTRS, through: { attributes: [] } },
    { model: PaymentMethod, as: 'paymentMethods', attributes: PM_ATTRS, through: { attributes: [] } }
  ];
}

/**
 * Status filters (all relative to today in APP_TIMEZONE):
 *   active   — not ended yet (includes upcoming)        [default]
 *   ongoing  — started and not ended
 *   upcoming — starts in the future
 *   expired  — ended
 *   all
 */
function statusWhere(status, today) {
  const notEnded = { [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: today } }] };
  const started = { [Op.or]: [{ startDate: null }, { startDate: { [Op.lte]: today } }] };
  switch (status) {
    case 'ongoing': return { [Op.and]: [notEnded, started] };
    case 'upcoming': return { startDate: { [Op.gt]: today } };
    case 'expired': return { endDate: { [Op.lt]: today } };
    case 'all': return {};
    default: return notEnded;
  }
}

function textMatches(ev, q) {
  const needle = E.normalizeForMatch(q);
  if (!needle) return true;
  const hay = E.normalizeForMatch([
    ev.title, ev.description, ev.note, ev.merchantKeywords, ev.excludeMerchantKeywords,
    ...(ev.cards || []).map((c) => c.name),
    ...(ev.paymentMethods || []).map((p) => p.name)
  ].filter(Boolean).join(' '));
  return hay.includes(needle);
}

function byDeadline(a, b) {
  const ae = a.endDate || '9999-12-31';
  const be = b.endDate || '9999-12-31';
  if (ae !== be) return ae < be ? -1 : 1;
  const as = a.startDate || '0000-01-01';
  const bs = b.startDate || '0000-01-01';
  if (as !== bs) return as < bs ? -1 : 1;
  return b.id - a.id;
}

/** Loads a user's events (plain objects) with status / card / payment / text filters applied. */
async function findEvents(userId, query = {}) {
  const status = STATUSES.includes(query.status) ? query.status : 'active';
  const rows = await CashbackEvent.findAll({
    where: { userId, ...statusWhere(status, E.todayDateOnly()) },
    include: eventInclude()
  });
  let events = rows.map((r) => r.toJSON());

  const cardId = V.idParam(query.cardId);
  if (cardId) events = events.filter((ev) => (ev.cards || []).some((c) => c.id === cardId));
  if (query.paymentMethodId === 'none') {
    events = events.filter((ev) => !(ev.paymentMethods || []).length || ev.matchUnspecifiedPayment);
  } else {
    const pmId = V.idParam(query.paymentMethodId);
    if (pmId) events = events.filter((ev) => (ev.paymentMethods || []).some((p) => p.id === pmId));
  }
  const q = String(query.q || '').trim();
  if (q) events = events.filter((ev) => textMatches(ev, q));
  return events.sort(byDeadline);
}

function decorate(ev) {
  return { ...ev, needsRegistration: E.needsRegistration(ev) };
}

async function loadOwnedEvent(userId, id, withInclude = true) {
  const ev = await CashbackEvent.findOne({
    where: { id: V.idParam(id) || 0, userId },
    include: withInclude ? eventInclude() : undefined
  });
  if (!ev) throw V.httpError(404, 'NOT_FOUND', '找不到此回饋活動');
  return ev;
}

async function fullEvent(id) {
  const ev = await CashbackEvent.findByPk(id, { include: eventInclude() });
  const [out] = await svc.withUsage([ev]);
  return decorate(out);
}

// ─────────────────────────────────────────────────────────────
// Payload parsing
// ─────────────────────────────────────────────────────────────

function keywordsText(v) {
  const list = E.parseMerchantKeywords(v);
  return list.length ? list.join('\n').slice(0, 2000) : null;
}

/**
 * Parses a create/update body. With partial=true only the keys present in
 * the body are returned, so PUT can update a subset of fields.
 */
function parsePayload(body = {}, { partial = false } = {}) {
  const data = {};
  const set = (key, fn) => {
    if (!partial || V.has(body, key)) data[key] = fn(body[key]);
  };
  set('title', (v) => {
    const t = V.trimOrNull(v, 255);
    if (!t) throw V.httpError(400, 'TITLE_REQUIRED', '請輸入活動名稱');
    return t;
  });
  set('description', (v) => V.trimOrNull(v, 20000));
  set('note', (v) => V.trimOrNull(v, 5000));
  set('startDate', (v) => V.dateOnlyOrNull(v, 'startDate'));
  set('endDate', (v) => V.dateOnlyOrNull(v, 'endDate'));
  set('cashbackPercent', (v) => V.numberOrNull(v, 'cashbackPercent', { min: 0, max: 100 }));
  set('cashbackFixed', (v) => V.numberOrNull(v, 'cashbackFixed', { min: 0, max: 1e12 }));
  set('rewardType', (v) => (REWARD_TYPES.includes(v) ? v : 'cash'));
  set('maxReward', (v) => V.numberOrNull(v, 'maxReward', { min: 0, max: 1e12 }));
  set('minimumSpend', (v) => V.numberOrNull(v, 'minimumSpend', { min: 0, max: 1e12 }));
  set('minimumSpendScope', (v) => (v === 'cycleTotal' ? 'cycleTotal' : 'perTransaction'));
  set('sourceUrl', (v) => V.urlOrNull(v, 'sourceUrl'));
  set('cycleType', (v) => (CYCLE_TYPES.includes(v) ? v : 'none'));
  set('cycleAnchorDay', (v) => V.intOrNull(v, 'cycleAnchorDay', { min: 1, max: 31 }));
  set('matchUnspecifiedPayment', V.bool);
  set('requireMerchantMatch', V.bool);
  set('merchantKeywords', keywordsText);
  set('excludeMerchantMatch', V.bool);
  set('excludeMerchantKeywords', keywordsText);
  set('rewardRounding', (v) => (v === 'floor' ? 'floor' : 'round'));
  set('rewardCalcMode', (v) => (v === 'perTransaction' ? 'perTransaction' : 'aggregate'));
  set('rewardPrecision', (v) => {
    const n = V.intOrNull(v, 'rewardPrecision', { min: 0, max: 6 });
    return n == null ? 0 : n;
  });
  set('requiresRegistration', V.bool);
  set('registeredAt', (v) => V.dateOnlyOrNull(v, 'registeredAt'));

  return {
    data,
    cardIds: !partial || V.has(body, 'cardIds') ? V.parseIdArray(body.cardIds) : undefined,
    paymentMethodIds: !partial || V.has(body, 'paymentMethodIds') ? V.parseIdArray(body.paymentMethodIds) : undefined
  };
}

/** Cross-field checks on the final (merged) values. */
function validateEvent(ev) {
  if (ev.startDate && ev.endDate && ev.startDate > ev.endDate) {
    throw V.httpError(400, 'DATE_RANGE_INVALID', '結束日期不可早於開始日期');
  }
  if (ev.cycleType === 'none') ev.cycleAnchorDay = null;
  else if ((ev.cycleType === 'weekly' || ev.cycleType === 'biweekly') && ev.cycleAnchorDay != null && ev.cycleAnchorDay > 7) {
    throw V.httpError(400, 'INVALID_CYCLE_ANCHOR_DAY', '每週 / 雙週的重置日需為 1（週一）~ 7（週日）');
  }
  if (!ev.requiresRegistration) ev.registeredAt = null;
}

async function applyAssociations(ev, userId, cardIds, paymentMethodIds, t) {
  if (cardIds !== undefined) {
    const cards = cardIds.length ? await Card.findAll({ where: { id: cardIds, userId }, transaction: t }) : [];
    await ev.setCards(cards, { transaction: t });
  }
  if (paymentMethodIds !== undefined) {
    const pms = paymentMethodIds.length
      ? await PaymentMethod.findAll({ where: { id: paymentMethodIds, userId }, transaction: t })
      : [];
    await ev.setPaymentMethods(pms, { transaction: t });
  }
}

// ─────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────

// GET /api/cashback
exports.list = V.ah(async (req, res) => {
  const events = await findEvents(req.user.id, req.query);
  const out = await svc.withUsage(events);
  res.json(out.map(decorate));
});

// GET /api/cashback/:id
exports.get = V.ah(async (req, res) => {
  const ev = await loadOwnedEvent(req.user.id, req.params.id);
  res.json(await fullEvent(ev.id));
});

// POST /api/cashback
exports.create = V.ah(async (req, res) => {
  const { data, cardIds, paymentMethodIds } = parsePayload(req.body);
  validateEvent(data);
  const created = await sequelize.transaction(async (t) => {
    const ev = await CashbackEvent.create({ ...data, userId: req.user.id }, { transaction: t });
    await applyAssociations(ev, req.user.id, cardIds, paymentMethodIds, t);
    return ev;
  });
  res.status(201).json(await fullEvent(created.id));
});

// PUT /api/cashback/:id  (partial: omitted fields are left unchanged)
exports.update = V.ah(async (req, res) => {
  const ev = await loadOwnedEvent(req.user.id, req.params.id, false);
  const { data, cardIds, paymentMethodIds } = parsePayload(req.body, { partial: true });
  const merged = { ...ev.get({ plain: true }), ...data };
  validateEvent(merged);
  data.cycleAnchorDay = merged.cycleAnchorDay;
  data.registeredAt = merged.registeredAt;
  await sequelize.transaction(async (t) => {
    Object.assign(ev, data);
    await ev.save({ transaction: t });
    await applyAssociations(ev, req.user.id, cardIds, paymentMethodIds, t);
  });
  res.json(await fullEvent(ev.id));
});

// DELETE /api/cashback/:id
exports.remove = V.ah(async (req, res) => {
  const ev = await loadOwnedEvent(req.user.id, req.params.id, false);
  await sequelize.transaction(async (t) => {
    await RewardReceipt.destroy({ where: { eventId: ev.id, userId: req.user.id }, transaction: t });
    await ev.destroy({ transaction: t });
  });
  res.json({ ok: true });
});

// POST /api/cashback/:id/duplicate  body: { title?, startDate?, endDate? }
exports.duplicate = V.ah(async (req, res) => {
  const src = await loadOwnedEvent(req.user.id, req.params.id);
  const body = req.body || {};
  const plain = src.get({ plain: true });
  const copy = {};
  for (const k of Object.keys(CashbackEvent.rawAttributes)) {
    if (['id', 'createdAt', 'updatedAt'].includes(k)) continue;
    copy[k] = plain[k];
  }
  copy.title = V.trimOrNull(body.title, 255) || `${plain.title}（複製）`.slice(0, 255);
  if (V.has(body, 'startDate')) copy.startDate = V.dateOnlyOrNull(body.startDate, 'startDate');
  if (V.has(body, 'endDate')) copy.endDate = V.dateOnlyOrNull(body.endDate, 'endDate');
  copy.registeredAt = null;
  validateEvent(copy);
  const created = await sequelize.transaction(async (t) => {
    const ev = await CashbackEvent.create(copy, { transaction: t });
    await ev.setCards((src.cards || []).map((c) => c.id), { transaction: t });
    await ev.setPaymentMethods((src.paymentMethods || []).map((p) => p.id), { transaction: t });
    return ev;
  });
  res.status(201).json(await fullEvent(created.id));
});

// PUT /api/cashback/:id/registration  body: { registered: boolean, date?: 'YYYY-MM-DD' }
exports.setRegistration = V.ah(async (req, res) => {
  const ev = await loadOwnedEvent(req.user.id, req.params.id, false);
  const registered = V.bool((req.body || {}).registered);
  ev.requiresRegistration = true;
  ev.registeredAt = registered ? (V.dateOnlyOrNull((req.body || {}).date, 'date') || E.todayDateOnly()) : null;
  await ev.save();
  res.json(await fullEvent(ev.id));
});

// ─────────────────────────────────────────────────────────────
// 回饋核對 (reconciliation) + 入帳紀錄 (receipts)
// ─────────────────────────────────────────────────────────────

function receiptToPublic(r, ev) {
  const o = typeof r.toJSON === 'function' ? r.toJSON() : r;
  const expected = o.expectedAmount != null ? Number(o.expectedAmount) : null;
  const received = Number(o.receivedAmount);
  return {
    id: o.id,
    eventId: o.eventId,
    eventTitle: ev ? ev.title : (o.event ? o.event.title : null),
    periodStart: o.periodStart,
    periodEnd: o.periodEnd,
    expectedAmount: expected,
    receivedAmount: received,
    difference: expected != null ? Math.round((received - expected) * 100) / 100 : null,
    receivedDate: o.receivedDate,
    note: o.note,
    createdAt: o.createdAt
  };
}

function windowFromPeriod(periodStart, periodEnd) {
  return {
    start: periodStart ? E.parseDateOnly(periodStart) : null,
    end: periodEnd ? E.addDays(E.parseDateOnly(periodEnd), 1) : null
  };
}

// GET /api/cashback/rewards-audit?status&cardId&paymentMethodId&q&range=cycle|prevCycle|range&from&to
exports.rewardsAudit = V.ah(async (req, res) => {
  const events = await findEvents(req.user.id, { status: req.query.status || 'active', ...req.query });
  const range = ['range', 'prevCycle'].includes(req.query.range) ? req.query.range : 'cycle';
  const now = new Date();
  let from = null;
  let to = null;
  if (range === 'range') {
    from = V.dateTimeOrNull(req.query.from, 'from');
    to = V.dateTimeOrNull(req.query.to, 'to');
    if (from && to && from >= to) throw V.httpError(400, 'RANGE_INVALID', 'from 必須早於 to');
  }
  const windowFor = (ev) => {
    if (range === 'range') return { start: from, end: to };
    if (range === 'prevCycle') return E.previousCycleWindow(ev, now);
    return E.cycleWindowAt(ev, now);
  };
  // "This cycle" only makes sense for campaigns that have started.
  const withCards = events.filter((ev) => (ev.cards || []).length
    && !(range === 'cycle' && E.eventTiming(ev, now).phase === 'upcoming'));
  const computed = await svc.withUsage(withCards, { now, windowFor, includeTransactions: true });

  const receipts = computed.length ? await RewardReceipt.findAll({
    where: { userId: req.user.id, eventId: computed.map((e) => e.id) },
    order: [['receivedDate', 'DESC'], ['id', 'DESC']]
  }) : [];
  const out = computed.map((ev) => {
    const u = ev.usage;
    const ps = u.cycleStart ? E.formatDateOnly(u.cycleStart) : null;
    const pe = u.cycleEnd ? E.formatDateOnly(E.addDays(new Date(u.cycleEnd), -1)) : null;
    const mine = receipts.filter((r) => r.eventId === ev.id);
    // A receipt "belongs" to this window when its recorded period overlaps it.
    const inWindow = mine.filter((r) => (!pe || !r.periodStart || r.periodStart <= pe) && (!ps || !r.periodEnd || r.periodEnd >= ps));
    const received = inWindow.reduce((s, r) => s + Number(r.receivedAmount), 0);
    return decorate({
      ...ev,
      period: { start: ps, end: pe },
      receipts: inWindow.map((r) => receiptToPublic(r, ev)),
      reconciliation: {
        expected: u.estimatedReward,
        received: inWindow.length ? Math.round(received * 100) / 100 : null,
        difference: inWindow.length && u.estimatedReward != null ? Math.round((received - u.estimatedReward) * 100) / 100 : null
      }
    });
  });

  const totals = out.reduce((acc, ev) => {
    acc.expected += ev.usage.estimatedReward || 0;
    if (ev.reconciliation.received != null) acc.received += ev.reconciliation.received;
    acc.spend += ev.usage.usedAmount || 0;
    return acc;
  }, { expected: 0, received: 0, spend: 0 });

  res.json({
    range,
    from,
    to,
    totals: {
      expected: Math.round(totals.expected * 100) / 100,
      received: Math.round(totals.received * 100) / 100,
      spend: Math.round(totals.spend * 100) / 100
    },
    events: out
  });
});

// GET /api/cashback/receipts?eventId=&from=&to=
exports.listReceipts = V.ah(async (req, res) => {
  const where = { userId: req.user.id };
  const eventId = V.idParam(req.query.eventId);
  if (eventId) where.eventId = eventId;
  const from = V.dateOnlyOrNull(req.query.from, 'from');
  const to = V.dateOnlyOrNull(req.query.to, 'to');
  if (from || to) {
    where.receivedDate = {};
    if (from) where.receivedDate[Op.gte] = from;
    if (to) where.receivedDate[Op.lte] = to;
  }
  const rows = await RewardReceipt.findAll({
    where,
    include: [{ model: CashbackEvent, as: 'event', attributes: ['id', 'title'] }],
    order: [['receivedDate', 'DESC'], ['id', 'DESC']],
    limit: 500
  });
  const items = rows.map((r) => receiptToPublic(r));
  const sum = (k) => Math.round(items.reduce((s, x) => s + (x[k] || 0), 0) * 100) / 100;
  res.json({ items, totals: { received: sum('receivedAmount'), expected: sum('expectedAmount') } });
});

async function parseReceipt(body, ev, existing) {
  const b = body || {};
  const out = {};
  if (!existing || V.has(b, 'periodStart')) out.periodStart = V.dateOnlyOrNull(b.periodStart, 'periodStart');
  if (!existing || V.has(b, 'periodEnd')) out.periodEnd = V.dateOnlyOrNull(b.periodEnd, 'periodEnd');
  if (!existing || V.has(b, 'receivedAmount')) {
    const n = V.numberOrNull(b.receivedAmount, 'receivedAmount', { min: 0, max: 1e12 });
    if (n == null) throw V.httpError(400, 'RECEIVED_AMOUNT_REQUIRED', '請輸入實際入帳金額');
    out.receivedAmount = n;
  }
  if (!existing || V.has(b, 'receivedDate')) {
    out.receivedDate = V.dateOnlyOrNull(b.receivedDate, 'receivedDate') || E.todayDateOnly();
  }
  if (!existing || V.has(b, 'note')) out.note = V.trimOrNull(b.note, 500);

  const ps = V.has(out, 'periodStart') ? out.periodStart : existing && existing.periodStart;
  const pe = V.has(out, 'periodEnd') ? out.periodEnd : existing && existing.periodEnd;
  if (ps && pe && ps > pe) throw V.httpError(400, 'DATE_RANGE_INVALID', '期間迄日不可早於起日');

  if (V.has(b, 'expectedAmount')) {
    out.expectedAmount = V.numberOrNull(b.expectedAmount, 'expectedAmount', { min: 0, max: 1e12 });
  } else if (!existing || V.has(out, 'periodStart') || V.has(out, 'periodEnd')) {
    // Snapshot what the app calculates for that period right now.
    const [calc] = await svc.withUsage([ev], { windowFor: () => windowFromPeriod(ps, pe) });
    out.expectedAmount = calc && calc.usage ? calc.usage.estimatedReward : null;
  }
  return out;
}

// POST /api/cashback/:id/receipts
exports.createReceipt = V.ah(async (req, res) => {
  const ev = await loadOwnedEvent(req.user.id, req.params.id);
  const data = await parseReceipt(req.body, ev.toJSON(), null);
  const row = await RewardReceipt.create({ ...data, userId: req.user.id, eventId: ev.id });
  res.status(201).json(receiptToPublic(row, ev));
});

// PUT /api/cashback/:id/receipts/:rid
exports.updateReceipt = V.ah(async (req, res) => {
  const ev = await loadOwnedEvent(req.user.id, req.params.id);
  const row = await RewardReceipt.findOne({ where: { id: V.idParam(req.params.rid) || 0, eventId: ev.id, userId: req.user.id } });
  if (!row) throw V.httpError(404, 'RECEIPT_NOT_FOUND', '找不到此入帳紀錄');
  Object.assign(row, await parseReceipt(req.body, ev.toJSON(), row));
  await row.save();
  res.json(receiptToPublic(row, ev));
});

// DELETE /api/cashback/:id/receipts/:rid
exports.removeReceipt = V.ah(async (req, res) => {
  const ev = await loadOwnedEvent(req.user.id, req.params.id, false);
  const row = await RewardReceipt.findOne({ where: { id: V.idParam(req.params.rid) || 0, eventId: ev.id, userId: req.user.id } });
  if (!row) throw V.httpError(404, 'RECEIPT_NOT_FOUND', '找不到此入帳紀錄');
  await row.destroy();
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// 刷哪張 — deterministic best-card recommendation
// ─────────────────────────────────────────────────────────────

async function recommendFor(userId, query) {
  const amount = V.numberOrNull(query.amount, 'amount', { min: 0.01, max: 1e10 });
  if (amount == null) throw V.httpError(400, 'AMOUNT_REQUIRED', '請輸入消費金額 amount');
  const at = V.dateTimeOrNull(query.at, 'at') || new Date();
  const merchant = V.trimOrNull(query.merchant, 120) || '';
  const rows = await CashbackEvent.findAll({
    where: { userId, ...statusWhere('ongoing', E.formatDateOnly(at)) },
    include: eventInclude()
  });
  const events = rows.map((r) => r.toJSON());
  const txns = await svc.loadCurrentCycleTransactions(userId, events, at);
  let paymentMethodId;
  if (V.has(query, 'paymentMethodId') && query.paymentMethodId !== '') {
    paymentMethodId = query.paymentMethodId === 'none' ? null : V.idParam(query.paymentMethodId);
  }
  return E.recommend({
    events,
    txns,
    amount,
    merchant,
    at,
    cardId: V.idParam(query.cardId),
    paymentMethodId,
    limit: Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10))
  });
}

// GET /api/cashback/recommend?amount=&merchant=&cardId=&paymentMethodId=&at=&limit=
exports.recommend = V.ah(async (req, res) => {
  res.json(await recommendFor(req.user.id, req.query));
});

exports.findEvents = findEvents;
exports.recommendFor = recommendFor;
exports.eventInclude = eventInclude;
exports.statusWhere = statusWhere;
exports.decorate = decorate;
