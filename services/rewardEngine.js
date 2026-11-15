'use strict';

/**
 * rewardEngine — the pure (no database, no I/O) calculation core for
 * cashback campaigns. Everything that decides "does this transaction count",
 * "which cycle are we in" and "how much reward is that" lives here so the
 * server, the external API and the tests all share one implementation.
 *
 * Conventions
 *  - Dates use the process's local time zone, which config/timezone.js pins
 *    to APP_TIMEZONE (default Asia/Taipei). A DATEONLY value "2026-03-01"
 *    means local midnight of that day.
 *  - Cycle / event windows are half-open: [start, end).
 *  - Money is computed exactly with BigInt: amounts in cents, percentages in
 *    thousandths of a percent (the DB stores DECIMAL(6,3)), rewards in
 *    micro-units (1e-6) internally. Floating point never touches rounding,
 *    so 1005 × 0.1% = 1.005 rounds to 1.01 at two decimals (float math gave 1.00).
 */

const DAY_MS = 86400000;
const MICRO_PER_CENT = 10000n; // 1 cent = 10_000 micro-units
const PCT_DEN = 10000000n; // cents(100) × percent(100) × milli(1000)

// ─────────────────────────────────────────────────────────────
// Date helpers (local time)
// ─────────────────────────────────────────────────────────────

function startOfDay(d) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Calendar days from a to b (b - a), ignoring time-of-day and DST. */
function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

/** 'YYYY-MM-DD' (or Date) → local-midnight Date, or null. */
function parseDateOnly(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : startOfDay(v);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v).trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local Date → 'YYYY-MM-DD'. */
function formatDateOnly(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function todayDateOnly(now = new Date()) {
  return formatDateOnly(now);
}

function toDate(v) {
  if (v instanceof Date) return v;
  return new Date(v);
}

function isoWeekday(d) {
  return d.getDay() || 7; // Mon=1 … Sun=7
}

/** The anchor day-of-month in (year, month), clamped to that month's last day. */
function monthAnchorDate(year, month, anchorDay) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(1, anchorDay), lastDay));
}

// ─────────────────────────────────────────────────────────────
// Event period & cycles
// ─────────────────────────────────────────────────────────────

const CYCLE_TYPES = ['none', 'weekly', 'biweekly', 'monthly'];

function cycleTypeOf(event) {
  return CYCLE_TYPES.includes(event.cycleType) ? event.cycleType : 'none';
}

function anchorOf(event) {
  const type = cycleTypeOf(event);
  const n = parseInt(event.cycleAnchorDay, 10);
  if (type === 'monthly') return Number.isFinite(n) && n >= 1 ? Math.min(n, 31) : 1;
  if (type === 'weekly' || type === 'biweekly') {
    if (!Number.isFinite(n) || n < 1) return 1;
    return ((n - 1) % 7) + 1;
  }
  return null;
}

/** { start, end } of the whole campaign; end is exclusive (day after endDate). */
function eventBounds(event) {
  const start = parseDateOnly(event.startDate);
  const endDay = parseDateOnly(event.endDate);
  return { start, end: endDay ? addDays(endDay, 1) : null, endDay };
}

/**
 * The un-clamped cycle containing `date`:
 *  - monthly  : from the anchor day of the month (31 → last day of short months)
 *  - weekly   : 7-day blocks starting on the anchor weekday
 *  - biweekly : 14-day blocks starting on the anchor weekday, aligned to the
 *               campaign start (first anchor weekday on/before startDate) so
 *               the two-week rhythm is stable; without a start date the
 *               blocks align to 2024-01-01.
 * Returns null for cycleType 'none'.
 */
function rawCycleContaining(event, date) {
  const type = cycleTypeOf(event);
  const day = startOfDay(date);
  const anchor = anchorOf(event);

  if (type === 'monthly') {
    let start = monthAnchorDate(day.getFullYear(), day.getMonth(), anchor);
    if (start > day) start = monthAnchorDate(day.getFullYear(), day.getMonth() - 1, anchor);
    const end = monthAnchorDate(start.getFullYear(), start.getMonth() + 1, anchor);
    return { start, end };
  }
  if (type === 'weekly') {
    const start = addDays(day, -((isoWeekday(day) - anchor + 7) % 7));
    return { start, end: addDays(start, 7) };
  }
  if (type === 'biweekly') {
    const base = parseDateOnly(event.startDate) || new Date(2024, 0, 1);
    const ref = addDays(base, -((isoWeekday(base) - anchor + 7) % 7));
    const idx = Math.floor(daysBetween(ref, day) / 14);
    const start = addDays(ref, idx * 14);
    return { start, end: addDays(start, 14) };
  }
  return null;
}

