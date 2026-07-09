'use strict';

const { Op } = require('sequelize');
const { Card, CashbackEvent, PaymentMethod } = require('../models');
const { computeEventUsage, parseMerchantKeywords } = require('../services/cashbackCycleService');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Builds an absolute URL from the app's own request (works regardless of
// domain/BASE_URL) so an external tool can fetch the image directly without
// knowing anything about how this app is hosted.
function absoluteUrl(req, relPath) {
  if (!relPath) return null;
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}${baseUrl}${relPath}`;
}

function eventToPublic(ev, usage) {
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
    startDate: ev.startDate,
    endDate: ev.endDate,
    cycleType: ev.cycleType,
    cycleAnchorDay: ev.cycleAnchorDay,
    matchUnspecifiedPayment: ev.matchUnspecifiedPayment,
    requireMerchantMatch: ev.requireMerchantMatch,
    merchantKeywords: ev.requireMerchantMatch ? parseMerchantKeywords(ev.merchantKeywords) : [],
    rewardRounding: ev.rewardRounding,
    rewardCalcMode: ev.rewardCalcMode,
    rewardPrecision: ev.rewardPrecision,
    paymentMethods: (ev.paymentMethods || []).map((p) => ({ id: p.id, name: p.name })),
    sourceUrl: ev.sourceUrl,
    usage
  };
}

// GET /api/external/cards?status=active|expired|all
// For each of the caller's cards: a renderable image URL, plus every
// cashback event tied to that card with its full conditions and current
// remaining-quota usage — meant for another tool of the user's own to pull
// and reorganise, not for browsing in this app's own UI.
exports.listCardsSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const status = ['active', 'expired', 'all'].includes(req.query.status) ? req.query.status : 'active';
    const today = todayStr();

    const cards = await Card.findAll({
      where: { userId },
      order: [['kind', 'ASC'], ['name', 'ASC']]
    });

    const eventWhere = { userId };
    if (status === 'active') {
      eventWhere[Op.and] = [{ [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: today } }] }];
    } else if (status === 'expired') {
      eventWhere.endDate = { [Op.lt]: today };
    }

    const events = await CashbackEvent.findAll({
      where: eventWhere,
      include: [
        { model: Card, as: 'cards', through: { attributes: [] }, attributes: ['id'] },
        { model: PaymentMethod, as: 'paymentMethods', through: { attributes: [] }, attributes: ['id', 'name'] }
      ],
      order: [['endDate', 'ASC'], ['startDate', 'ASC'], ['id', 'DESC']]
    });

    const cardsOut = [];
    for (const card of cards) {
      const cardEvents = events.filter((ev) => (ev.cards || []).some((c) => c.id === card.id));
      const eventsOut = [];
      for (const ev of cardEvents) {
        const usage = await computeEventUsage(ev);
        eventsOut.push(eventToPublic(ev, usage));
      }
      cardsOut.push({
        id: card.id,
        name: card.name,
        kind: card.kind,
        issuer: card.issuer,
        network: card.network,
        color: card.color,
        imageUrl: absoluteUrl(req, card.imageUrl),
        events: eventsOut
      });
    }

    res.json({ generatedAt: new Date().toISOString(), cards: cardsOut });
  } catch (err) { next(err); }
};
