(function () {
  'use strict';
  const A = window.App;
  const { esc, icon } = A;
  const F = A.fmt;
  const $ = (id) => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const state = {
    q: '', range: '', from: '', to: '', cardId: '', pmId: '', minAmount: '', maxAmount: '', source: '',
    page: 1, pageSize: 30, items: [], total: 0, seq: 0,
    cards: [], pms: [],
    pick: { card: null, pm: null }
  };

  const RANGE_LABEL = { '': '全部交易', thisMonth: '本月', lastMonth: '上月', last30: '近 30 天', custom: '自訂期間' };

  function rangeDates(range) {
    const n = new Date();
    if (range === 'thisMonth') return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)];
    if (range === 'lastMonth') return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)];
    if (range === 'last30') return [new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29), n];
    return null;
  }
  function dayStartIso(v) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); }
  function dayEndIso(v) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString(); }

  function query() {
    const qs = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
    if (state.q) qs.set('q', state.q);
    if (state.cardId) qs.set('cardId', state.cardId);
    if (state.pmId) qs.set('paymentMethodId', state.pmId);
    if (state.source) qs.set('source', state.source);
    if (state.minAmount) qs.set('minAmount', state.minAmount);
    if (state.maxAmount) qs.set('maxAmount', state.maxAmount);
    if (state.from) qs.set('from', dayStartIso(state.from));
    if (state.to) qs.set('to', dayEndIso(state.to));
    return qs;
  }

  function txnRow(t) {
    const events = (t.matchedEvents || []).map((ev) => `<span class="badge badge-green">${icon('gift', 'i-sm')}<span class="truncate">${esc(ev.title)}</span>${ev.estimatedReward ? `<span class="shrink-0">≈${F.num(ev.estimatedReward)}</span>` : ''}</span>`).join('');
    return `<button type="button" class="row row-tap w-full text-left" data-txn="${t.id}">
      ${A.avatar(t.note || (t.card && t.card.name) || '?', null, '!h-10 !w-10 !rounded-full !text-xs')}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[15px] font-semibold">${esc(t.note || '（未填商家）')}</span>
        <span class="mt-0.5 flex flex-wrap items-center gap-1 text-[12px] muted">${esc(t.card ? t.card.name : '已刪除的卡片')}${t.paymentMethod ? ` · ${esc(t.paymentMethod.name)}` : ''} · ${F.time(t.transactionAt)}${t.source === 'api' ? ' · API' : ''}${t.latitude != null ? ` ${icon('pin', 'i-sm !h-3 !w-3')}` : ''}</span>
        ${events ? `<span class="mt-1.5 flex flex-wrap gap-1">${events}</span>` : ''}
      </span>
      <span class="shrink-0 text-right text-[15px] font-bold money">${F.money(t.amount)}</span>
    </button>`;
  }

  function render() {
    const box = $('txnList');
    if (!state.items.length) {
      const filtered = state.q || state.cardId || state.pmId || state.from || state.to || state.minAmount || state.maxAmount || state.source;
      box.innerHTML = `<div class="card">${A.emptyState('receipt', filtered ? '沒有符合條件的交易' : '還沒有交易紀錄', filtered ? '' : '手動記一筆，或在設定建立 API 金鑰讓記帳 App 自動回報', `<button class="btn btn-primary btn-sm" data-new-txn>${icon('plus', 'i-sm')}記一筆</button>`)}</div>`;
      $('moreBtn').hidden = true;
      return;
    }
    const days = new Map();
    for (const t of state.items) {
      const k = F.dayKey(t.transactionAt);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(t);
    }
    box.innerHTML = Array.from(days.entries()).map(([k, list]) => `
      <section>
        <h2 class="mb-1.5 flex items-center justify-between px-1 text-[13px] font-semibold muted"><span>${esc(F.dayLabel(k))}</span><span class="money">${F.money(list.reduce((s, t) => s + Number(t.amount), 0))}</span></h2>
        <div class="card overflow-hidden"><div class="list">${list.map(txnRow).join('')}</div></div>
      </section>`).join('');
    $('moreBtn').hidden = state.items.length >= state.total;
  }

  async function load(reset = true) {
    const seq = ++state.seq;
    if (reset) {
      state.page = 1;
      $('txnList').innerHTML = A.skeletonRows(4, 'h-16');
    }
    const syncFilterDot = () => { $('filterDot').hidden = !(state.cardId || state.pmId || state.minAmount || state.maxAmount || state.source || (state.range === 'custom')); };
    syncFilterDot();
    try {
      const d = await A.get('/transactions?' + query());
      if (seq !== state.seq) return;
      state.items = reset ? d.items : state.items.concat(d.items);
      state.total = d.total;
      $('summaryLabel').textContent = RANGE_LABEL[state.range] + (state.q || state.cardId || state.pmId ? '（已篩選）' : '');
      $('summaryTotal').textContent = F.money(d.summary.totalAmount);
      $('summaryCount').textContent = `${F.num(d.summary.count)} 筆`;
      render();
    } catch (err) {
      if (seq !== state.seq) return;
      $('txnList').innerHTML = `<div class="card">${A.errorState(err, 'retryTxn')}</div>`;
      const r = $('retryTxn');
      if (r) r.onclick = () => load(true);
    }
  }

  // Filters
  $('qInput').addEventListener('input', A.debounce(() => { state.q = $('qInput').value.trim(); load(); }, 300));
  $('rangeChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    state.range = b.dataset.range;
    A.setPressed($('rangeChips'), '[data-range]', state.range, 'range');
    if (state.range === 'custom') { A.sheet.open('filterSheet'); return; }
    const r = rangeDates(state.range);
    state.from = r ? F.inputDate(r[0]) : '';
    state.to = r ? F.inputDate(r[1]) : '';
    load();
  });
  $('filterBtn').addEventListener('click', () => {
    $('fFrom').value = state.from; $('fTo').value = state.to;
    A.sheet.open('filterSheet');
  });
  $('fApply').addEventListener('click', () => {
    if ($('fFrom').value && $('fTo').value && $('fFrom').value > $('fTo').value) { A.toast('起始日期不可晚於結束日期', { type: 'error' }); return; }
    Object.assign(state, {
      cardId: $('fCard').value, pmId: $('fPm').value, source: $('fSource').value,
      minAmount: $('fMin').value, maxAmount: $('fMax').value, from: $('fFrom').value, to: $('fTo').value
    });
    if (state.from || state.to) {
      const preset = Object.keys(RANGE_LABEL).find((k) => { const r = rangeDates(k); return r && F.inputDate(r[0]) === state.from && F.inputDate(r[1]) === state.to; });
      state.range = preset || 'custom';
    } else state.range = '';
    A.setPressed($('rangeChips'), '[data-range]', state.range, 'range');
    A.sheet.close('filterSheet');
    load();
  });
  $('fReset').addEventListener('click', () => {
    ['fCard', 'fPm', 'fSource', 'fMin', 'fMax', 'fFrom', 'fTo'].forEach((id) => { $(id).value = ''; });
    Object.assign(state, { cardId: '', pmId: '', source: '', minAmount: '', maxAmount: '', from: '', to: '', range: '' });
    A.setPressed($('rangeChips'), '[data-range]', '', 'range');
    A.sheet.close('filterSheet');
    load();
  });
  $('moreBtn').addEventListener('click', async () => {
    state.page += 1;
    A.setLoading($('moreBtn'), true);
    await load(false);
    A.setLoading($('moreBtn'), false);
  });

  // ─── Form ───
  const form = $('txnForm');
  function renderPickers() {
    $('cardPick').innerHTML = state.cards.length
      ? state.cards.map((c) => `<button type="button" class="chip" data-card="${c.id}" aria-pressed="${state.pick.card === c.id}">${c.imageUrl ? `<img class="chip-img" src="${esc(A.asset(c.imageUrl))}" alt="">` : `<span class="pay-dot" style="background:${esc(c.color || '#94a3b8')}"></span>`}${esc(c.name)}</button>`).join('')
      : `<a class="text-sm text-brand-600 underline" href="${A.url('/tags')}">先新增卡片</a>`;
    $('pmPick').innerHTML = `<button type="button" class="chip" data-pm="" aria-pressed="${state.pick.pm == null}">直接刷卡</button>`
      + state.pms.map((p) => `<button type="button" class="chip" data-pm="${p.id}" aria-pressed="${state.pick.pm === p.id}">${p.imageUrl ? `<img class="chip-img" src="${esc(A.asset(p.imageUrl))}" alt="">` : ''}${esc(p.name)}</button>`).join('');
  }
  form.addEventListener('click', (e) => {
    const c = e.target.closest('[data-card]');
    const p = e.target.closest('[data-pm]');
    if (c) { state.pick.card = Number(c.dataset.card); A.setPressed($('cardPick'), '[data-card]', state.pick.card, 'card'); }
    if (p) { state.pick.pm = p.dataset.pm ? Number(p.dataset.pm) : null; A.setPressed($('pmPick'), '[data-pm]', p.dataset.pm, 'pm'); }
  });

  function openForm(t) {
    form.reset();
    A.showError($('txnError'), '');
    form.id.value = t ? t.id : '';
    $('txnTitle').textContent = t ? '編輯交易' : '記一筆';
    $('deleteTxnBtn').hidden = !t;
    const last = A.store.get('lastPick', {});
    state.pick.card = t ? t.cardId : (state.cards.some((c) => c.id === last.card) ? last.card : (state.cards[0] && state.cards[0].id) || null);
    state.pick.pm = t ? t.paymentMethodId : (state.pms.some((p) => p.id === last.pm) ? last.pm : null);
    renderPickers();
    form.amount.value = t ? Number(t.amount) : '';
    form.note.value = t ? t.note || '' : '';
    form.transactionAt.value = F.inputDateTime(t ? t.transactionAt : new Date());
    form.transactionAt.dataset.initial = form.transactionAt.value;
    form.latitude.value = t && t.latitude != null ? t.latitude : '';
    form.longitude.value = t && t.longitude != null ? t.longitude : '';
    $('txnMatched').innerHTML = t && (t.matchedEvents || []).length
      ? `<div class="rounded-xl bg-emerald-50 p-3 text-[13px] text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><div class="font-semibold">計入的回饋活動</div><ul class="mt-1 space-y-0.5">${t.matchedEvents.map((ev) => `<li>• ${esc(ev.title)}${ev.estimatedReward ? `（這筆約 ${F.num(ev.estimatedReward)}）` : ''}</li>`).join('')}</ul></div>`
      : (t ? '<div class="text-[13px] muted">這筆沒有計入任何回饋活動</div>' : '');
    if (t && t.externalRef) $('txnMatched').insertAdjacentHTML('beforeend', `<div class="mt-2 text-[12px] muted">外部編號：${esc(t.externalRef)}</div>`);
    A.sheet.open('txnSheet');
    if (!t) setTimeout(() => form.amount.focus(), 150);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(Number(form.amount.value) > 0)) { A.showError($('txnError'), '請輸入大於 0 的金額'); return; }
    if (!state.pick.card) { A.showError($('txnError'), '請選擇卡片'); return; }
    const body = {
      cardId: state.pick.card,
      paymentMethodId: state.pick.pm,
      amount: Number(form.amount.value),
      note: form.note.value.trim() || null,
      transactionAt: !form.transactionAt.value || (!form.id.value && form.transactionAt.value === form.transactionAt.dataset.initial)
        ? new Date().toISOString()
        : (form.transactionAt.value === form.transactionAt.dataset.initial ? undefined : new Date(form.transactionAt.value).toISOString()),
      latitude: form.latitude.value || null,
      longitude: form.longitude.value || null
    };
    const btn = $('saveTxnBtn');
    A.setLoading(btn, true, '儲存中');
    try {
      const id = form.id.value;
      const saved = id ? await A.send('PUT', `/transactions/${id}`, body) : await A.send('POST', '/transactions', body);
      A.store.set('lastPick', { card: body.cardId, pm: body.paymentMethodId });
      A.sheet.close('txnSheet');
      const n = (saved.matchedEvents || []).length;
      A.toast(id ? '已更新' : (n ? `已記錄，計入 ${n} 個回饋活動` : '已記錄（沒有符合的回饋活動）'));
      load();
    } catch (err) {
      A.showError($('txnError'), err.message);
    } finally { A.setLoading(btn, false); }
  });

  $('deleteTxnBtn').addEventListener('click', async () => {
    if (!(await A.confirm('刪除這筆交易？相關活動的使用量會重新計算。', { okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/transactions/${form.id.value}`);
      A.sheet.close('txnSheet');
      A.toast('已刪除');
      load();
    } catch (err) { A.showError($('txnError'), err.message); }
  });

  $('geoBtn').addEventListener('click', () => {
    const btn = $('geoBtn');
    if (!navigator.geolocation) { A.toast('此裝置不支援定位', { type: 'error' }); return; }
    A.setLoading(btn, true, '定位中');
    navigator.geolocation.getCurrentPosition((pos) => {
      form.latitude.value = pos.coords.latitude.toFixed(6);
      form.longitude.value = pos.coords.longitude.toFixed(6);
      A.setLoading(btn, false);
    }, (err) => {
      A.setLoading(btn, false);
      A.toast(err.code === 1 ? '未允許定位權限' : '無法取得位置', { type: 'error' });
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  $('txnList').addEventListener('click', (e) => {
    const r = e.target.closest('[data-txn]');
    if (r) openForm(state.items.find((t) => t.id === Number(r.dataset.txn)));
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-new-txn]')) openForm(null); });
  $('fab').addEventListener('click', () => openForm(null));
  $('newTxnBtnTop').addEventListener('click', () => openForm(null));

  async function boot() {
    A.setPressed($('rangeChips'), '[data-range]', '', 'range');
    try {
      const { cards, pms } = await A.loadTags();
      state.cards = cards;
      state.pms = pms;
      $('fCard').insertAdjacentHTML('beforeend', cards.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''));
      $('fPm').insertAdjacentHTML('beforeend', pms.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(''));
    } catch (_) { /* handled in pickers */ }
    await load();
    const notes = new Set(state.items.map((t) => t.note).filter(Boolean));
    $('noteList').innerHTML = Array.from(notes).slice(0, 60).map((n) => `<option value="${esc(n)}"></option>`).join('');
    if (params.get('new')) {
      openForm(null);
      params.delete('new');
      history.replaceState(history.state, '', location.pathname + (params.toString() ? '?' + params : ''));
    }
  }
  boot();
})();