function clampToEvent(event, win) {
  const { start: evStart, end: evEnd } = eventBounds(event);
  let start = win.start;
  let end = win.end;
  if (evStart && (!start || start < evStart)) start = evStart;
  if (evEnd && (!end || end > evEnd)) end = evEnd;
  return { start, end };
}

/**
 * The [start, end) window of the cycle that contains `date`, clamped to the
 * campaign period. Before the campaign starts this is its first cycle; after
 * it ends, its last cycle. cycleType 'none' → the whole campaign period.
 */
function cycleWindowAt(event, date = new Date()) {
  const { start: evStart, end: evEnd } = eventBounds(event);
  if (cycleTypeOf(event) === 'none') return { start: evStart, end: evEnd };
  let ref = toDate(date);
  if (evStart && ref < evStart) ref = evStart;
  if (evEnd && ref >= evEnd) ref = addDays(evEnd, -1);
  return clampToEvent(event, rawCycleContaining(event, ref));
}

/**
 * The most recent cycle that has fully closed before `now` (for checking a
 * reward that should already have been credited). For an ended campaign
 * that's its final cycle. Null when there is none: non-cyclic campaigns,
 * campaigns that haven't started, or that haven't completed a cycle yet.
 */
function previousCycleWindow(event, now = new Date()) {
  if (cycleTypeOf(event) === 'none') return null;
  const { start: evStart, end: evEnd } = eventBounds(event);
  const today = startOfDay(now);
  if (evStart && today < evStart) return null;
  let raw;
  if (evEnd && today >= evEnd) {
    raw = rawCycleContaining(event, addDays(evEnd, -1));
  } else {
    const cur = rawCycleContaining(event, today);
    raw = rawCycleContaining(event, addDays(cur.start, -1));
  }
  const win = clampToEvent(event, raw);
  if (evStart && win.end <= evStart) return null;
  if (win.start && win.end && win.end <= win.start) return null;
  return win;
}

/** Legacy helper kept for callers that only need the next reset instant. */
function getNextResetDate(now, cycleType, anchorDay) {
  const raw = rawCycleContaining({ cycleType, cycleAnchorDay: anchorDay }, now);
  return raw ? raw.end : null;
}

/**
 * Everything the UI needs to show "how much time is left", computed once on
 * the server so every page agrees:
 *   phase          'upcoming' | 'active' | 'ended'
 *   daysLeft       days remaining including today (1 = today is the last day)
 *   daysUntilStart days until an upcoming campaign starts
 *   progress       % of the campaign period elapsed
 *   cycle          { start, end (inclusive last day), resetDate, length,
 *                    daysLeft, progress, endsWithEvent }
 */
function eventTiming(event, now = new Date()) {
  const today = startOfDay(now);
  const { start, end, endDay } = eventBounds(event);
  let phase = 'active';
  if (start && today < start) phase = 'upcoming';
  else if (end && today >= end) phase = 'ended';

  const timing = {
    phase,
    daysUntilStart: phase === 'upcoming' ? daysBetween(today, start) : 0,
    daysLeft: endDay ? Math.max(0, daysBetween(today, endDay) + 1) : null,
    progress: null,
    cycle: null
  };
  if (start && end) {
    const total = daysBetween(start, end);
    const elapsed = Math.min(total, Math.max(0, daysBetween(start, today)));
    timing.progress = total > 0 ? Math.round((elapsed / total) * 1000) / 10 : 0;
  }

  if (cycleTypeOf(event) !== 'none') {
    const w = cycleWindowAt(event, now);
    const raw = rawCycleContaining(event, w.start);
    const length = daysBetween(w.start, w.end);
    const elapsed = Math.min(length, Math.max(0, daysBetween(w.start, today)));
    timing.cycle = {
      start: formatDateOnly(w.start),
      end: formatDateOnly(addDays(w.end, -1)),
      resetDate: formatDateOnly(w.end),
      length,
      daysLeft: phase === 'active' ? Math.max(0, daysBetween(today, w.end)) : null,
      progress: length > 0 ? Math.round((elapsed / length) * 1000) / 10 : 0,
      endsWithEvent: !!(end && raw && raw.end > end)
    };
  }
  return timing;
}

