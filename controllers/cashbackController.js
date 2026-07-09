'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  CashbackEvent,
  Card,
  PaymentMethod
} = require('../models');
const { computeEventUsage, computeEventUsageInWindow, getCurrentCycleWindow } = require('../services/cashbackCycleService');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseIdArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => parseInt(x, 10)).filter(Number.isFinite);
  if (typeof v === 'string') {
    return v.split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
  }
  return [];
}

function eventInclude() {
  return [
    { model: Card, as: 'cards', through: { attributes: [] } },
    { model: PaymentMethod, as: 'paymentMethods', through: { attributes: [] } }
  ];
}

// GET /api/cashback?status=active|expired|all&q=&cardId=&paymentMethodId=
exports.list = async (req, res, next) => {
  try {
    const status = req.query.status || 'active';
    const q = (req.query.q || '').trim();
    const cardId = req.query.cardId ? parseInt(req.query.cardId, 10) : null;
    const paymentMethodId = req.query.paymentMethodId
      ? parseInt(req.query.paymentMethodId, 10)
      : null;

    const where = { userId: req.user.id };
    const today = todayStr();

    if (status === 'active') {
      where[Op.and] = [
        { [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: today } }] }
      ];
    } else if (status === 'expired') {
      where.endDate = { [Op.lt]: today };
    }

    if (q) {
      where[Op.and] = (where[Op.and] || []).concat([{
        [Op.or]: [
          { title: { [Op.like]: `%${q}%` } },
          { description: { [Op.like]: `%${q}%` } },
          { note: { [Op.like]: `%${q}%` } }
        ]
      }]);
    }

    const includes = eventInclude();

    // Filter by card / payment method via where on the include
    if (cardId) {
      includes[0].where = { id: cardId };
      includes[0].required = true;
    }
    if (paymentMethodId) {
      includes[1].where = { id: paymentMethodId };
      includes[1].required = true;
    }

    // If user passed a free-text q AND we want it to match card/paymentMethod names too,
    // do a second query and merge.
    let events = await CashbackEvent.findAll({
      where,
      include: includes,
      order: [['endDate', 'ASC'], ['startDate', 'ASC'], ['id', 'DESC']]
    });

    if (q && !cardId && !paymentMethodId) {
      const tagged = await CashbackEvent.findAll({
        where: { userId: req.user.id },
        include: [
          {
            model: Card,
            as: 'cards',
            through: { attributes: [] },
            where: { name: { [Op.like]: `%${q}%` } },
            required: false
          },
          {
            model: PaymentMethod,
            as: 'paymentMethods',
            through: { attributes: [] },
            where: { name: { [Op.like]: `%${q}%` } },
            required: false
          }
        ]
      });
      const byId = new Map(events.map((e) => [e.id, e]));
      for (const t of tagged) {
        const matches = (t.cards && t.cards.length) || (t.paymentMethods && t.paymentMethods.length);
        if (!matches) continue;
        if (status === 'active' && t.endDate && t.endDate < today) continue;
        if (status === 'expired' && (!t.endDate || t.endDate >= today)) continue;
        if (!byId.has(t.id)) byId.set(t.id, t);
      }
      events = Array.from(byId.values());
    }

    res.json(await withUsage(events));
  } catch (err) { next(err); }
};

// Attaches actual current-cycle spend (from CardTransaction records) onto
// each event as `usage`, so the UI can show real "已刷多少 / 還剩多少" instead
// of the purely theoretical max-useful-spend estimate.
async function withUsage(events) {
  const list = Array.isArray(events) ? events : [events];
  const withData = await Promise.all(list.map(async (ev) => {
    const json = ev.toJSON();
    json.usage = await computeEventUsage(ev);
    return json;
  }));
  return Array.isArray(events) ? withData : withData[0];
}

// GET /api/cashback/rewards-audit?status=active|expired|all&cardId=&paymentMethodId=&q=
//   &range=cycle(預設)|range&from=&to=
//
// Dedicated reconciliation view: for each matching event, how much reward
// *should* have accrued over either its own current cycle, or an arbitrary
// caller-chosen [from, to) window — always including the underlying
// transaction list, so the user can check a card issuer's actual credited
// amount against this app's own calculation.
exports.rewardsAudit = async (req, res, next) => {
  try {
    const status = req.query.status || 'active';
    const q = (req.query.q || '').trim();
    const cardId = req.query.cardId ? parseInt(req.query.cardId, 10) : null;
    const paymentMethodId = req.query.paymentMethodId ? parseInt(req.query.paymentMethodId, 10) : null;
    const today = todayStr();

    const where = { userId: req.user.id };
    if (status === 'active') {
      where[Op.and] = [{ [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: today } }] }];
    } else if (status === 'expired') {
      where.endDate = { [Op.lt]: today };
    }
    if (q) {
      where[Op.and] = (where[Op.and] || []).concat([{
        [Op.or]: [{ title: { [Op.like]: `%${q}%` } }, { description: { [Op.like]: `%${q}%` } }]
      }]);
    }

    const includes = eventInclude();
    if (cardId) { includes[0].where = { id: cardId }; includes[0].required = true; }
    if (paymentMethodId) { includes[1].where = { id: paymentMethodId }; includes[1].required = true; }

    const events = await CashbackEvent.findAll({
      where,
      include: includes,
      order: [['title', 'ASC']]
    });

    const useCustomRange = req.query.range === 'range';
    let rangeStart = null;
    let rangeEnd = null;
    if (useCustomRange) {
      if (req.query.from) rangeStart = new Date(req.query.from);
      if (req.query.to) rangeEnd = new Date(req.query.to);
      if ((rangeStart && Number.isNaN(rangeStart.getTime())) || (rangeEnd && Number.isNaN(rangeEnd.getTime()))) {
        return res.status(400).json({ error: 'RANGE_INVALID' });
      }
    }

    const results = [];
    for (const ev of events) {
      const window = useCustomRange ? { start: rangeStart, end: rangeEnd } : getCurrentCycleWindow(ev, new Date());
      const usage = await computeEventUsageInWindow(ev, window);
      if (!usage) continue; // no linked cards, nothing to compute
      const json = ev.toJSON();
      json.usage = usage;
      results.push(json);
    }

    res.json({
      range: useCustomRange ? 'range' : 'cycle',
      from: rangeStart,
      to: rangeEnd,
      events: results
    });
  } catch (err) { next(err); }
};

