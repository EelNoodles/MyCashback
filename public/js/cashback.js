(function () {
  'use strict';
  const A = window.App;

  const listEl = document.getElementById('eventsList');
  const qInput = document.getElementById('qInput');
  const cardFilter = document.getElementById('cardFilter');
  const pmFilter = document.getElementById('pmFilter');
  const statusChips = document.querySelectorAll('.status-chip');
  const groupBySelect = document.getElementById('groupBySelect');
  const sortBySelect = document.getElementById('sortBySelect');

  const newEventBtn = document.getElementById('newEventBtn');
  const aiParseBtn = document.getElementById('aiParseBtn');
  const aiKeysBtn = document.getElementById('aiKeysBtn');

  // AI keys modal
  const aiKeysList = document.getElementById('aiKeysList');
  const aiKeysEmpty = document.getElementById('aiKeysEmpty');
  const aiKeysError = document.getElementById('aiKeysError');
  const aiKeyAddForm = document.getElementById('aiKeyAddForm');
  const aiKeyAddError = document.getElementById('aiKeyAddError');

  // Form
  const eventForm = document.getElementById('eventForm');
  const eventFormError = document.getElementById('eventFormError');
  const deleteEventBtn = document.getElementById('deleteEventBtn');
  const eventModalTitle = document.getElementById('eventModalTitle');
  const cardChipsBox = document.getElementById('cardChips');
  const pmChipsBox = document.getElementById('pmChips');
  const cycleAnchorWrap = document.getElementById('cycleAnchorWrap');
  const cycleAnchorLabel = document.getElementById('cycleAnchorLabel');
  const cycleHint = document.getElementById('cycleHint');
  const requireMerchantMatchInput = document.getElementById('requireMerchantMatchInput');
  const merchantKeywordsWrap = document.getElementById('merchantKeywordsWrap');
  const merchantAiBtn = document.getElementById('merchantAiBtn');
  const merchantAiBox = document.getElementById('merchantAiBox');
  const merchantAiInput = document.getElementById('merchantAiInput');
  const merchantAiCancelBtn = document.getElementById('merchantAiCancelBtn');
  const merchantAiAnalyzeBtn = document.getElementById('merchantAiAnalyzeBtn');
  const merchantAiError = document.getElementById('merchantAiError');

  // AI
  const aiInput = document.getElementById('aiInput');
  const aiPreview = document.getElementById('aiPreview');
  const aiError = document.getElementById('aiError');
  const aiAnalyzeBtn = document.getElementById('aiAnalyzeBtn');
  const aiApplyBtn = document.getElementById('aiApplyBtn');

  // AI search
  const modeChips = document.querySelectorAll('.mode-chip');
  const normalFilters = document.getElementById('normalFilters');
  const aiSearchWrap = document.getElementById('aiSearchWrap');
  const aiSearchInput = document.getElementById('aiSearchInput');
  const aiSearchBtn = document.getElementById('aiSearchBtn');
  const aiWebToggle = document.getElementById('aiWebToggle');
  const aiModelSelect = document.getElementById('aiModelSelect');
  const aiParseModelSelect = document.getElementById('aiParseModel');

  const AI_MODEL_STORAGE_KEY = 'mycashback.aiModel';
  const GROUP_BY_STORAGE_KEY = 'mycashback.groupBy';
  const SORT_BY_STORAGE_KEY = 'mycashback.sortBy';

  let state = {
    mode: 'normal',
    aiModel: localStorage.getItem(AI_MODEL_STORAGE_KEY) || '',
    aiModels: [],
    status: 'active',
    q: '',
    cardId: '',
    pmId: '',
    groupBy: localStorage.getItem(GROUP_BY_STORAGE_KEY) || 'card',
    sortBy: localStorage.getItem(SORT_BY_STORAGE_KEY) || 'deadline',
    cards: [],
    pms: [],
    events: [],
    aiResult: null,
    selectedCardIds: new Set(),
    selectedPmIds: new Set()
  };

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const SPINNER_SVG = '<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

  const NETWORK_LABELS = {
    visa: 'VISA', mastercard: 'MC', jcb: 'JCB',
    amex: 'AMEX', unionpay: 'UP', other: ''
  };

  // ─── Cycle Calculation ───
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
      const anchor = (anchorDay || 1); // 1=Mon
      const currentDay = d.getDay() || 7; // Sunday=7
      let daysUntil = anchor - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (cycleType === 'biweekly' && daysUntil <= 7) daysUntil += 7; // rough approx
      const next = new Date(d);
      next.setDate(next.getDate() + daysUntil);
      return next;
    }
    return null;
  }

  function calcCycleInfo(ev) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const result = { expired: false, eventRemaining: null, cycleRemaining: null };

    if (ev.endDate && ev.endDate < todayStr) {
      result.expired = true;
      return result;
    }

    // Total event remaining
    if (ev.endDate) {
      const endMs = new Date(ev.endDate) - today;
      const totalDays = Math.ceil(endMs / 86400000);
      const months = Math.floor(totalDays / 30);
      const days = totalDays % 30;
      result.eventRemaining = { months, days, totalDays };
    }

    // Cycle remaining
    if (ev.cycleType && ev.cycleType !== 'none') {
      const nextReset = getNextResetDate(today, ev.cycleType, ev.cycleAnchorDay);
      if (nextReset) {
        const cycleDays = Math.ceil((nextReset - today) / 86400000);

        // Compute cycle length for progress
        let cycleLength = 30;
        if (ev.cycleType === 'weekly') cycleLength = 7;
        else if (ev.cycleType === 'biweekly') cycleLength = 14;
        else if (ev.cycleType === 'monthly') cycleLength = 30;

        const elapsed = cycleLength - cycleDays;
        const progress = Math.max(0, Math.min(100, (elapsed / cycleLength) * 100));

        result.cycleRemaining = { days: cycleDays, cycleLength, progress };
      }
    }

    return result;
  }

  const CYCLE_LABELS = { weekly: '本週', biweekly: '本雙週', monthly: '本月' };
  const DAY_LABELS = ['', '一', '二', '三', '四', '五', '六', '日'];
  // Wording prefix for the "cap-reaching spend" callout. Uses '活動內' when
  // there's no cycle since the reward cap applies over the whole event.
  const SPEND_PREFIX = { weekly: '本週', biweekly: '本雙週', monthly: '本月', none: '活動內' };

  // Given a percent cashback and a period reward cap, work out how much the
  // user can spend within one cycle before further spending stops earning
  // more cashback (the "hit-the-cap" spend). Returns null when either input
  // is missing so callers can skip the callout entirely.
  function calcMaxUsefulSpend(ev) {
    const pct = Number(ev.cashbackPercent);
    const cap = Number(ev.maxReward);
    if (!(pct > 0) || !(cap > 0)) return null;
    return cap * 100 / pct;
  }

  function maxSpendCalloutHtml(ev) {
    const s = calcMaxUsefulSpend(ev);
    if (s == null) return '';
    const prefix = SPEND_PREFIX[ev.cycleType || 'none'] || '活動內';
    return `<div class="mt-2 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 text-emerald-800 flex items-center gap-1.5">
      <span aria-hidden="true">🎯</span>
      <span><strong>${prefix}最高消費</strong> NT$${A.fmtNumber(Math.ceil(s))} 即拿滿回饋（上限 NT$${A.fmtNumber(Number(ev.maxReward))}）</span>
    </div>`;
  }

  // Real usage (from actual reported card transactions), computed server-side
  // in cashbackCycleService. Falls back to the theoretical estimate above when
  // the event has no linked cards to match transactions against.
  function usageCalloutHtml(ev) {
    const u = ev.usage;
    if (!u) return maxSpendCalloutHtml(ev);

    const prefix = SPEND_PREFIX[ev.cycleType || 'none'] || '活動內';
    let body = `<div class="flex items-center justify-between gap-2">
      <span>${prefix}已刷 <strong>NT$${A.fmtNumber(u.usedAmount)}</strong>${u.txnCount ? `（${u.txnCount} 筆）` : ''}</span>
    </div>`;

    if (u.cap != null) {
      if (u.capReached) {
        body += `<div class="mt-1 font-medium text-rose-600">🎉 本${prefix === '活動內' ? '活動' : prefix}已達回饋上限 NT$${A.fmtNumber(u.cap)}</div>`;
      } else if (u.remainingCapAmount != null) {
        body += `<div class="mt-1 text-emerald-700">🎯 還可刷 <strong>NT$${A.fmtNumber(Math.ceil(u.remainingCapAmount))}</strong> 即達上限</div>`;
      } else if (u.remainingCapTransactions != null) {
        body += `<div class="mt-1 text-emerald-700">🎯 還可有 <strong>${A.fmtNumber(u.remainingCapTransactions)}</strong> 筆符合門檻的交易即達上限</div>`;
      }
      const pct = u.estimatedReward != null ? Math.max(0, Math.min(100, (u.estimatedReward / u.cap) * 100)) : 0;
      const barColor = pct >= 100 ? 'progress-bar__fill--rose' : 'progress-bar__fill--brand';
      body += `<div class="mt-1.5 progress-bar"><div class="${barColor} progress-bar__fill" style="width:${pct.toFixed(1)}%"></div></div>`;
    }

    return `<div class="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700">${body}</div>`;
  }

  // ─── Renderers ───
  function eventCardEl(ev) {
    const card = document.createElement('div');
    card.className = 'card p-3 cursor-pointer hover:shadow-md transition';
    const info = calcCycleInfo(ev);

    const reward = ev.cashbackPercent
      ? `${ev.cashbackPercent}% 回饋`
      : (ev.cashbackFixed ? `+${A.fmtNumber(ev.cashbackFixed)}` : '—');

    // Card chips with mini-card styling
    const cardChips = (ev.cards || []).map((c) => {
      const net = c.network ? ` · ${NETWORK_LABELS[c.network] || ''}` : '';
      if (c.imageUrl) {
        return `<span class="credit-card-mini"><img class="credit-card-mini__img" src="${A.url(c.imageUrl)}" alt="" />${c.name}${net}</span>`;
      }
      return `<span class="credit-card-mini">💳 ${c.name}${net}</span>`;
    }).join('');

    const pmChips = (ev.paymentMethods || []).map((p) => {
      if (p.imageUrl) {
        return `<span class="pm-badge"><img class="pm-badge__img" src="${A.url(p.imageUrl)}" alt="" />${p.name}</span>`;
      }
      return `<span class="pm-badge">💸 ${p.name}</span>`;
    }).join('');

    // Build countdown display
    let countdownHtml = '';
    if (info.expired) {
      countdownHtml = '<div class="text-xs text-rose-500 font-medium">已結束</div>';
    } else {
      // Event remaining
      let eventLeft = '';
      if (info.eventRemaining) {
        const { months, days, totalDays } = info.eventRemaining;
        if (totalDays <= 0) {
          eventLeft = '今天最後一天';
        } else if (months > 0) {
          eventLeft = `活動剩 ${months} 月 ${days} 天`;
        } else {
          eventLeft = `活動剩 ${days} 天`;
        }

        // Event progress
        if (ev.startDate && ev.endDate) {
          const startMs = new Date(ev.startDate).getTime();
          const endMs = new Date(ev.endDate).getTime();
          const nowMs = new Date().getTime();
          const totalMs = endMs - startMs;
          const elapsedMs = nowMs - startMs;
          const pct = totalMs > 0 ? Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100)) : 0;
          const barColor = pct > 80 ? 'progress-bar__fill--rose' : (pct > 50 ? 'progress-bar__fill--amber' : 'progress-bar__fill--brand');
          eventLeft += `<div class="flex items-center gap-2 mt-1"><div class="progress-bar"><div class="${barColor} progress-bar__fill" style="width:${pct.toFixed(1)}%"></div></div><span class="text-[9px] text-slate-400">${Math.round(pct)}%</span></div>`;
        }
      } else {
        eventLeft = '無期限';
      }

      // Cycle remaining
      let cycleLeft = '';
      if (info.cycleRemaining) {
        const label = CYCLE_LABELS[ev.cycleType] || '';
        const cDays = info.cycleRemaining.days;
        const pct = info.cycleRemaining.progress;
        cycleLeft = `<div class="text-[10px] text-slate-500 mt-1">${label}剩 <strong class="text-slate-700">${cDays}</strong> 天</div>`;
        cycleLeft += `<div class="flex items-center gap-2 mt-0.5"><div class="progress-bar"><div class="progress-bar__fill progress-bar__fill--brand" style="width:${pct.toFixed(1)}%"></div></div></div>`;
      }

      countdownHtml = `<div class="text-[10px] text-slate-500">${eventLeft}</div>${cycleLeft}`;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="font-medium flex items-center gap-2">
            <span class="truncate min-w-0" title="${ev.title}">${ev.title}</span>
            ${ev.sourceUrl ? `<a href="${ev.sourceUrl}" target="_blank" class="text-brand-600 hover:text-brand-700 flex-shrink-0" title="開啟活動連結"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
          </div>
          <div class="text-xs text-slate-500 mt-0.5">${A.fmtDateOnly(ev.startDate)} ~ ${A.fmtDateOnly(ev.endDate)}</div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="text-base font-semibold text-brand-600">${reward}</div>
        </div>
      </div>
      <div class="mt-2">${countdownHtml}</div>
      ${usageCalloutHtml(ev)}
      <div class="mt-3 flex flex-wrap gap-1">${cardChips}${pmChips}</div>
      <div class="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div><span class="text-slate-400">最低門檻：</span>${ev.minimumSpend != null ? A.fmtNumber(ev.minimumSpend) : '—'}</div>
        <div><span class="text-slate-400">回饋上限：</span>${ev.maxReward != null ? A.fmtNumber(ev.maxReward) : '—'}</div>
        <div class="text-right">
          <button class="text-brand-600 hover:underline" data-edit="${ev.id}">編輯</button>
        </div>
      </div>`;
    
    // Open details on click (ignore if clicked on the edit button or sourceUrl link)
    card.addEventListener('click', (e) => {
      if (e.target.closest('button[data-edit]') || e.target.closest('a')) return;
      openEventDetails(ev, `${cardChips}${pmChips}`, countdownHtml);
    });

    card.querySelector('[data-edit]').addEventListener('click', () => openEventModal(ev));
    return card;
  }

  function openEventDetails(ev, tagsHtml, countdownHtml) {
    document.getElementById('eventDetailsTitle').textContent = ev.title;
    
    let reward = '';
    if (ev.cashbackPercent) reward = ev.cashbackPercent + '%';
    else if (ev.cashbackFixed) reward = '+' + A.fmtNumber(ev.cashbackFixed);
    else reward = '無';

    document.getElementById('eventDetailsContent').innerHTML = `
      <div class="text-sm text-slate-600">
        <div class="mb-2"><strong>活動期間：</strong> ${A.fmtDateOnly(ev.startDate)} ~ ${A.fmtDateOnly(ev.endDate)}</div>
        <div class="mb-2"><strong>狀態 / 倒數：</strong> ${countdownHtml}</div>
        <div class="mb-2"><strong>回饋比例：</strong> <span class="text-brand-600 font-semibold">${reward}</span></div>
        <div class="mb-2"><strong>最低門檻：</strong> ${ev.minimumSpend != null ? A.fmtNumber(ev.minimumSpend) : '—'}</div>
        <div class="mb-2"><strong>回饋上限：</strong> ${ev.maxReward != null ? A.fmtNumber(ev.maxReward) : '—'}</div>
        <div class="mb-2"><strong>目前週期消費：</strong> <div class="mt-1">${usageCalloutHtml(ev)}</div></div>
        <div class="mb-2"><strong>適用卡片/支付：</strong> <div class="mt-1 flex flex-wrap gap-1">${tagsHtml}</div></div>
        ${ev.description ? `<div class="mb-2"><strong>活動說明：</strong><p class="mt-1 whitespace-pre-wrap">${ev.description}</p></div>` : ''}
        ${ev.sourceUrl ? `<div class="mb-2"><strong>參考連結：</strong> <a href="${ev.sourceUrl}" target="_blank" class="text-brand-600 hover:underline break-all">${ev.sourceUrl}</a></div>` : ''}
      </div>
    `;
    
    const editBtn = document.getElementById('eventDetailsEditBtn');
    editBtn.onclick = () => {
      A.closeModal('eventDetailsModal');
      openEventModal(ev);
    };
    A.openModal('eventDetailsModal');
  }

  function chipButton(box, item, selectedSet) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = item.id;
    btn.className = 'chip';
    btn.textContent = item.name;
    function refresh() {
      btn.classList.toggle('chip-active', selectedSet.has(item.id));
    }
    refresh();
    btn.addEventListener('click', () => {
      if (selectedSet.has(item.id)) selectedSet.delete(item.id);
      else selectedSet.add(item.id);
      refresh();
    });
    box.appendChild(btn);
    return btn;
  }

  // ─── Cycle form UX ───
  function updateCycleUI() {
    const type = eventForm.cycleType.value;
    if (type === 'none') {
      cycleAnchorWrap.style.display = 'none';
      cycleHint.textContent = '設定後活動將依週期顯示倒數';
    } else if (type === 'weekly' || type === 'biweekly') {
      cycleAnchorWrap.style.display = '';
      cycleAnchorLabel.textContent = '星期幾重置 (1=一 ~ 7=日)';
      eventForm.cycleAnchorDay.max = 7;
      eventForm.cycleAnchorDay.placeholder = '例: 1';
      cycleHint.textContent = type === 'weekly' ? '每週重置，將顯示本週剩餘天數' : '每兩週重置';
    } else if (type === 'monthly') {
      cycleAnchorWrap.style.display = '';
      cycleAnchorLabel.textContent = '每月幾號重置';
      eventForm.cycleAnchorDay.max = 31;
      eventForm.cycleAnchorDay.placeholder = '例: 1';
      cycleHint.textContent = '每月重置，將顯示本月剩餘天數';
    }
  }
  eventForm?.cycleType?.addEventListener('change', updateCycleUI);

  // ─── Merchant-match form UX ───
  function updateMerchantKeywordsUI() {
    merchantKeywordsWrap.classList.toggle('hidden', !requireMerchantMatchInput.checked);
  }
  requireMerchantMatchInput?.addEventListener('change', updateMerchantKeywordsUI);

  // Adds any keywords not already present (case-insensitive) to the textarea,
  // rather than overwriting it — so re-running the AI analysis (or running it
  // after manually typing some keywords in) only ever appends.
  function mergeMerchantKeywords(newKeywords) {
    const existing = eventForm.merchantKeywords.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set(existing.map((s) => s.toUpperCase()));
    for (const raw of newKeywords) {
      const kw = String(raw || '').trim();
      const norm = kw.toUpperCase();
      if (norm && !seen.has(norm)) {
        existing.push(kw);
        seen.add(norm);
      }
    }
    eventForm.merchantKeywords.value = existing.join('\n');
  }

  merchantAiBtn?.addEventListener('click', () => {
    A.showError(merchantAiError, '');
    merchantAiBox.classList.toggle('hidden');
  });
  merchantAiCancelBtn?.addEventListener('click', () => {
    merchantAiBox.classList.add('hidden');
    merchantAiInput.value = '';
    A.showError(merchantAiError, '');
  });
  merchantAiAnalyzeBtn?.addEventListener('click', async () => {
    const text = merchantAiInput.value.trim();
    if (!text) { merchantAiInput.focus(); return; }
    A.setLoading(merchantAiAnalyzeBtn, true);
    A.showError(merchantAiError, '');
    try {
      const data = await A.jsonFetch(A.api('/ai/parse-merchants'), {
        method: 'POST', body: { text, model: state.aiModel || undefined }
      });
      mergeMerchantKeywords(Array.isArray(data.keywords) ? data.keywords : []);
      merchantAiBox.classList.add('hidden');
      merchantAiInput.value = '';
    } catch (err) {
      A.showError(merchantAiError, err.message);
    } finally {
      A.setLoading(merchantAiAnalyzeBtn, false);
    }
  });

  // ─── Loaders ───
  async function loadTags() {
    try {
      const [cards, pms] = await Promise.all([
        A.jsonFetch(A.api('/tags/cards')),
        A.jsonFetch(A.api('/tags/payment-methods'))
      ]);
      state.cards = cards;
      state.pms = pms;

      cardFilter.innerHTML = '<option value="">全部</option>'
        + cards.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
      pmFilter.innerHTML = '<option value="">全部</option>'
        + pms.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    } catch (err) {
      console.error('loadTags', err);
    }
  }

  // ─── Grouping / sorting ───
  // 'deadline' keeps the server's own order (endDate asc, startDate asc, id
  // desc); the others re-sort client-side since all matching events are
  // already loaded in one page.
  function sortEventsList(events, sortBy) {
    const arr = events.slice();
    if (sortBy === 'percentDesc' || sortBy === 'percentAsc') {
      const asc = sortBy === 'percentAsc';
      arr.sort((a, b) => {
        const pa = a.cashbackPercent != null ? Number(a.cashbackPercent) : null;
        const pb = b.cashbackPercent != null ? Number(b.cashbackPercent) : null;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1; // events without a percent (e.g. fixed-amount reward) sort last either way
        if (pb == null) return -1;
        return asc ? pa - pb : pb - pa;
      });
    } else if (sortBy === 'title') {
      arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant'));
    }
    return arr;
  }

  // An event can belong to multiple groups at once (e.g. linked to 2 cards),
  // in which case it's simply listed under each of its group headers.
  function groupLabelsFor(groupBy, ev) {
    if (groupBy === 'card') {
      return (ev.cards && ev.cards.length) ? ev.cards.map((c) => c.name) : ['（未指定卡片）'];
    }
    if (groupBy === 'paymentMethod') {
      return (ev.paymentMethods && ev.paymentMethods.length)
        ? ev.paymentMethods.map((p) => p.name)
        : ['（未使用電子支付 / 無指定）'];
    }
    return [null];
  }

  function renderEventsList(events) {
    listEl.innerHTML = '';
    if (!events.length) {
      listEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full">沒有符合條件的活動</div>`;
      return;
    }

    const sorted = sortEventsList(events, state.sortBy);

    if (state.groupBy === 'none') {
      for (const ev of sorted) listEl.appendChild(eventCardEl(ev));
      return;
    }

    const groups = new Map();
    for (const ev of sorted) {
      for (const label of groupLabelsFor(state.groupBy, ev)) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(ev);
      }
    }
    const labels = Array.from(groups.keys()).sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    const icon = state.groupBy === 'card' ? '💳' : '💸';
    for (const label of labels) {
      const header = document.createElement('div');
      header.className = 'col-span-full text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3 mb-1 first:mt-0 flex items-center gap-1.5';
      header.innerHTML = `<span>${icon} ${escapeHtml(label)}</span><span class="text-slate-300 font-normal normal-case">(${groups.get(label).length})</span>`;
      listEl.appendChild(header);
      for (const ev of groups.get(label)) listEl.appendChild(eventCardEl(ev));
    }
  }

  async function loadEvents() {
    listEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full">載入中…</div>`;
    const params = new URLSearchParams();
    params.set('status', state.status);
    if (state.q) params.set('q', state.q);
    if (state.cardId) params.set('cardId', state.cardId);
    if (state.pmId) params.set('paymentMethodId', state.pmId);
    try {
      listEl.innerHTML = '<div class="text-sm text-slate-400 col-span-full py-6 flex items-center justify-center gap-2"><svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 載入中…</div>';
      const events = await A.jsonFetch(A.api('/cashback?' + params.toString()));
      state.events = events;
      renderEventsList(events);
    } catch (err) {
      listEl.innerHTML = `<div class="text-sm text-rose-500 col-span-full">載入失敗：${err.message}</div>`;
    }
  }

  // ─── AI model picker ───
  function shortModelLabel(m) {
    // Strip the leading "Gemini" Google uses in displayName to keep options compact.
    const label = (m.displayName || m.name || '').replace(/^Gemini\s*/i, '').trim() || m.name;
    return 'Gemini ' + label;
  }

  function paintModelSelect(selectEl) {
    if (!selectEl) return;
    if (!state.aiModels.length) {
      selectEl.innerHTML = '<option value="">（無法載入模型）</option>';
      return;
    }
    selectEl.innerHTML = state.aiModels.map((m) => {
      const sel = m.name === state.aiModel ? ' selected' : '';
      const desc = m.description ? ` title="${escapeHtml(m.description)}"` : '';
      return `<option value="${escapeHtml(m.name)}"${sel}${desc}>${escapeHtml(shortModelLabel(m))}</option>`;
    }).join('');
  }

  function setAiModel(name) {
    state.aiModel = name || '';
    if (state.aiModel) localStorage.setItem(AI_MODEL_STORAGE_KEY, state.aiModel);
    else localStorage.removeItem(AI_MODEL_STORAGE_KEY);
    if (aiModelSelect && aiModelSelect.value !== state.aiModel) aiModelSelect.value = state.aiModel;
    if (aiParseModelSelect && aiParseModelSelect.value !== state.aiModel) aiParseModelSelect.value = state.aiModel;
  }

  async function loadAiModels() {
    try {
      const data = await A.jsonFetch(A.api('/ai/models'));
      state.aiModels = Array.isArray(data && data.models) ? data.models : [];
      // Resolve selected model: stored choice if still available, else server default.
      const stored = state.aiModel;
      const has = (n) => state.aiModels.some((m) => m.name === n);
      if (!stored || !has(stored)) {
        state.aiModel = has(data.default) ? data.default : (state.aiModels[0] && state.aiModels[0].name) || '';
        if (state.aiModel) localStorage.setItem(AI_MODEL_STORAGE_KEY, state.aiModel);
      }
      paintModelSelect(aiModelSelect);
      paintModelSelect(aiParseModelSelect);
    } catch (err) {
      state.aiModels = [];
      paintModelSelect(aiModelSelect);
      paintModelSelect(aiParseModelSelect);
    }
  }

  aiModelSelect?.addEventListener('change', () => setAiModel(aiModelSelect.value));
  aiParseModelSelect?.addEventListener('change', () => setAiModel(aiParseModelSelect.value));

  // ─── AI key management ───
  function aiKeyRowEl(k) {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-3 rounded-xl border border-slate-200 p-3'
      + (k.isActive ? ' bg-brand-50 border-brand-200' : '');
    li.dataset.id = k.id;
    li.innerHTML = `
      <input type="radio" name="aiActiveKey" class="text-brand-600" ${k.isActive ? 'checked' : ''} data-action="activate" />
      <div class="min-w-0 flex-1">
        <div class="font-medium text-sm truncate" data-field="name">${escapeHtml(k.name)}</div>
        <div class="text-[11px] text-slate-500 font-mono">${escapeHtml(k.keyMask)}</div>
      </div>
      <button type="button" data-action="rename" class="text-xs text-slate-500 hover:text-slate-700">重新命名</button>
      <button type="button" data-action="delete" class="text-xs text-rose-600 hover:text-rose-700">刪除</button>
    `;
    return li;
  }

  function renderAiKeys(keys) {
    aiKeysList.innerHTML = '';
    if (!keys.length) {
      aiKeysEmpty.classList.remove('hidden');
      return;
    }
    aiKeysEmpty.classList.add('hidden');
    keys.forEach((k) => aiKeysList.appendChild(aiKeyRowEl(k)));
  }

  async function loadAiKeys() {
    A.showError(aiKeysError, '');
    try {
      const keys = await A.jsonFetch(A.api('/ai/keys'));
      renderAiKeys(keys);
    } catch (err) {
      A.showError(aiKeysError, '載入失敗：' + err.message);
    }
  }

  aiKeysBtn?.addEventListener('click', () => {
    A.showError(aiKeyAddError, '');
    aiKeyAddForm.reset();
    aiKeyAddForm.makeActive.checked = true;
    loadAiKeys();
    A.openModal('aiKeysModal');
  });

  aiKeysList?.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    A.showError(aiKeysError, '');
    try {
      if (action === 'activate') {
        await A.jsonFetch(A.api(`/ai/keys/${id}`), { method: 'PUT', body: { isActive: true } });
        await loadAiKeys();
        loadAiModels();
      } else if (action === 'rename') {
        const current = li.querySelector('[data-field="name"]').textContent;
        const name = prompt('重新命名金鑰', current);
        if (!name || !name.trim() || name.trim() === current) return;
        await A.jsonFetch(A.api(`/ai/keys/${id}`), { method: 'PUT', body: { name: name.trim() } });
        await loadAiKeys();
      } else if (action === 'delete') {
        if (!confirm('確定刪除這把金鑰？此操作無法復原。')) return;
        await A.jsonFetch(A.api(`/ai/keys/${id}`), { method: 'DELETE' });
        await loadAiKeys();
        loadAiModels();
      }
    } catch (err) {
      A.showError(aiKeysError, err.message);
    }
  });

  aiKeyAddForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = aiKeyAddForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(aiKeyAddError, '');
    try {
      await A.jsonFetch(A.api('/ai/keys'), {
        method: 'POST',
        body: {
          name: aiKeyAddForm.name.value,
          key: aiKeyAddForm.key.value,
          makeActive: !!aiKeyAddForm.makeActive.checked
        }
      });
      aiKeyAddForm.reset();
      aiKeyAddForm.makeActive.checked = true;
      await loadAiKeys();
      loadAiModels();
    } catch (err) {
      A.showError(aiKeyAddError, err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  // ─── AI search ───
  const RANK_LABEL = { 1: '最佳推薦', 2: '次選方案', 3: '備選方案' };

  function aiRecCardEl(rec, rank, refMap) {
    const card = document.createElement('div');
    const isTop = rank === 1;
    card.className = 'col-span-full bg-white rounded-2xl shadow-sm p-5 sm:p-6 '
      + (isTop ? 'border border-brand-200 ring-1 ring-brand-100' : 'border border-slate-200');

    const cautions = (rec.cautions || []).map((c) =>
      `<li class="flex gap-2"><span class="text-amber-500 flex-shrink-0 mt-px">•</span><span class="leading-relaxed">${escapeHtml(c)}</span></li>`
    ).join('');

    const refs = (rec.eventIds || []).map((id) => refMap.get(id)).filter(Boolean);
    const refHtml = refs.map((r) => r.sourceUrl
      ? `<a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline">🔗 ${escapeHtml(r.title)}</a>`
      : `<span class="inline-flex items-center gap-1 text-xs text-slate-500">📋 ${escapeHtml(r.title)}</span>`
    ).join('');

    const checkBtn = rec.checkUrl
      ? `<a href="${escapeHtml(rec.checkUrl)}" target="_blank" rel="noopener" class="mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition">前往查看 ‧ 確認名額 <span aria-hidden="true">→</span></a>`
      : '';

    card.innerHTML = `
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0 w-11 h-11 rounded-full grid place-items-center text-lg font-bold ${isTop ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 border border-brand-100'}">${rank}</div>
        <div class="min-w-0 flex-1">
          <div class="text-[11px] font-medium tracking-widest text-slate-400 uppercase">${RANK_LABEL[rank] || ('推薦 ' + rank)}</div>
          <h3 class="text-lg font-semibold text-slate-800 mt-0.5 leading-snug break-words">${escapeHtml(rec.title)}</h3>
          ${rec.rewardText ? `<div class="mt-2"><span class="inline-flex items-center px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold border border-brand-100">${escapeHtml(rec.rewardText)}</span></div>` : ''}
        </div>
      </div>

      ${rec.reason ? `<p class="text-sm text-slate-600 leading-relaxed mt-4 whitespace-pre-wrap">${escapeHtml(rec.reason)}</p>` : ''}

      ${cautions ? `
      <div class="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3.5">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-1.5">
          <span aria-hidden="true">⚠️</span><span>注意事項</span>
        </div>
        <ul class="space-y-1 text-xs text-amber-800">${cautions}</ul>
      </div>` : ''}

      ${refHtml ? `
      <div class="mt-4 pt-3 border-t border-slate-100">
        <div class="text-[11px] text-slate-400 mb-1.5">相關活動</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1.5">${refHtml}</div>
      </div>` : ''}

      ${checkBtn}`;
    return card;
  }

  function renderAiResults(data) {
    listEl.innerHTML = '';
    const recs = data.recommendations || [];

    const top = document.createElement('div');
    top.className = 'col-span-full';
    const cachedTag = data.cached
      ? '<span class="ml-1.5 text-[10px] font-normal text-slate-400">· 快取</span>' : '';
    top.innerHTML = `
      <div class="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 px-4 py-3.5">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-brand-600 uppercase">
          <span aria-hidden="true">✨</span><span>AI 智能分析</span>${cachedTag}
        </div>
        <p class="text-sm text-slate-700 leading-relaxed mt-1">${escapeHtml(data.summary || '')}</p>
      </div>`;
    listEl.appendChild(top);

    if (!recs.length) {
      const empty = document.createElement('div');
      empty.className = 'col-span-full text-center text-sm text-slate-400 py-8';
      empty.textContent = '找不到相關的回饋方案，試試其他關鍵字，或先新增更多活動。';
      listEl.appendChild(empty);
      return;
    }

    const refMap = new Map((data.refs || []).map((r) => [r.id, r]));
    recs.forEach((rec, i) => listEl.appendChild(aiRecCardEl(rec, i + 1, refMap)));
  }

  async function runAiSearch() {
    const query = aiSearchInput.value.trim();
    if (!query) { aiSearchInput.focus(); return; }
    A.setLoading(aiSearchBtn, true);
    listEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full py-6 flex items-center justify-center gap-2">${SPINNER_SVG} AI 分析中…</div>`;
    try {
      const data = await A.jsonFetch(A.api('/ai/search-rewards'), {
        method: 'POST',
        body: {
          query,
          web: !!(aiWebToggle && aiWebToggle.checked),
          model: state.aiModel || undefined
        }
      });
      renderAiResults(data);
    } catch (err) {
      let msg = err.message;
      if (err.body && err.body.error === 'GEMINI_NOT_CONFIGURED') {
        msg = '尚未設定 AI 金鑰（GEMINI_API_KEY），無法使用 AI 搜尋。';
      }
      listEl.innerHTML = `<div class="text-sm text-rose-500 col-span-full">AI 搜尋失敗：${escapeHtml(msg)}</div>`;
    } finally {
      A.setLoading(aiSearchBtn, false);
    }
  }

  modeChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === state.mode) return;
      state.mode = mode;
      modeChips.forEach((b) => {
        const on = b.dataset.mode === mode;
        b.classList.toggle('bg-brand-600', on);
        b.classList.toggle('text-white', on);
        b.classList.toggle('border', !on);
        b.classList.toggle('border-slate-300', !on);
        b.classList.toggle('text-slate-600', !on);
      });
      if (mode === 'ai') {
        normalFilters.classList.add('hidden');
        aiSearchWrap.classList.remove('hidden');
        listEl.innerHTML = '<div class="text-sm text-slate-400 col-span-full">輸入消費場景或商家，讓 AI 推薦回饋最高的方案。</div>';
        aiSearchInput.focus();
      } else {
        aiSearchWrap.classList.add('hidden');
        normalFilters.classList.remove('hidden');
        loadEvents();
      }
    });
  });

  aiSearchBtn?.addEventListener('click', runAiSearch);
  aiSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runAiSearch(); }
  });

  // ─── Filter wiring ───
  qInput.addEventListener('input', debounce(() => {
    state.q = qInput.value.trim();
    loadEvents();
  }, 300));
  cardFilter.addEventListener('change', () => { state.cardId = cardFilter.value; loadEvents(); });
  pmFilter.addEventListener('change', () => { state.pmId = pmFilter.value; loadEvents(); });
  statusChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      statusChips.forEach((b) => b.classList.remove('bg-brand-600', 'text-white'));
      statusChips.forEach((b) => b.classList.add('border', 'border-slate-300', 'text-slate-600'));
      btn.classList.remove('border', 'border-slate-300', 'text-slate-600');
      btn.classList.add('bg-brand-600', 'text-white');
      state.status = btn.dataset.status;
      loadEvents();
    });
  });

  if (groupBySelect) groupBySelect.value = state.groupBy;
  if (sortBySelect) sortBySelect.value = state.sortBy;
  groupBySelect?.addEventListener('change', () => {
    state.groupBy = groupBySelect.value;
    localStorage.setItem(GROUP_BY_STORAGE_KEY, state.groupBy);
    renderEventsList(state.events);
  });
  sortBySelect?.addEventListener('change', () => {
    state.sortBy = sortBySelect.value;
    localStorage.setItem(SORT_BY_STORAGE_KEY, state.sortBy);
    renderEventsList(state.events);
  });

  // ─── Event modal ───
  function openEventModal(ev) {
    eventForm.reset();
    A.showError(eventFormError, '');
    state.selectedCardIds = new Set();
    state.selectedPmIds = new Set();

    if (ev) {
      eventModalTitle.textContent = '編輯回饋活動';
      eventForm.id.value = ev.id;
      eventForm.title.value = ev.title || '';
      eventForm.startDate.value = ev.startDate || '';
      eventForm.endDate.value = ev.endDate || '';
      eventForm.cycleType.value = ev.cycleType || 'none';
      eventForm.cycleAnchorDay.value = ev.cycleAnchorDay ?? '';
      eventForm.cashbackPercent.value = ev.cashbackPercent ?? '';
      eventForm.cashbackFixed.value = ev.cashbackFixed ?? '';
      eventForm.rewardType.value = ev.rewardType || 'cash';
      eventForm.maxReward.value = ev.maxReward ?? '';
      eventForm.minimumSpend.value = ev.minimumSpend ?? '';
      eventForm.sourceUrl.value = ev.sourceUrl || '';
      eventForm.description.value = ev.description || '';
      eventForm.matchUnspecifiedPayment.checked = !!ev.matchUnspecifiedPayment;
      eventForm.requireMerchantMatch.checked = !!ev.requireMerchantMatch;
      eventForm.merchantKeywords.value = ev.merchantKeywords || '';
      (ev.cards || []).forEach((c) => state.selectedCardIds.add(c.id));
      (ev.paymentMethods || []).forEach((p) => state.selectedPmIds.add(p.id));
      deleteEventBtn.classList.remove('hidden');
    } else {
      eventModalTitle.textContent = '新增回饋活動';
      eventForm.id.value = '';
      deleteEventBtn.classList.add('hidden');
    }

    updateCycleUI();
    updateMerchantKeywordsUI();

    cardChipsBox.innerHTML = '';
    pmChipsBox.innerHTML = '';
    if (!state.cards.length) {
      cardChipsBox.innerHTML = `<span class="text-xs text-slate-400">尚無卡片，<a class="underline text-brand-600" href="${A.url('/tags')}">前往新增</a></span>`;
    }
    if (!state.pms.length) {
      pmChipsBox.innerHTML = `<span class="text-xs text-slate-400">尚無支付方式，<a class="underline text-brand-600" href="${A.url('/tags')}">前往新增</a></span>`;
    }
    state.cards.forEach((c) => chipButton(cardChipsBox, c, state.selectedCardIds));
    state.pms.forEach((p) => chipButton(pmChipsBox, p, state.selectedPmIds));

    A.openModal('eventModal');
  }

  newEventBtn?.addEventListener('click', () => openEventModal(null));

  eventForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = eventForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(eventFormError, '');
    try {
      const data = {
        title: eventForm.title.value,
        startDate: eventForm.startDate.value || null,
        endDate: eventForm.endDate.value || null,
        cycleType: eventForm.cycleType.value || 'none',
        cycleAnchorDay: eventForm.cycleAnchorDay.value || null,
        cashbackPercent: eventForm.cashbackPercent.value || null,
        cashbackFixed: eventForm.cashbackFixed.value || null,
        rewardType: eventForm.rewardType.value,
        maxReward: eventForm.maxReward.value || null,
        minimumSpend: eventForm.minimumSpend.value || null,
        sourceUrl: eventForm.sourceUrl.value || null,
        description: eventForm.description.value || null,
        matchUnspecifiedPayment: !!eventForm.matchUnspecifiedPayment.checked,
        requireMerchantMatch: !!eventForm.requireMerchantMatch.checked,
        merchantKeywords: eventForm.merchantKeywords.value || null,
        cardIds: Array.from(state.selectedCardIds),
        paymentMethodIds: Array.from(state.selectedPmIds)
      };
      const id = eventForm.id.value;
      if (id) {
        await A.jsonFetch(A.api(`/cashback/${id}`), { method: 'PUT', body: data });
      } else {
        await A.jsonFetch(A.api('/cashback'), { method: 'POST', body: data });
      }
      A.closeModal('eventModal');
      await loadEvents();
    } catch (err) {
      A.showError(eventFormError, err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deleteEventBtn?.addEventListener('click', async () => {
    const id = eventForm.id.value;
    if (!id) return;
    if (!confirm('確定刪除此活動？')) return;
    try {
      await A.jsonFetch(A.api(`/cashback/${id}`), { method: 'DELETE' });
      A.closeModal('eventModal');
      await loadEvents();
    } catch (err) {
      A.showError(eventFormError, err.message);
    }
  });

  // ─── AI ───
  aiParseBtn?.addEventListener('click', () => {
    aiInput.value = '';
    aiPreview.classList.add('hidden');
    aiPreview.textContent = '';
    A.showError(aiError, '');
    aiApplyBtn.disabled = true;
    state.aiResult = null;
    A.openModal('aiModal');
  });

  aiAnalyzeBtn?.addEventListener('click', async () => {
    const text = aiInput.value.trim();
    if (!text) { A.showError(aiError, '請貼上活動原文'); return; }
    A.setLoading(aiAnalyzeBtn, true);
    A.showError(aiError, '');
    try {
      const data = await A.jsonFetch(A.api('/ai/parse-event'), {
        method: 'POST', body: { text, model: state.aiModel || undefined }
      });
      state.aiResult = data;
      aiPreview.classList.remove('hidden');
      aiPreview.textContent = JSON.stringify(data, null, 2);
      aiApplyBtn.disabled = false;
    } catch (err) {
      A.showError(aiError, err.message);
      aiApplyBtn.disabled = true;
    } finally {
      A.setLoading(aiAnalyzeBtn, false);
    }
  });

  aiApplyBtn?.addEventListener('click', () => {
    if (!state.aiResult) return;
    A.closeModal('aiModal');
    openEventModal(null);

    const r = state.aiResult;
    eventForm.title.value = r.title || '';
    eventForm.startDate.value = r.startDate || '';
    eventForm.endDate.value = r.endDate || '';
    eventForm.cashbackPercent.value = r.cashbackPercent ?? '';
    eventForm.cashbackFixed.value = r.cashbackFixed ?? '';
    eventForm.rewardType.value = ['point', 'cash', 'coupon', 'other'].includes(r.rewardType) ? r.rewardType : 'cash';
    eventForm.maxReward.value = r.maxReward ?? '';
    eventForm.minimumSpend.value = r.minimumSpend ?? '';
    eventForm.sourceUrl.value = r.sourceUrl || '';
    eventForm.description.value = r.description || '';
    eventForm.cycleType.value = ['none', 'weekly', 'biweekly', 'monthly'].includes(r.cycleType) ? r.cycleType : 'none';
    eventForm.cycleAnchorDay.value = r.cycleAnchorDay ?? '';
    eventForm.matchUnspecifiedPayment.checked = !!r.matchUnspecifiedPayment;
    const aiKeywords = Array.isArray(r.merchantKeywords) ? r.merchantKeywords.filter(Boolean) : [];
    eventForm.requireMerchantMatch.checked = !!r.requireMerchantMatch && aiKeywords.length > 0;
    eventForm.merchantKeywords.value = aiKeywords.join('\n');
    updateCycleUI();
    updateMerchantKeywordsUI();

    // Best-effort fuzzy match cardNames / paymentMethodNames against existing tags
    const lower = (s) => String(s || '').toLowerCase().trim();
    for (const cn of (r.cardNames || [])) {
      const found = state.cards.find((c) => lower(c.name).includes(lower(cn)) || lower(cn).includes(lower(c.name)));
      if (found) state.selectedCardIds.add(found.id);
    }
    for (const pn of (r.paymentMethodNames || [])) {
      const found = state.pms.find((p) => lower(p.name).includes(lower(pn)) || lower(pn).includes(lower(p.name)));
      if (found) state.selectedPmIds.add(found.id);
    }
    // refresh chips
    cardChipsBox.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('chip-active', state.selectedCardIds.has(parseInt(btn.dataset.id, 10)));
    });
    pmChipsBox.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('chip-active', state.selectedPmIds.has(parseInt(btn.dataset.id, 10)));
    });
  });

  // Boot
  loadTags().then(loadEvents);
  loadAiModels();
})();