function windowContains(win, at) {
  const t = toDate(at);
  if (win.start && t < win.start) return false;
  if (win.end && t >= win.end) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Exact money arithmetic
// ─────────────────────────────────────────────────────────────

/** Parses a decimal (string from MySQL DECIMAL, or number) into BigInt units of 10^-scale, rounding half up. */
function toScaled(v, scale) {
  if (v == null || v === '') return 0n;
  if (typeof v === 'bigint') return v;
  let s = typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(scale + 2) : '0') : String(v).trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 0n;
    s = n.toFixed(scale + 2);
    return toScaled(s, scale);
  }
  const frac = (m[3] || '').padEnd(scale + 1, '0');
  let out = BigInt(m[2] || '0') * 10n ** BigInt(scale) + BigInt(frac.slice(0, scale) || '0');
  if (Number(frac[scale]) >= 5) out += 1n;
  return m[1] === '-' ? -out : out;
}

const toCents = (v) => toScaled(v, 2);
const toPctMilli = (v) => toScaled(v, 3);
const microToNumber = (m) => Number(m) / 1e6;
const centsToNumber = (c) => Number(c) / 100;

function precisionOf(event) {
  const p = parseInt(event.rewardPrecision, 10);
  return Number.isFinite(p) ? Math.min(6, Math.max(0, p)) : 0;
}

/**
 * Reward (micro-units) for `amountCents` at `pctMilli`, rounded or floored
 * at `precision` decimal places — exact integer arithmetic.
 */
function percentRewardMicro(amountCents, pctMilli, precision, rounding) {
  if (amountCents <= 0n || pctMilli <= 0n) return 0n;
  const scale = 10n ** BigInt(precision);
  const num = amountCents * pctMilli * scale;
  let q = num / PCT_DEN;
  if (rounding !== 'floor' && (num % PCT_DEN) * 2n >= PCT_DEN) q += 1n;
  return q * 10n ** BigInt(6 - precision);
}

/** Smallest spend (cents) whose percent reward reaches `targetMicro`. */
function spendForRewardCents(targetMicro, pctMilli, precision, rounding) {
  if (targetMicro <= 0n) return 0n;
  if (pctMilli <= 0n) return null;
  const unit = 10n ** BigInt(6 - precision);
  const units = (targetMicro + unit - 1n) / unit; // reward in precision units, rounded up
  const k = pctMilli * 10n ** BigInt(precision);
  let t = rounding === 'floor'
    ? (units * PCT_DEN + k - 1n) / k
    : ((2n * units - 1n) * PCT_DEN + 2n * k - 1n) / (2n * k);
  if (t < 0n) t = 0n;
  // Guard against off-by-one from the closed forms.
  while (t > 0n && percentRewardMicro(t - 1n, pctMilli, precision, rounding) >= targetMicro) t -= 1n;
  while (percentRewardMicro(t, pctMilli, precision, rounding) < targetMicro) t += 1n;
  return t;
}

// ─────────────────────────────────────────────────────────────
// Matching rules
// ─────────────────────────────────────────────────────────────

function normalizeForMatch(s) {
  return String(s || '').toUpperCase().replace(/[\s　]+/g, '');
}

function parseMerchantKeywords(raw) {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw || '').split(/[\n,，、;；]/).map((s) => s.trim()).filter(Boolean);
}

/** Text a merchant keyword is searched in: note + card / payment-method names. */
function transactionHaystack(txn) {
  const parts = [
    txn.note,
    txn.merchant,
    txn.rawCardName,
    txn.rawPaymentMethodName,
    txn.card && txn.card.name,
    txn.paymentMethod && txn.paymentMethod.name
  ].filter(Boolean);
  return normalizeForMatch(parts.join(' '));
}

