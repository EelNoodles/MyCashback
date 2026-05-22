(function () {
  'use strict';
  const A = window.App;

  const listEl = document.getElementById('eventsList');
  const qInput = document.getElementById('qInput');
  const cardFilter = document.getElementById('cardFilter');
  const pmFilter = document.getElementById('pmFilter');
  const statusChips = document.querySelectorAll('.status-chip');

  const newEventBtn = document.getElementById('newEventBtn');
  const aiParseBtn = document.getElementById('aiParseBtn');

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

  let state = {
    mode: 'normal',
    status: 'active',
    q: '',
    cardId: '',
    pmId: '',
    cards: [],
    pms: [],
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
      listEl.innerHTML = '';
      if (!events.length) {
        listEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full">沒有符合條件的活動</div>`;
        return;
      }
      for (const ev of events) listEl.appendChild(eventCardEl(ev));
    } catch (err) {
      listEl.innerHTML = `<div class="text-sm text-rose-500 col-span-full">載入失敗：${err.message}</div>`;
    }
  }

  // ─── AI search ───
  function aiRecCardEl(rec, rank, refMap) {
    const card = document.createElement('div');
    card.className = 'card p-4 col-span-full md:col-span-1';

    const cautions = (rec.cautions || []).map((c) =>
      `<li class="flex gap-1.5"><span class="text-amber-500 flex-shrink-0">⚠</span><span>${escapeHtml(c)}</span></li>`
    ).join('');

    const refs = (rec.eventIds || []).map((id) => refMap.get(id)).filter(Boolean);
    const refHtml = refs.map((r) => r.sourceUrl
      ? `<a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline">🔗 ${escapeHtml(r.title)}</a>`
      : `<span class="text-[11px] text-slate-500">📋 ${escapeHtml(r.title)}</span>`
    ).join('');

    const checkBtn = rec.checkUrl
      ? `<a href="${escapeHtml(rec.checkUrl)}" target="_blank" rel="noopener" class="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white hover:bg-brand-700">前往查看 / 確認名額 →</a>`
      : '';

    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-7 h-7 rounded-full bg-brand-600 text-white text-sm font-semibold grid place-items-center">${rank}</div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold">${escapeHtml(rec.title)}</div>
          ${rec.rewardText ? `<div class="text-brand-600 font-semibold text-sm mt-0.5">${escapeHtml(rec.rewardText)}</div>` : ''}
        </div>
      </div>
      ${rec.reason ? `<p class="text-sm text-slate-600 mt-2 whitespace-pre-wrap">${escapeHtml(rec.reason)}</p>` : ''}
      ${cautions ? `<ul class="mt-2 space-y-1 text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg p-2">${cautions}</ul>` : ''}
      ${refHtml ? `<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1">${refHtml}</div>` : ''}
      ${checkBtn}`;
    return card;
  }

  function renderAiResults(data) {
    listEl.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'col-span-full';
    const cachedTag = data.cached
      ? '<span class="ml-2 text-[10px] text-slate-400">· 快取結果</span>' : '';
    top.innerHTML = `<div class="text-sm text-slate-700 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">✨ ${escapeHtml(data.summary || '')}${cachedTag}</div>`;
    listEl.appendChild(top);

    const recs = data.recommendations || [];
    if (!recs.length) {
      const empty = document.createElement('div');
      empty.className = 'text-sm text-slate-400 col-span-full';
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
        body: { query, web: !!(aiWebToggle && aiWebToggle.checked) }
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
      (ev.cards || []).forEach((c) => state.selectedCardIds.add(c.id));
      (ev.paymentMethods || []).forEach((p) => state.selectedPmIds.add(p.id));
      deleteEventBtn.classList.remove('hidden');
    } else {
      eventModalTitle.textContent = '新增回饋活動';
      eventForm.id.value = '';
      deleteEventBtn.classList.add('hidden');
    }

    updateCycleUI();

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
        method: 'POST', body: { text }
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
})();