// GET /api/cashback/:id
exports.get = async (req, res, next) => {
  try {
    const ev = await CashbackEvent.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: eventInclude()
    });
    if (!ev) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(await withUsage(ev));
  } catch (err) { next(err); }
};

function parsePayload(body) {
  const {
    title,
    description,
    startDate,
    endDate,
    cashbackPercent,
    cashbackFixed,
    rewardType,
    maxReward,
    minimumSpend,
    sourceUrl,
    cycleType,
    cycleAnchorDay,
    note,
    cardIds,
    paymentMethodIds
  } = body;

  const validCycleTypes = ['none', 'weekly', 'biweekly', 'monthly'];

  const data = {
    title: (title || '').trim(),
    description: description || null,
    startDate: startDate || null,
    endDate: endDate || null,
    cashbackPercent: cashbackPercent === '' || cashbackPercent === null || cashbackPercent === undefined
      ? null
      : Number(cashbackPercent),
    cashbackFixed: cashbackFixed === '' || cashbackFixed === null || cashbackFixed === undefined
      ? null
      : Number(cashbackFixed),
    rewardType: ['point', 'cash', 'coupon', 'other'].includes(rewardType) ? rewardType : 'cash',
    maxReward: maxReward === '' || maxReward === null || maxReward === undefined
      ? null
      : Number(maxReward),
    minimumSpend: minimumSpend === '' || minimumSpend === null || minimumSpend === undefined
      ? null
      : Number(minimumSpend),
    sourceUrl: sourceUrl || null,
    cycleType: validCycleTypes.includes(cycleType) ? cycleType : 'none',
    cycleAnchorDay: cycleAnchorDay === '' || cycleAnchorDay === null || cycleAnchorDay === undefined
      ? null
      : parseInt(cycleAnchorDay, 10) || null,
    matchUnspecifiedPayment: !!body.matchUnspecifiedPayment,
    requireMerchantMatch: !!body.requireMerchantMatch,
    merchantKeywords: body.merchantKeywords ? String(body.merchantKeywords).trim().slice(0, 2000) || null : null,
    rewardRounding: body.rewardRounding === 'floor' ? 'floor' : 'round',
    rewardCalcMode: body.rewardCalcMode === 'perTransaction' ? 'perTransaction' : 'aggregate',
    note: note || null
  };

  return {
    data,
    cardIds: parseIdArray(cardIds),
    paymentMethodIds: parseIdArray(paymentMethodIds)
  };
}

// POST /api/cashback
exports.create = async (req, res, next) => {
  try {
    const { data, cardIds, paymentMethodIds } = parsePayload(req.body);
    if (!data.title) return res.status(400).json({ error: 'TITLE_REQUIRED' });

    const ev = await sequelize.transaction(async (t) => {
      const created = await CashbackEvent.create(
        { ...data, userId: req.user.id },
        { transaction: t }
      );

      if (cardIds.length) {
        const cards = await Card.findAll({
          where: { id: cardIds, userId: req.user.id },
          transaction: t
        });
        await created.setCards(cards, { transaction: t });
      }
      if (paymentMethodIds.length) {
        const pms = await PaymentMethod.findAll({
          where: { id: paymentMethodIds, userId: req.user.id },
          transaction: t
        });
        await created.setPaymentMethods(pms, { transaction: t });
      }

      return created;
    });

    const full = await CashbackEvent.findByPk(ev.id, { include: eventInclude() });
    res.status(201).json(await withUsage(full));
  } catch (err) { next(err); }
};

// PUT /api/cashback/:id
exports.update = async (req, res, next) => {
  try {
    const ev = await CashbackEvent.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!ev) return res.status(404).json({ error: 'NOT_FOUND' });

    const { data, cardIds, paymentMethodIds } = parsePayload(req.body);
    if (!data.title) return res.status(400).json({ error: 'TITLE_REQUIRED' });

    await sequelize.transaction(async (t) => {
      Object.assign(ev, data);
      await ev.save({ transaction: t });

      if (req.body.cardIds !== undefined) {
        const cards = cardIds.length
          ? await Card.findAll({
            where: { id: cardIds, userId: req.user.id }, transaction: t
          })
          : [];
        await ev.setCards(cards, { transaction: t });
      }
      if (req.body.paymentMethodIds !== undefined) {
        const pms = paymentMethodIds.length
          ? await PaymentMethod.findAll({
            where: { id: paymentMethodIds, userId: req.user.id }, transaction: t
          })
          : [];
        await ev.setPaymentMethods(pms, { transaction: t });
      }
    });

    const full = await CashbackEvent.findByPk(ev.id, { include: eventInclude() });
    res.json(await withUsage(full));
  } catch (err) { next(err); }
};

// DELETE /api/cashback/:id
exports.remove = async (req, res, next) => {
  try {
    const ev = await CashbackEvent.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!ev) return res.status(404).json({ error: 'NOT_FOUND' });
    await ev.destroy();
    res.json({ ok: true });
  } catch (err) { next(err); }
};