function firstKeywordInTransaction(rawKeywords, txn) {
  const keywords = parseMerchantKeywords(rawKeywords);
  if (!keywords.length) return null;
  const haystack = transactionHaystack(txn);
  for (const kw of keywords) {
    const norm = normalizeForMatch(kw);
    if (norm && haystack.includes(norm)) return kw;
  }
  return null;
}

/** { matched, keyword } for「商家限定」; always matched when the rule is off. */
function matchMerchantKeyword(event, txn) {
  if (!event.requireMerchantMatch) return { matched: true, keyword: null };
  const keyword = firstKeywordInTransaction(event.merchantKeywords, txn);
  return { matched: !!keyword, keyword };
}

/** { matched, keyword } for「排除商家」; matched:true means the txn IS excluded. */
function matchExcludeMerchantKeyword(event, txn) {
  if (!event.excludeMerchantMatch) return { matched: false, keyword: null };
  const keyword = firstKeywordInTransaction(event.excludeMerchantKeywords, txn);
  return { matched: !!keyword, keyword };
}

function idList(arr) {
  return (arr || []).map((x) => (x && typeof x === 'object' ? Number(x.id) : Number(x))).filter(Number.isFinite);
}

function paymentMatches(event, paymentMethodId) {
  const pmIds = idList(event.paymentMethods);
  const pm = paymentMethodId == null || paymentMethodId === '' ? null : Number(paymentMethodId);
  if (pmIds.length === 0) return pm == null;
  if (pm == null) return !!event.matchUnspecifiedPayment;
  return pmIds.includes(pm);
}

function cardMatches(event, cardId) {
  return idList(event.cards).includes(Number(cardId));
}

function minSpendScopeOf(event) {
  return event.minimumSpendScope === 'cycleTotal' ? 'cycleTotal' : 'perTransaction';
}

/**
 * Why a single (card/payment-matched) transaction does or doesn't count:
 *   null                → counts
 *   'excludedMerchant'  → hit the「排除商家」list (checked first, beats everything)
 *   'merchantNotMatched'→「商家限定」is on and no keyword matched
 *   'belowMinimum'      → under the per-transaction minimum spend
 */
function disqualifyReason(event, txn) {
  const ex = matchExcludeMerchantKeyword(event, txn);
  if (ex.matched) return { reason: 'excludedMerchant', keyword: ex.keyword };
  const inc = matchMerchantKeyword(event, txn);
  if (!inc.matched) return { reason: 'merchantNotMatched', keyword: null };
  if (minSpendScopeOf(event) === 'perTransaction') {
    const min = toCents(event.minimumSpend);
    if (min > 0n && toCents(txn.amount) < min) return { reason: 'belowMinimum', keyword: null };
  }
  return null;
}

/** Card + payment method + inside the window. */
function baseMatches(event, txn, win) {
  return cardMatches(event, txn.cardId)
    && paymentMatches(event, txn.paymentMethodId)
    && (!win || windowContains(win, txn.transactionAt));
}

/**
 * Whether `txn` counts towards `event` at all (any cycle of the campaign) —
 * used to label a transaction with the campaigns it belongs to.
 */
function eventMatchesTransaction(event, txn) {
  const bounds = eventBounds(event);
  if (!baseMatches(event, txn, bounds)) return false;
  return disqualifyReason(event, txn) === null;
}

// ─────────────────────────────────────────────────────────────
// Reward evaluation for one cycle
// ─────────────────────────────────────────────────────────────

function rewardRules(event) {
  return {
    pctMilli: toPctMilli(event.cashbackPercent),
    fixedMicro: toCents(event.cashbackFixed) * MICRO_PER_CENT,
    capMicro: event.maxReward != null && event.maxReward !== '' ? toCents(event.maxReward) * MICRO_PER_CENT : null,
    minCents: toCents(event.minimumSpend),
    scope: minSpendScopeOf(event),
    precision: precisionOf(event),
    rounding: event.rewardRounding === 'floor' ? 'floor' : 'round',
    calcMode: event.rewardCalcMode === 'perTransaction' ? 'perTransaction' : 'aggregate'
  };
}

