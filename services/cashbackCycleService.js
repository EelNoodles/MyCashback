'use strict';

const { Op } = require('sequelize');
const { CardTransaction } = require('../models');

/**
 * Mirrors public/js/cashback.js:getNextResetDate() so the server-computed
 * usage window lines up with the countdown shown in the UI.
 */
function getNextResetDate(today, cycleType, anchorDay) {
  const d = new Date(today);
  if (cycleType === 'monthly') {
    const anchor = Math.min(anchorDay || 1, 28);
    let nextReset = new Date(d.getFullYear(), d.getMonth(), anchor);
    if (nextReset <= d) {
      nextReset = new Date(d.getFullYear(), d.getMonth() + 1, anchor);
    }
    return nextReset;
  }
  if (cycleType === 'weekly' || cycleType === 'biweekly') {
    const anchor = anchorDay || 1; // 1=Mon
    const currentDay = d.getDay() || 7; // Sunday=7
    let daysUntil = anchor - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    if (cycleType === 'biweekly' && daysUntil <= 7) daysUntil += 7; // rough approx, matches frontend
    const next = new Date(d);
    next.setDate(next.getDate() + daysUntil);
    return next;
  }
  return null;
}

function endOfDay(dateOnly) {
  const d = new Date(dateOnly);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Returns the [start, end) window that "the current cycle" covers for this
 * event, clamped to the event's own startDate/endDate. `end` is exclusive.
 * cycleType 'none' means the whole event period counts as a single cycle.
 */
function getCurrentCycleWindow(event, now = new Date()) {
  const eventStart = event.startDate ? new Date(`${event.startDate}T00:00:00`) : null;
  const eventEnd = event.endDate ? endOfDay(`${event.endDate}T00:00:00`) : null;

  if (!event.cycleType || event.cycleType === 'none') {
    return { start: eventStart, end: eventEnd };
  }

  const nextReset = getNextResetDate(now, event.cycleType, event.cycleAnchorDay);
  if (!nextReset) return { start: eventStart, end: eventEnd };

  let start;
  if (event.cycleType === 'monthly') {
    start = new Date(nextReset.getFullYear(), nextReset.getMonth() - 1, nextReset.getDate());
  } else {
    const days = event.cycleType === 'weekly' ? 7 : 14;
    start = new Date(nextReset.getTime() - days * 86400000);
  }

  if (eventStart && start < eventStart) start = eventStart;
  const end = eventEnd && nextReset > eventEnd ? eventEnd : nextReset;

  return { start, end };
}

/**
 * Builds the Sequelize where-clause for transactions counted towards `event`,
 * per the matching rules, checked in this order of precedence:
 *  - minimumSpend, when set, is the core gate: a transaction below it never
 *    counts towards this event at all, regardless of payment method/merchant
 *  - card must be one of event.cards
 *  - if event.paymentMethods is empty: only txns with no e-payment count
 *  - if non-empty: only txns whose paymentMethodId is in that set count,
 *    UNLESS matchUnspecifiedPayment is set, in which case no-e-payment txns
 *    are *also* counted alongside the selected set.
 */
function buildMatchWhere(event, window) {
  const cardIds = (event.cards || []).map((c) => c.id);
  if (!cardIds.length) return null;

  const pmIds = (event.paymentMethods || []).map((p) => p.id);
  const paymentWhere = pmIds.length === 0
    ? { paymentMethodId: null }
    : (event.matchUnspecifiedPayment
      ? { [Op.or]: [{ paymentMethodId: null }, { paymentMethodId: { [Op.in]: pmIds } }] }
      : { paymentMethodId: { [Op.in]: pmIds } });

  const where = {
    userId: event.userId,
    cardId: { [Op.in]: cardIds },
    ...paymentWhere
  };
  const minSpend = event.minimumSpend != null ? Number(event.minimumSpend) : null;
  if (minSpend != null && minSpend > 0) {
    where.amount = { [Op.gte]: minSpend };
  }
  if (window.start || window.end) {
    where.transactionAt = {};
    if (window.start) where.transactionAt[Op.gte] = window.start;
    if (window.end) where.transactionAt[Op.lt] = window.end;
  }
  return where;
}

/**
 * Same payment-method matching rule as buildMatchWhere(), applied in JS to a
 * single already-loaded transaction instead of a SQL where-clause.
 */
function paymentMatches(event, paymentMethodId) {
  const pmIds = (event.paymentMethods || []).map((p) => p.id);
  if (pmIds.length === 0) return paymentMethodId == null;
  if (paymentMethodId == null) return !!event.matchUnspecifiedPayment;
  return pmIds.includes(paymentMethodId);
}

/**
 * Whether `txn` (a { cardId, paymentMethodId, transactionAt, amount }-shaped
 * record) counts towards `event` at all — i.e. it clears the minimumSpend
 * gate (checked first: below it, nothing else matters), the card + payment
 * method rule matches, the transaction date falls within the event's
 * overall active period, and (if configured) a merchant keyword matches.
 * This ignores the current-cycle window used by computeEventUsage() since
 * it's meant to label a single transaction ("which campaigns does this
 * count towards"), including ones from past cycles.
 */
function eventMatchesTransaction(event, txn) {
  // 「排除商家」優先於所有其他條件（含最低門檻）：一旦交易命中排除清單，
  // 就完全不符合此活動。
  if (matchExcludeMerchantKeyword(event, txn).matched) return false;

  const minSpend = event.minimumSpend != null ? Number(event.minimumSpend) : null;
  if (minSpend != null && minSpend > 0 && Number(txn.amount) < minSpend) return false;

  const cardIds = (event.cards || []).map((c) => c.id);
  if (!cardIds.includes(txn.cardId)) return false;
  if (!paymentMatches(event, txn.paymentMethodId)) return false;

  const txnAt = new Date(txn.transactionAt);
  if (event.startDate && txnAt < new Date(`${event.startDate}T00:00:00`)) return false;
  if (event.endDate && txnAt > endOfDay(`${event.endDate}T00:00:00`)) return false;
  if (event.requireMerchantMatch && !matchMerchantKeyword(event, txn).matched) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// "商家限定" (merchant match): some campaigns only give cashback at specific
// merchants. When enabled on an event, a transaction only counts if one of
// the event's configured keywords appears — case/whitespace-insensitively —
// somewhere in the transaction's note / card name / payment method name
// (whichever the bookkeeping system happened to put the merchant name in).
// ─────────────────────────────────────────────────────────────

function normalizeForMatch(s) {
  return String(s || '').toUpperCase().replace(/[\s　]+/g, '');
}

function parseMerchantKeywords(raw) {
  return String(raw || '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Accepts either the toPublicTxn() shape ({ card: { name }, paymentMethod: { name }, note })
// or a raw CardTransaction row ({ rawCardName, rawPaymentMethodName, note }).
function transactionHaystack(txn) {
  const parts = [
    txn.note,
    txn.rawCardName,
    txn.rawPaymentMethodName,
    txn.card && txn.card.name,
    txn.paymentMethod && txn.paymentMethod.name
  ].filter(Boolean);
  return normalizeForMatch(parts.join(' '));
}

// First configured keyword (original casing, as the user typed it) found —
// case/whitespace-insensitively — within the transaction's text fields, or
// null when none of them appear.
function firstKeywordInTransaction(rawKeywords, txn) {
  const keywords = parseMerchantKeywords(rawKeywords);
  if (!keywords.length) return null;
  const haystack = transactionHaystack(txn);
  for (const kw of keywords) {
    const normKw = normalizeForMatch(kw);
    if (normKw && haystack.includes(normKw)) return kw;
  }
  return null;
}

/**
 * Returns { matched, keyword } — `keyword` is the first configured keyword
 * (original casing, as the user typed it) found within the transaction's
 * text fields, or null. When the event doesn't require a merchant match at
 * all, this always reports matched: true / keyword: null.
 */
function matchMerchantKeyword(event, txn) {
  if (!event.requireMerchantMatch) return { matched: true, keyword: null };
  const keyword = firstKeywordInTransaction(event.merchantKeywords, txn);
  return { matched: !!keyword, keyword };
}

// ─────────────────────────────────────────────────────────────
// "排除商家" (merchant exclusion): most campaigns exclude non-general
// spending (e.g. 全聯/超商/繳費). When enabled, a transaction whose merchant
// text hits one of the exclusion keywords is dropped from the campaign
// entirely — this gate takes precedence over minimumSpend and every other
// rule. Returns { matched, keyword }, where matched:true means the
// transaction IS excluded. When exclusion is off (or no keywords set), this
// always reports matched:false so nothing is excluded.
// ─────────────────────────────────────────────────────────────
function matchExcludeMerchantKeyword(event, txn) {
  if (!event.excludeMerchantMatch) return { matched: false, keyword: null };
  const keyword = firstKeywordInTransaction(event.excludeMerchantKeywords, txn);
  return { matched: !!keyword, keyword };
}

// Rounds (or floors) a reward amount per the event's rewardRounding setting
// ('round' is the default when unset) at rewardPrecision decimal places
// ('rewardPrecision' defaults to 0 = whole currency unit/point, matching the
// DB column defaults). Most campaigns round to the nearest whole unit, but
// some compute to 2 decimal places (e.g. cents) before rounding/flooring.
function roundReward(event, value) {
  const precision = Number(event.rewardPrecision) || 0;
  const factor = 10 ** precision;
  const scaled = value * factor;
  const rounded = event.rewardRounding === 'floor' ? Math.floor(scaled) : Math.round(scaled);
  return rounded / factor;
}

/**
 * Core reward calculation for `event` over an arbitrary [window.start,
 * window.end) — honours rewardRounding and rewardCalcMode, and (opts.
 * includeTransactions) can attach the full list of matching transactions
 * regardless of reward type/calc mode, for an audit/verification view.
 * Returns null when the event has no linked cards (nothing to match against).
 */
async function computeUsageForWindow(event, window, opts = {}) {
  const where = buildMatchWhere(event, window);
  if (!where) return null;

  // Always pull the actual matching rows rather than a SQL aggregate: needed
  // both for merchant-keyword filtering (not expressible as one SQL
  // condition) and for a per-transaction reward breakdown when
  // rewardCalcMode is 'perTransaction'.
  const rows = await CardTransaction.findAll({
    where,
    attributes: ['id', 'amount', 'transactionAt', 'note', 'rawCardName', 'rawPaymentMethodName'],
    order: [['transactionAt', 'ASC']],
    raw: true
  });
  // 「排除商家」優先：先剔除命中排除清單的交易（含未達門檻以外的判斷），
  // 再套用「商家限定」的必須符合條件。
  let matched = rows;
  if (event.excludeMerchantMatch) {
    matched = matched.filter((r) => !matchExcludeMerchantKeyword(event, r).matched);
  }
  if (event.requireMerchantMatch) {
    matched = matched.filter((r) => matchMerchantKeyword(event, r).matched);
  }

  const usedAmount = matched.reduce((sum, r) => sum + Number(r.amount), 0);
  const txnCount = matched.length;

  const cap = event.maxReward != null ? Number(event.maxReward) : null;
  const pct = event.cashbackPercent != null ? Number(event.cashbackPercent) : null;
  const fixed = event.cashbackFixed != null ? Number(event.cashbackFixed) : null;

  let estimatedReward = null;
  let capReached = null;
  let remainingCapAmount = null; // percent-based: more spend before hitting the cap
  let remainingCapTransactions = null; // fixed-based: more qualifying txns before hitting the cap
  let qualifyingCount = null;
  let txnRewards = null; // per-transaction breakdown; only populated for percent + perTransaction

  if (pct && pct > 0) {
    if (event.rewardCalcMode === 'perTransaction') {
      txnRewards = matched.map((r) => ({
        transactionId: r.id,
        transactionAt: r.transactionAt,
        amount: Number(r.amount),
        note: r.note,
        reward: roundReward(event, Number(r.amount) * pct / 100)
      }));
      estimatedReward = txnRewards.reduce((sum, t) => sum + t.reward, 0);
    } else {
      estimatedReward = roundReward(event, usedAmount * pct / 100);
    }
    if (cap != null) {
      capReached = estimatedReward >= cap;
      remainingCapAmount = Math.max(0, Math.ceil((cap * 100 / pct - usedAmount) * 100) / 100);
      estimatedReward = Math.min(estimatedReward, cap);
    }
  } else if (fixed && fixed > 0) {
    // minimumSpend is already enforced by buildMatchWhere(), so every row in
    // `matched` already clears it — each one earns the flat reward.
    qualifyingCount = matched.length;
    estimatedReward = qualifyingCount * fixed;
    if (cap != null) {
      capReached = estimatedReward >= cap;
      remainingCapTransactions = Math.max(0, Math.floor((cap - estimatedReward) / fixed));
      estimatedReward = Math.min(estimatedReward, cap);
    }
  }

  const result = {
    cycleStart: window.start,
    cycleEnd: window.end,
    usedAmount,
    txnCount,
    qualifyingCount,
    estimatedReward,
    cap,
    capReached,
    remainingCapAmount,
    remainingCapTransactions,
    rewardRounding: event.rewardRounding || 'round',
    rewardCalcMode: event.rewardCalcMode || 'aggregate',
    rewardPrecision: Number(event.rewardPrecision) || 0,
    txnRewards
  };
  if (opts.includeTransactions) {
    result.transactions = matched.map((r) => ({
      id: r.id,
      transactionAt: r.transactionAt,
      amount: Number(r.amount),
      note: r.note
    }));
  }
  return result;
}

/**
 * Computes actual accumulated spend for the event's *current cycle* and the
 * cashback that should have accrued from it. Used by the cashback list and
 * external API — kept lean (no full transaction list) since those are
 * fetched frequently.
 */
async function computeEventUsage(event, now = new Date()) {
  const window = getCurrentCycleWindow(event, now);
  return computeUsageForWindow(event, window);
}

/**
 * Same calculation, but over an explicit { start, end } window instead of
 * the event's own current cycle, and always including the matching
 * transaction list — for the reward-audit view where the user picks their
 * own comparison period (a past month, a custom range, etc).
 */
async function computeEventUsageInWindow(event, window) {
  return computeUsageForWindow(event, window, { includeTransactions: true });
}

module.exports = {
  getNextResetDate,
  getCurrentCycleWindow,
  buildMatchWhere,
  eventMatchesTransaction,
  matchMerchantKeyword,
  matchExcludeMerchantKeyword,
  parseMerchantKeywords,
  computeEventUsage,
  computeEventUsageInWindow
};
