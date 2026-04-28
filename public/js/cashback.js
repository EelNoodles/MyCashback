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

  // AI
  const aiInput = document.getElementById('aiInput');
  const aiPreview = document.getElementById('aiPreview');
  const aiError = document.getElementById('aiError');
  const aiAnalyzeBtn = document.getElementById('aiAnalyzeBtn');
  const aiApplyBtn = document.getElementById('aiApplyBtn');

  let state = {
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

  // ----- Renderers -----
  function eventCardEl(ev) {
    const card = document.createElement('div');
    card.className = 'card p-4';
    const today = new Date().toISOString().slice(0, 10);
    const isExpired = ev.endDate && ev.endDate < today;
    const daysLeft = ev.endDate ? Math.ceil((new Date(ev.endDate) - new Date(today)) / 86400000) : null;
    const left = isExpired ? '已結束'
      : (daysLeft === null ? '無期限'
        : daysLeft === 0 ? '今天最後一天' : `剩 ${daysLeft} 天`);

    const reward = ev.cashbackPercent
      ? `${ev.cashbackPercent}% 回饋`
      : (ev.cashbackFixed ? `+${A.fmtNumber(ev.cashbackFixed)}` : '—');

    const cardChips = (ev.cards || []).map((c) => `<span class="chip">💳 ${c.name}</span>`).join('');
    const pmChips = (ev.paymentMethods || []).map((p) => `<span class="chip">💸 ${p.name}</span>`).join('');

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-medium truncate">${ev.title}</div>
          <div class="text-xs text-slate-500 mt-0.5">${A.fmtDateOnly(ev.startDate)} ~ ${A.fmtDateOnly(ev.endDate)}</div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="text-base font-semibold text-brand-600">${reward}</div>
          <div class="text-[10px] ${isExpired ? 'text-rose-500' : 'text-slate-400'} mt-1">${left}</div>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-1">${cardChips}${pmChips}</div>
      <div class="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div><span class="text-slate-400">最低門檻：</span>${ev.minimumSpend != null ? A.fmtNumber(ev.minimumSpend) : '—'}</div>
        <div><span class="text-slate-400">回饋上限：</span>${ev.maxReward != null ? A.fmtNumber(ev.maxReward) : '—'}</div>
        <div class="text-right">
          <button class="text-brand-600 hover:underline" data-edit="${ev.id}">編輯</button>
        </div>
      </div>`;
    card.querySelector('[data-edit]').addEventListener('click', () => openEventModal(ev));
    return card;
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

  // ----- Loaders -----
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

  // ----- Filter wiring -----
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

  // ----- Event modal -----
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

  // ----- AI -----
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