/**
 * Evaluates one cycle. `txns` must already be restricted to this event's
 * cards / payment rule / window (see baseMatches); merchant rules and the
 * minimum spend are applied here.
 *
 * Fixed rewards: with a cycle-total minimum ("當月累積滿 3000 送 100") the
 * fixed amount is earned once per cycle; otherwise once per qualifying txn.
 * Percent rewards with a cycle-total minimum earn nothing until the cycle's
 * qualifying spend reaches it, then apply to the whole cycle.
 */
function evaluateCycle(event, txns, win = null, opts = {}) {
  const r = rewardRules(event);
  const included = [];
  const excluded = [];
  for (const t of txns) {
    const why = disqualifyReason(event, t);
    if (why) excluded.push({ txn: t, ...why });
    else included.push(t);
  }
  included.sort((a, b) => toDate(a.transactionAt) - toDate(b.transactionAt));

  const usedCents = included.reduce((s, t) => s + toCents(t.amount), 0n);
  const thresholdApplies = r.scope === 'cycleTotal' && r.minCents > 0n;
  const thresholdMet = thresholdApplies ? usedCents >= r.minCents : true;

  let kind = null;
  let rawMicro = null;
  let txnRewards = null;
  if (r.pctMilli > 0n) {
    kind = 'percent';
    if (r.calcMode === 'perTransaction') {
      txnRewards = included.map((t) => ({
        transactionId: t.id,
        transactionAt: t.transactionAt,
        amount: Number(t.amount),
        note: t.note || null,
        rewardMicro: percentRewardMicro(toCents(t.amount), r.pctMilli, r.precision, r.rounding)
      }));
      rawMicro = txnRewards.reduce((s, x) => s + x.rewardMicro, 0n);
    } else {
      rawMicro = percentRewardMicro(usedCents, r.pctMilli, r.precision, r.rounding);
    }
  } else if (r.fixedMicro > 0n) {
    kind = 'fixed';
    rawMicro = thresholdApplies
      ? (thresholdMet ? r.fixedMicro : 0n)
      : BigInt(included.length) * r.fixedMicro;
  }

  const potentialMicro = rawMicro; // before the threshold gate & cap
  if (rawMicro != null && !thresholdMet) rawMicro = 0n;

  let estimatedMicro = rawMicro;
  let capReached = null;
  let remainingRewardMicro = null;
  let remainingCapAmount = null;
  let remainingCapTransactions = null;
  if (rawMicro != null && r.capMicro != null) {
    capReached = rawMicro >= r.capMicro;
    estimatedMicro = rawMicro > r.capMicro ? r.capMicro : rawMicro;
    remainingRewardMicro = r.capMicro - estimatedMicro;
    if (kind === 'percent') {
      let need;
      if (r.calcMode === 'aggregate') {
        const target = spendForRewardCents(r.capMicro, r.pctMilli, r.precision, r.rounding);
        need = target == null ? null : target - usedCents;
      } else {
        need = spendForRewardCents(remainingRewardMicro, r.pctMilli, r.precision, r.rounding);
      }
      if (need != null) {
        if (thresholdApplies && !thresholdMet) {
          const toThreshold = r.minCents - usedCents;
          if (toThreshold > need) need = toThreshold;
        }
        remainingCapAmount = centsToNumber(need > 0n ? need : 0n);
      }
    } else if (kind === 'fixed' && !thresholdApplies) {
      remainingCapTransactions = Number(remainingRewardMicro / r.fixedMicro);
    }
  }

  const result = {
    cycleStart: win ? win.start : null,
    cycleEnd: win ? win.end : null,
    rewardKind: kind,
    usedAmount: centsToNumber(usedCents),
    txnCount: included.length,
    excludedCount: excluded.length,
    qualifyingCount: kind === 'fixed' ? included.length : null,
    estimatedReward: estimatedMicro == null ? null : microToNumber(estimatedMicro),
    potentialReward: potentialMicro == null ? null : microToNumber(
      r.capMicro != null && potentialMicro > r.capMicro ? r.capMicro : potentialMicro
    ),
    cap: r.capMicro == null ? null : microToNumber(r.capMicro),
    capReached,
    capUsedPercent: r.capMicro && r.capMicro > 0n && estimatedMicro != null
      ? Math.min(100, Math.round(Number((estimatedMicro * 10000n) / r.capMicro)) / 100)
      : null,
    remainingReward: remainingRewardMicro == null ? null : microToNumber(remainingRewardMicro),
    remainingCapAmount,
    remainingCapTransactions,
    minimumSpend: r.minCents > 0n ? centsToNumber(r.minCents) : null,
    minimumSpendScope: r.scope,
    thresholdMet,
    remainingToThreshold: thresholdApplies && !thresholdMet ? centsToNumber(r.minCents - usedCents) : 0,
    effectiveRate: usedCents > 0n && estimatedMicro != null
      ? Math.round((microToNumber(estimatedMicro) / centsToNumber(usedCents)) * 10000) / 100
      : null,
    rewardRounding: r.rounding,
    rewardCalcMode: r.calcMode,
    rewardPrecision: r.precision,
    txnRewards: txnRewards
      ? txnRewards.map(({ rewardMicro, ...rest }) => ({ ...rest, reward: microToNumber(rewardMicro) }))
      : null
  };
  if (opts.includeTransactions) {
    result.transactions = included.map((t) => ({
      id: t.id,
      transactionAt: t.transactionAt,
      amount: Number(t.amount),
      note: t.note || null
    }));
    result.excludedTransactions = excluded.map((x) => ({
      id: x.txn.id,
      transactionAt: x.txn.transactionAt,
      amount: Number(x.txn.amount),
      note: x.txn.note || null,
      reason: x.reason,
      keyword: x.keyword || null
    }));
  }
  return result;
}

