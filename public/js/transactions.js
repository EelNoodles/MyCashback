(function () {
  'use strict';
  const A = window.App;

  const txnList = document.getElementById('txnList');
  const pager = document.getElementById('pager');
  const qInput = document.getElementById('qInput');
  const cardFilter = document.getElementById('cardFilter');
  const pmFilter = document.getElementById('pmFilter');
  const sourceFilter = document.getElementById('sourceFilter');
  const newTxnBtn = document.getElementById('newTxnBtn');
  const apiKeysBtn = document.getElementById('apiKeysBtn');

  const txnForm = document.getElementById('txnForm');
  const txnFormError = document.getElementById('txnFormError');
  const txnModalTitle = document.getElementById('txnModalTitle');
  const deleteTxnBtn = document.getElementById('deleteTxnBtn');

  const apiKeysList = document.getElementById('apiKeysList');
  const apiKeysEmpty = document.getElementById('apiKeysEmpty');
  const apiKeysError = document.getElementById('apiKeysError');
  const newTokenBox = document.getElementById('newTokenBox');
  const newTokenValue = document.getElementById('newTokenValue');
  const copyTokenBtn = document.getElementById('copyTokenBtn');
  const apiKeyAddForm = document.getElementById('apiKeyAddForm');
  const apiKeyAddError = document.getElementById('apiKeyAddError');

  const SOURCE_LABELS = { api: 'API 回報', manual: '手動' };

  let state = {
    cards: [],
    pms: [],
    q: '',
    cardId: '',
    pmId: '',
    source: '',
    page: 1,
    pageSize: 50
  };

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
  function toLocalInputValue(iso) {
    const d = iso ? new Date(iso) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ─── Loaders ───
  async function loadTags() {
    const [cards, pms] = await Promise.all([
      A.jsonFetch(A.api('/tags/cards')),
      A.jsonFetch(A.api('/tags/payment-methods'))
    ]);
    state.cards = cards;
    state.pms = pms;

    cardFilter.innerHTML = '<option value="">全部</option>'
      + cards.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    pmFilter.innerHTML = '<option value="">全部</option><option value="none">未使用電子支付</option>'
      + pms.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

    txnForm.cardId.innerHTML = cards.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    txnForm.paymentMethodId.innerHTML = '<option value="">未使用電子支付</option>'
      + pms.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }

  function rewardLabel(ev) {
    if (ev.cashbackPercent != null) {
      return `${ev.cashbackPercent}% 回饋` + (ev.maxReward != null ? `，上限 NT$${A.fmtNumber(ev.maxReward)}` : '');
    }
    if (ev.cashbackFixed != null) {
      return `+${A.fmtNumber(ev.cashbackFixed)}` + (ev.maxReward != null ? `，上限 NT$${A.fmtNumber(ev.maxReward)}` : '');
    }
    return '';
  }

  // Card-based row (not a <table>) so it stays readable on a phone screen:
  // the card used and payment method are shown as clear badges up top, and
  // matched cashback campaigns as chips below, instead of cramming everything
  // into narrow table columns that force horizontal scrolling.
  function txnCardEl(t) {
    const div = document.createElement('div');
    div.className = 'px-4 py-3 hover:bg-slate-50 cursor-pointer active:bg-slate-100';

    const cardChip = t.card
      ? (t.card.imageUrl
        ? `<span class="credit-card-mini"><img class="credit-card-mini__img" src="${A.url(t.card.imageUrl)}" alt="" />${escapeHtml(t.card.name)}</span>`
        : `<span class="credit-card-mini">💳 ${escapeHtml(t.card.name)}</span>`)
      : `<span class="credit-card-mini" style="background:#94a3b8">已刪除的卡片</span>`;

    const pmChip = t.paymentMethod
      ? (t.paymentMethod.imageUrl
        ? `<span class="pm-badge"><img class="pm-badge__img" src="${A.url(t.paymentMethod.imageUrl)}" alt="" />${escapeHtml(t.paymentMethod.name)}</span>`
        : `<span class="pm-badge">💸 ${escapeHtml(t.paymentMethod.name)}</span>`)
      : `<span class="pm-badge text-slate-400">未使用電子支付</span>`;

    const events = t.matchedEvents || [];
    const eventsHtml = events.length
      ? events.map((ev) => `<span class="chip chip-active" title="${escapeHtml(rewardLabel(ev))}">🎁 ${escapeHtml(ev.title)}</span>`).join('')
      : '<span class="text-[11px] text-slate-400">未符合任何回饋活動</span>';

    div.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">${cardChip}${pmChip}</div>
          <div class="text-xs text-slate-500 mt-1.5">${A.fmtDate(t.transactionAt)}${t.note ? ' · ' + escapeHtml(t.note) : ''}</div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="text-base font-semibold text-slate-800">NT$${A.fmtNumber(t.amount)}</div>
          <div class="text-[10px] mt-0.5 inline-block px-1.5 py-0.5 rounded-full ${t.source === 'manual' ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-700'}">${SOURCE_LABELS[t.source] || t.source}</div>
        </div>
      </div>
      <div class="mt-2 flex flex-wrap gap-1">${eventsHtml}</div>`;
    div.addEventListener('click', () => openTxnModal(t));
    return div;
  }

  async function loadTxns() {
    txnList.innerHTML = '<div class="px-4 py-6 text-center text-slate-400 text-sm">載入中…</div>';
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.cardId) params.set('cardId', state.cardId);
    if (state.pmId) params.set('paymentMethodId', state.pmId);
    if (state.source) params.set('source', state.source);
    params.set('page', state.page);
    params.set('pageSize', state.pageSize);
    try {
      const data = await A.jsonFetch(A.api('/transactions?' + params.toString()));
      const items = data.items || [];
      txnList.innerHTML = '';
      if (!items.length) {
        txnList.innerHTML = '<div class="px-4 py-6 text-center text-slate-400 text-sm">沒有符合條件的交易紀錄</div>';
      } else {
        items.forEach((t) => txnList.appendChild(txnCardEl(t)));
      }
      const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
      pager.innerHTML = `
        <span>共 ${A.fmtNumber(data.total)} 筆</span>
        <div class="flex items-center gap-2">
          <button id="prevPageBtn" class="px-2 py-1 rounded border border-slate-300 disabled:opacity-40" ${state.page <= 1 ? 'disabled' : ''}>上一頁</button>
          <span>${state.page} / ${totalPages}</span>
          <button id="nextPageBtn" class="px-2 py-1 rounded border border-slate-300 disabled:opacity-40" ${state.page >= totalPages ? 'disabled' : ''}>下一頁</button>
        </div>`;
      document.getElementById('prevPageBtn')?.addEventListener('click', () => { state.page--; loadTxns(); });
      document.getElementById('nextPageBtn')?.addEventListener('click', () => { state.page++; loadTxns(); });
    } catch (err) {
      txnList.innerHTML = `<div class="px-4 py-6 text-center text-rose-500 text-sm">載入失敗：${escapeHtml(err.message)}</div>`;
    }
  }

  // ─── Filter wiring ───
  qInput.addEventListener('input', debounce(() => { state.q = qInput.value.trim(); state.page = 1; loadTxns(); }, 300));
  cardFilter.addEventListener('change', () => { state.cardId = cardFilter.value; state.page = 1; loadTxns(); });
  pmFilter.addEventListener('change', () => { state.pmId = pmFilter.value; state.page = 1; loadTxns(); });
  sourceFilter.addEventListener('change', () => { state.source = sourceFilter.value; state.page = 1; loadTxns(); });

  // ─── Transaction modal ───
  function openTxnModal(t) {
    txnForm.reset();
    A.showError(txnFormError, '');
    if (t) {
      txnModalTitle.textContent = '編輯交易';
      txnForm.id.value = t.id;
      txnForm.cardId.value = t.cardId;
      txnForm.paymentMethodId.value = t.paymentMethodId || '';
      txnForm.amount.value = t.amount;
      txnForm.transactionAt.value = toLocalInputValue(t.transactionAt);
      txnForm.note.value = t.note || '';
      deleteTxnBtn.classList.remove('hidden');
    } else {
      txnModalTitle.textContent = '手動新增交易';
      txnForm.id.value = '';
      txnForm.transactionAt.value = toLocalInputValue(new Date());
      deleteTxnBtn.classList.add('hidden');
    }
    A.openModal('txnModal');
  }

  newTxnBtn?.addEventListener('click', () => openTxnModal(null));

  txnForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = txnForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(txnFormError, '');
    try {
      const data = {
        cardId: Number(txnForm.cardId.value),
        paymentMethodId: txnForm.paymentMethodId.value ? Number(txnForm.paymentMethodId.value) : null,
        amount: Number(txnForm.amount.value),
        transactionAt: new Date(txnForm.transactionAt.value).toISOString(),
        note: txnForm.note.value || null
      };
      const id = txnForm.id.value;
      if (id) {
        await A.jsonFetch(A.api(`/transactions/${id}`), { method: 'PUT', body: data });
      } else {
        await A.jsonFetch(A.api('/transactions'), { method: 'POST', body: data });
      }
      A.closeModal('txnModal');
      await loadTxns();
    } catch (err) {
      A.showError(txnFormError, err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deleteTxnBtn?.addEventListener('click', async () => {
    const id = txnForm.id.value;
    if (!id) return;
    if (!confirm('確定刪除此筆交易紀錄？')) return;
    try {
      await A.jsonFetch(A.api(`/transactions/${id}`), { method: 'DELETE' });
      A.closeModal('txnModal');
      await loadTxns();
    } catch (err) {
      A.showError(txnFormError, err.message);
    }
  });

  // ─── API key management ───
  function apiKeyRowEl(k) {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-3 rounded-xl border border-slate-200 p-3' + (!k.isActive ? ' opacity-50' : '');
    li.dataset.id = k.id;
    li.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="font-medium text-sm truncate">${escapeHtml(k.name)}${!k.isActive ? '（已停用）' : ''}</div>
        <div class="text-[11px] text-slate-500 font-mono">${escapeHtml(k.keyMask)}</div>
        <div class="text-[10px] text-slate-400">${k.lastUsedAt ? '最後使用：' + A.fmtDate(k.lastUsedAt) : '尚未使用'}</div>
      </div>
      <button type="button" data-action="toggle" class="text-xs text-slate-500 hover:text-slate-700">${k.isActive ? '停用' : '啟用'}</button>
      <button type="button" data-action="delete" class="text-xs text-rose-600 hover:text-rose-700">刪除</button>
    `;
    return li;
  }

  function renderApiKeys(keys) {
    apiKeysList.innerHTML = '';
    if (!keys.length) {
      apiKeysEmpty.classList.remove('hidden');
      return;
    }
    apiKeysEmpty.classList.add('hidden');
    keys.forEach((k) => apiKeysList.appendChild(apiKeyRowEl(k)));
  }

  async function loadApiKeys() {
    A.showError(apiKeysError, '');
    try {
      const keys = await A.jsonFetch(A.api('/transactions/api-keys'));
      renderApiKeys(keys);
    } catch (err) {
      A.showError(apiKeysError, '載入失敗：' + err.message);
    }
  }

  apiKeysBtn?.addEventListener('click', () => {
    A.showError(apiKeyAddError, '');
    newTokenBox.classList.add('hidden');
    apiKeyAddForm.reset();
    loadApiKeys();
    A.openModal('apiKeysModal');
  });

  apiKeysList?.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    A.showError(apiKeysError, '');
    try {
      if (action === 'toggle') {
        const isActive = li.classList.contains('opacity-50');
        await A.jsonFetch(A.api(`/transactions/api-keys/${id}`), { method: 'PUT', body: { isActive } });
        await loadApiKeys();
      } else if (action === 'delete') {
        if (!confirm('確定刪除這把金鑰？使用此金鑰的呼叫將立即失效。')) return;
        await A.jsonFetch(A.api(`/transactions/api-keys/${id}`), { method: 'DELETE' });
        await loadApiKeys();
      }
    } catch (err) {
      A.showError(apiKeysError, err.message);
    }
  });

  apiKeyAddForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = apiKeyAddForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(apiKeyAddError, '');
    try {
      const created = await A.jsonFetch(A.api('/transactions/api-keys'), {
        method: 'POST',
        body: { name: apiKeyAddForm.name.value }
      });
      apiKeyAddForm.reset();
      newTokenValue.textContent = created.token;
      newTokenBox.classList.remove('hidden');
      await loadApiKeys();
    } catch (err) {
      A.showError(apiKeyAddError, err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  copyTokenBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(newTokenValue.textContent);
      copyTokenBtn.textContent = '已複製';
      setTimeout(() => { copyTokenBtn.textContent = '複製'; }, 1500);
    } catch (_) { /* clipboard unavailable, user can select manually */ }
  });

  // Boot
  loadTags().then(loadTxns);
})();