/** Filters `allTxns` to this event's window and evaluates it. */
function computeUsage(event, allTxns, win, opts = {}) {
  if (!idList(event.cards).length) return null;
  const txns = allTxns.filter((t) => baseMatches(event, t, win));
  return evaluateCycle(event, txns, win, opts);
}

// ─────────────────────────────────────────────────────────────
// 刷哪張 — best card / payment method for a purchase
// ─────────────────────────────────────────────────────────────

function needsRegistration(event) {
  return !!event.requiresRegistration && !event.registeredAt;
}

/**
 * Ranks every card × payment-method combination that some active campaign
 * applies to, by the *additional* reward a purchase of `amount` at
 * `merchant` would earn right now — taking each campaign's current-cycle
 * spend, cap, minimum spend and merchant rules into account. Campaigns that
 * apply to the same combination stack.
 *
 *   events : campaigns with { cards:[{id,name}], paymentMethods:[{id,name}] }
 *   txns   : the user's transactions covering the campaigns' current cycles
 */
function recommend({ events, txns, amount, merchant = '', at = new Date(), cardId = null, paymentMethodId, limit = 10 }) {
  const amountCents = toCents(amount);
  const when = toDate(at);
  const active = events.filter((ev) => eventTiming(ev, when).phase === 'active' && idList(ev.cards).length);

  const cardById = new Map();
  const pmById = new Map();
  const combos = new Map();
  for (const ev of active) {
    for (const c of ev.cards || []) cardById.set(Number(c.id), c);
    for (const p of ev.paymentMethods || []) pmById.set(Number(p.id), p);
    const pmOptions = idList(ev.paymentMethods);
    const options = pmOptions.length ? pmOptions.slice() : [null];
    if (pmOptions.length && ev.matchUnspecifiedPayment) options.push(null);
    for (const cid of idList(ev.cards)) {
      if (cardId != null && Number(cardId) !== cid) continue;
      for (const pid of options) {
        if (paymentMethodId !== undefined) {
          const want = paymentMethodId === null || paymentMethodId === 'none' || paymentMethodId === '' ? null : Number(paymentMethodId);
          if (want !== pid) continue;
        }
        const key = `${cid}:${pid == null ? '-' : pid}`;
        if (!combos.has(key)) combos.set(key, { cardId: cid, paymentMethodId: pid });
      }
    }
  }

  const windows = new Map(active.map((ev) => [ev.id, cycleWindowAt(ev, when)]));
  const cycleTxns = new Map(active.map((ev) => [ev.id, txns.filter((t) => baseMatches(ev, t, windows.get(ev.id)))]));

  const options = [];
  for (const combo of combos.values()) {
    const sim = {
      id: 'simulated',
      cardId: combo.cardId,
      paymentMethodId: combo.paymentMethodId,
      amount: centsToNumber(amountCents),
      transactionAt: when,
      note: merchant || '',
      card: cardById.get(combo.cardId),
      paymentMethod: combo.paymentMethodId != null ? pmById.get(combo.paymentMethodId) : null
    };
    const contributions = [];
    const missed = [];
    let totalMicro = 0n;
    for (const ev of active) {
      if (!baseMatches(ev, sim, windows.get(ev.id))) continue;
      const why = disqualifyReason(ev, sim);
      if (why) {
        missed.push({ eventId: ev.id, title: ev.title, reason: why.reason, keyword: why.keyword || null, minimumSpend: ev.minimumSpend != null ? Number(ev.minimumSpend) : null });
        continue;
      }
      const before = evaluateCycle(ev, cycleTxns.get(ev.id), windows.get(ev.id));
      const after = evaluateCycle(ev, cycleTxns.get(ev.id).concat([sim]), windows.get(ev.id));
      const marginalMicro = toScaled(after.estimatedReward || 0, 6) - toScaled(before.estimatedReward || 0, 6);
      totalMicro += marginalMicro;
      contributions.push({
        eventId: ev.id,
        title: ev.title,
        rewardType: ev.rewardType || 'cash',
        reward: microToNumber(marginalMicro),
        cashbackPercent: ev.cashbackPercent != null ? Number(ev.cashbackPercent) : null,
        cashbackFixed: ev.cashbackFixed != null ? Number(ev.cashbackFixed) : null,
        capBefore: before.capReached,
        capReachedAfter: after.capReached,
        remainingRewardAfter: after.remainingReward,
        thresholdMetAfter: after.thresholdMet,
        remainingToThresholdAfter: after.remainingToThreshold,
        needsRegistration: needsRegistration(ev),
        merchantKeyword: ev.requireMerchantMatch ? matchMerchantKeyword(ev, sim).keyword : null
      });
    }
    if (!contributions.length && !missed.length) continue;
    const card = cardById.get(combo.cardId) || { id: combo.cardId };
    const pm = combo.paymentMethodId != null ? (pmById.get(combo.paymentMethodId) || { id: combo.paymentMethodId }) : null;
    const total = microToNumber(totalMicro);
    options.push({
      cardId: combo.cardId,
      card: { id: card.id, name: card.name, imageUrl: card.imageUrl || null, color: card.color || null, network: card.network || null },
      paymentMethodId: combo.paymentMethodId,
      paymentMethod: pm ? { id: pm.id, name: pm.name, imageUrl: pm.imageUrl || null } : null,
      totalReward: total,
      effectiveRate: amountCents > 0n ? Math.round((total / centsToNumber(amountCents)) * 10000) / 100 : 0,
      contributions: contributions.sort((a, b) => b.reward - a.reward),
      missed
    });
  }

  options.sort((a, b) => (b.totalReward - a.totalReward)
    || (b.contributions.length - a.contributions.length)
    || String(a.card.name || '').localeCompare(String(b.card.name || '')));

  return {
    amount: centsToNumber(amountCents),
    merchant: merchant || '',
    at: when.toISOString(),
    consideredEvents: active.length,
    options: options.slice(0, Math.max(1, limit))
  };
}

module.exports = {
  // dates
  startOfDay,
  addDays,
  daysBetween,
  parseDateOnly,
  formatDateOnly,
  todayDateOnly,
  monthAnchorDate,
  // cycles
  eventBounds,
  rawCycleContaining,
  cycleWindowAt,
  previousCycleWindow,
  getNextResetDate,
  eventTiming,
  windowContains,
  // money
  toCents,
  toPctMilli,
  percentRewardMicro,
  spendForRewardCents,
  // matching
  normalizeForMatch,
  parseMerchantKeywords,
  matchMerchantKeyword,
  matchExcludeMerchantKeyword,
  paymentMatches,
  cardMatches,
  disqualifyReason,
  baseMatches,
  eventMatchesTransaction,
  needsRegistration,
  // evaluation
  evaluateCycle,
  computeUsage,
  recommend
};
