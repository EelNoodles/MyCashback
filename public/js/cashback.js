(function () {
  'use strict';
  const A = window.App;
  const { esc, icon } = A;
  const F = A.fmt;
  const $ = (id) => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const state = {
    tab: ['list', 'audit', 'ai'].includes(params.get('tab')) ? params.get('tab') : 'list',
    status: A.store.get('cb.status', 'ongoing'),
    q: '',
    cardId: '',
    pmId: '',
    sort: A.store.get('cb.sort', 'deadline'),
    group: A.store.get('cb.group', 'none'),
    events: [],
    cards: [],
    pms: [],
    range: 'cycle',
    audit: null,
    aiModels: [],
    aiModel: A.store.get('aiModel', ''),
    form: { cards: new Set(), pms: new Set(), mode: 'percent', scope: 'perTransaction' },
    seq: 0
  };

  const CYCLE_TEXT = { none: '整個活動期間', weekly: '每週', biweekly: '每兩週', monthly: '每月' };
  const WEEKDAY = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];
  const REASON = {
    excludedMerchant: (x) => `排除商家${x.keyword ? `「${x.keyword}」` : ''}`,
    merchantNotMatched: () => '非限定商家',
    belowMinimum: () => '未達單筆門檻'
  };

  // ─────────────────────────── Tabs ───────────────────────────
  function setTab(tab) {
    state.tab = tab;
    A.setPressed($('tabs'), '[data-tab]', tab, 'tab');
    ['list', 'audit', 'ai'].forEach((t) => { $(`tab-${t}`).hidden = t !== tab; });
    const qs = new URLSearchParams(location.search);
    if (tab === 'list') qs.delete('tab'); else qs.set('tab', tab);
    history.replaceState(history.state, '', location.pathname + (qs.toString() ? '?' + qs : ''));
    if (tab === 'audit') loadAudit();
    if (tab === 'ai' && !state.aiModels.length) loadModels();
  }
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });

  // ─────────────────────────── List ───────────────────────────
  function sortEvents(list) {
    const arr = list.slice();
    const rate = (e) => (e.cashbackPercent != null ? Number(e.cashbackPercent) : -1);
    if (state.sort === 'remaining') arr.sort((a, b) => ((b.usage && b.usage.remainingReward) || 0) - ((a.usage && a.usage.remainingReward) || 0));
    else if (state.sort === 'rate') arr.sort((a, b) => rate(b) - rate(a));
    else if (state.sort === 'title') arr.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hant'));
    return arr;
  }

  function timingBadge(ev) {
    const t = ev.timing || {};
    if (t.phase === 'upcoming') return `<span class="badge badge-brand">${t.daysUntilStart} 天後開始</span>`;
    if (t.phase === 'ended') return '<span class="badge badge-slate">已結束</span>';
    if (t.daysLeft != null && t.daysLeft <= 7) return `<span class="badge badge-rose">${esc(F.daysLeftText(t.daysLeft))}</span>`;
    if (t.cycle && t.cycle.daysLeft != null && !t.cycle.endsWithEvent) return `<span class="badge badge-slate">本期剩 ${t.cycle.daysLeft} 天</span>`;
    return `<span class="badge badge-slate">${esc(F.daysLeftText(t.daysLeft))}</span>`;
  }

  function usageBlock(ev, compact) {
    const u = ev.usage;
    if (!u) return '<div class="mt-3 text-[13px] muted">尚未綁定卡片，無法自動計算</div>';
    const rt = ev.rewardType;
    let html = '';
    if (u.cap != null) {
      const right = u.capReached
        ? '<span class="font-semibold text-emerald-600 dark:text-emerald-400">已滿額</span>'
        : (u.remainingCapAmount > 0 ? `<span class="muted">再刷 ${F.money(u.remainingCapAmount, { decimals: 0 })}</span>` : '');
      html = `<div class="mt-3">${A.progressBar(u.capUsedPercent)}
        <div class="mt-1.5 flex items-center justify-between gap-2 text-[13px]"><span>回饋 <b class="money">${F.reward(u.estimatedReward, rt)}</b> / ${F.reward(u.cap, rt)}</span>${right}</div></div>`;
    } else {
      html = `<div class="mt-3 flex items-center justify-between text-[13px]"><span class="muted">已刷 ${F.money(u.usedAmount, { decimals: 0 })}・${u.txnCount} 筆</span><span>回饋 <b class="money">${F.reward(u.estimatedReward, rt)}</b></span></div>`;
    }
    if (u.thresholdMet === false) html += `<div class="mt-1 text-[12px] text-amber-600 dark:text-amber-400">本期再刷 ${F.money(u.remainingToThreshold, { decimals: 0 })} 才有回饋</div>`;
    if (!compact && u.cap != null) html += `<div class="mt-0.5 text-[12px] muted">已刷 ${F.money(u.usedAmount, { decimals: 0 })}・${u.txnCount} 筆</div>`;
    return html;
  }

  function eventCard(ev) {
    const tags = (ev.cards || []).map((c) => A.payTag(c)).concat((ev.paymentMethods || []).map((p) => A.payTag(p))).join('');
    return `<article class="card card-pad card-link cursor-pointer" data-open-event="${ev.id}" tabindex="0">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="line-clamp-2 text-[15px] font-semibold leading-snug">${esc(ev.title)}</h3>
          <div class="mt-1.5 flex flex-wrap gap-1.5">${tags || '<span class="text-xs faint">未綁定卡片</span>'}</div>
        </div>
        <div class="shrink-0 text-right">
          <div class="text-lg font-bold text-brand-600 dark:text-brand-400">${esc(A.rewardRateText(ev))}</div>
          <div class="mt-0.5">${timingBadge(ev)}</div>
        </div>
      </div>
      ${ev.needsRegistration ? `<div class="mt-2 flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"><span class="flex items-center gap-1.5">${icon('alert', 'i-sm')}需要登錄，還沒登錄</span><button type="button" class="btn btn-xs bg-white text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" data-reg="${ev.id}">已登錄</button></div>` : ''}
      ${usageBlock(ev, true)}
    </article>`;
  }

  function renderList() {
    const box = $('eventsList');
    if (!state.events.length) {
      const msg = state.q || state.cardId || state.pmId ? '找不到符合條件的活動' : '這裡還沒有活動';
      box.innerHTML = `<div class="card md:col-span-2">${A.emptyState('gift', msg, state.q ? '換個關鍵字試試' : '用右上角「＋」或 AI 解析新增', `<button class="btn btn-primary btn-sm" data-new-event>${icon('plus', 'i-sm')}新增活動</button>`)}</div>`;
      return;
    }
    const sorted = sortEvents(state.events);
    if (state.group === 'none') { box.innerHTML = sorted.map(eventCard).join(''); return; }
    const groups = new Map();
    for (const ev of sorted) {
      const labels = state.group === 'card'
        ? ((ev.cards || []).length ? ev.cards.map((c) => c.name) : ['未綁定卡片'])
        : ((ev.paymentMethods || []).length ? ev.paymentMethods.map((p) => p.name) : ['直接刷卡']);
      labels.forEach((l) => { if (!groups.has(l)) groups.set(l, []); groups.get(l).push(ev); });
    }
    box.innerHTML = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'zh-Hant')).map((l) => `
      <h3 class="section-title !mt-3 md:col-span-2"><span>${esc(l)}</span><span class="badge badge-slate">${groups.get(l).length}</span></h3>
      ${groups.get(l).map(eventCard).join('')}`).join('');
  }

  async function loadEvents() {
    const seq = ++state.seq;
    const qs = new URLSearchParams({ status: state.status });
    if (state.q) qs.set('q', state.q);
    if (state.cardId) qs.set('cardId', state.cardId);
    if (state.pmId) qs.set('paymentMethodId', state.pmId);
    if (!state.events.length) $('eventsList').innerHTML = A.skeletonRows(3, 'h-32');
    try {
      const list = await A.get('/cashback?' + qs);
      if (seq !== state.seq) return;
      state.events = list;
      renderList();
    } catch (err) {
      if (seq !== state.seq) return;
      $('eventsList').innerHTML = `<div class="card md:col-span-2">${A.errorState(err, 'retryEvents')}</div>`;
      const r = $('retryEvents');
      if (r) r.onclick = loadEvents;
    }
  }

  $('qInput').addEventListener('input', A.debounce(() => { state.q = $('qInput').value.trim(); loadEvents(); }, 300));
  $('statusChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (!b) return;
    state.status = b.dataset.status;
    A.store.set('cb.status', state.status);
    A.setPressed($('statusChips'), '[data-status]', state.status, 'status');
    state.events = [];
    loadEvents();
  });

  // Filter sheet
  function syncFilterDot() { $('filterDot').hidden = !(state.cardId || state.pmId || state.sort !== 'deadline' || state.group !== 'none'); }
  $('filterBtn').addEventListener('click', () => A.sheet.open('filterSheet'));
  $('fCard').addEventListener('change', (e) => { state.cardId = e.target.value; syncFilterDot(); loadEvents(); });
  $('fPm').addEventListener('change', (e) => { state.pmId = e.target.value; syncFilterDot(); loadEvents(); });
  $('fSort').addEventListener('change', (e) => { state.sort = e.target.value; A.store.set('cb.sort', state.sort); syncFilterDot(); renderList(); });
  $('fGroup').addEventListener('change', (e) => { state.group = e.target.value; A.store.set('cb.group', state.group); syncFilterDot(); renderList(); });
  $('fReset').addEventListener('click', () => {
    Object.assign(state, { cardId: '', pmId: '', sort: 'deadline', group: 'none' });
    $('fCard').value = ''; $('fPm').value = ''; $('fSort').value = 'deadline'; $('fGroup').value = 'none';
    A.store.set('cb.sort', 'deadline'); A.store.set('cb.group', 'none');
    syncFilterDot();
    loadEvents();
  });

  // ─────────────────────────── Detail ───────────────────────────
  function findEvent(id) {
    id = Number(id);
    return state.events.find((e) => e.id === id) || (state.audit && state.audit.events.find((e) => e.id === id));
  }

  function conditionRows(ev) {
    const rows = [];
    const t = ev.timing || {};
    rows.push(['活動期間', `${ev.startDate ? F.date(ev.startDate, { year: true }) : '不限'} ～ ${ev.endDate ? F.date(ev.endDate, { year: true }) : '不限'}`]);
    let cycle = CYCLE_TEXT[ev.cycleType] || '整個活動期間';
    if (ev.cycleType === 'monthly') cycle += ` ${ev.cycleAnchorDay || 1} 號重置`;
    if (ev.cycleType === 'weekly' || ev.cycleType === 'biweekly') cycle += `${WEEKDAY[ev.cycleAnchorDay || 1]}重置`;
    if (t.cycle) cycle += `<br><span class="muted">本期 ${F.date(t.cycle.start)}～${F.date(t.cycle.end)}</span>`;
    rows.push(['計算週期', cycle]);
    rows.push(['回饋', `${esc(A.rewardRateText(ev))}${ev.rewardType && ev.rewardType !== 'cash' ? `（${{ point: '點數', coupon: '折價券', other: '其他' }[ev.rewardType]}）` : ''}`]);
    rows.push(['每期上限', ev.maxReward != null ? F.reward(ev.maxReward, ev.rewardType) : '不限']);
    if (ev.minimumSpend != null && Number(ev.minimumSpend) > 0) {
      rows.push(['門檻', `${ev.minimumSpendScope === 'cycleTotal' ? '本期累積滿' : '單筆滿'} ${F.money(ev.minimumSpend, { decimals: 0 })}`]);
    }
    const pms = (ev.paymentMethods || []).map((p) => esc(p.name)).join('、');
    rows.push(['付款方式', pms ? `${pms}${ev.matchUnspecifiedPayment ? '、直接刷卡' : ''}` : '直接刷卡（不使用電子支付）']);
    if (ev.requireMerchantMatch) rows.push(['限定商家', esc(String(ev.merchantKeywords || '').split('\n').join('、')) || '—']);
    if (ev.excludeMerchantMatch) rows.push(['排除商家', esc(String(ev.excludeMerchantKeywords || '').split('\n').join('、')) || '—']);
    rows.push(['計算方式', `${ev.rewardCalcMode === 'perTransaction' ? '逐筆計算' : '加總後計算'}・${ev.rewardRounding === 'floor' ? '無條件捨去' : '四捨五入'}${Number(ev.rewardPrecision) > 0 ? `至小數 ${ev.rewardPrecision} 位` : '至整數'}`]);
    if (ev.requiresRegistration) rows.push(['登錄', ev.registeredAt ? `已登錄（${F.date(ev.registeredAt, { year: true })}）` : '<span class="text-rose-600 dark:text-rose-400">尚未登錄</span>']);
    return rows;
  }

  async function openDetail(id) {
    let ev = findEvent(id);
    if (!ev) {
      try { ev = await A.get(`/cashback/${id}`); state.events.push(ev); } catch (err) { A.toast(err.message, { type: 'error' }); return; }
    }
    const u = ev.usage;
    const tags = (ev.cards || []).map((c) => A.payTag(c)).concat((ev.paymentMethods || []).map((p) => A.payTag(p))).join('');
    const link = A.safeUrl(ev.sourceUrl);
    const body = `
      <div class="flex flex-wrap items-center gap-1.5">${tags}</div>
      <div class="mt-3 flex items-center gap-2"><span class="text-2xl font-extrabold text-brand-600 dark:text-brand-400">${esc(A.rewardRateText(ev))}</span>${timingBadge(ev)}</div>
      ${u ? `<div class="mt-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
        <div class="grid grid-cols-2 gap-3">
          <div><div class="stat-label">本期應得</div><div class="stat-value money">${F.reward(u.estimatedReward, ev.rewardType)}</div></div>
          <div><div class="stat-label">本期已刷</div><div class="stat-value money">${F.money(u.usedAmount, { decimals: 0 })}</div></div>
        </div>
        ${usageBlock(ev, false)}
        ${u.excludedCount ? `<div class="mt-1 text-[12px] muted">另有 ${u.excludedCount} 筆不符條件未計入</div>` : ''}
      </div>` : ''}
      <dl class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">${conditionRows(ev).map(([k, v]) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${ev.note ? `<div class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 whitespace-pre-wrap">${esc(ev.note)}</div>` : ''}
      ${ev.description ? `<details class="mt-3"><summary class="cursor-pointer text-sm font-semibold muted">活動原文</summary><p class="mt-2 whitespace-pre-wrap text-sm muted">${esc(ev.description)}</p></details>` : ''}
      <div class="mt-4 grid grid-cols-2 gap-2">
        ${ev.requiresRegistration ? `<button type="button" class="btn btn-secondary btn-sm" data-act="reg">${icon('check-circle', 'i-sm')}${ev.registeredAt ? '改為未登錄' : '標記已登錄'}</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-act="txns">${icon('list', 'i-sm')}本期明細</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="receipt">${icon('audit', 'i-sm')}記錄入帳</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="dup">${icon('copy', 'i-sm')}複製活動</button>
        ${link ? `<a class="btn btn-secondary btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('external', 'i-sm')}活動網址</a>` : ''}
      </div>`;
    const el = A.sheet.create({
      id: 'detailSheet', title: ev.title, size: 'sheet-lg', body,
      footer: `<button type="button" class="btn btn-primary btn-block" data-act="edit">${icon('pencil', 'i-sm')}編輯活動</button>`
    });
    el.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'edit') { A.sheet.close('detailSheet'); setTimeout(() => openForm(ev), 60); }
      if (act === 'reg') {
        A.setLoading(b, true);
        try {
          const updated = await A.send('PUT', `/cashback/${ev.id}/registration`, { registered: !ev.registeredAt });
          replaceEvent(updated);
          A.toast(updated.registeredAt ? '已標記為已登錄' : '已改為未登錄');
          openDetail(ev.id);
        } catch (err) { A.toast(err.message, { type: 'error' }); A.setLoading(b, false); }
      }
      if (act === 'dup') {
        A.setLoading(b, true);
        try {
          const copy = await A.send('POST', `/cashback/${ev.id}/duplicate`, {});
          A.sheet.close('detailSheet');
          A.toast('已複製，請修改新活動的期間');
          await loadEvents();
          setTimeout(() => openForm(copy), 80);
        } catch (err) { A.toast(err.message, { type: 'error' }); A.setLoading(b, false); }
      }
      if (act === 'txns') openTxnDetail(ev.id, { range: 'cycle' });
      if (act === 'receipt') openReceipt(ev, null);
    };
    A.sheet.open(el);
  }

  function replaceEvent(updated) {
    const i = state.events.findIndex((e) => e.id === updated.id);
    if (i >= 0) state.events[i] = updated;
    renderList();
  }

  document.addEventListener('click', async (e) => {
    const reg = e.target.closest('[data-reg]');
    if (reg) {
      e.stopPropagation();
      A.setLoading(reg, true);
      try {
        replaceEvent(await A.send('PUT', `/cashback/${reg.dataset.reg}/registration`, { registered: true }));
        A.toast('已標記為已登錄');
      } catch (err) { A.toast(err.message, { type: 'error' }); A.setLoading(reg, false); }
      return;
    }
    if (e.target.closest('[data-new-event]')) { openForm(null); return; }
    const card = e.target.closest('[data-open-event]');
    if (card) openDetail(card.dataset.openEvent);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-open-event]')) openDetail(e.target.dataset.openEvent);
  });

  // ─────────────────────────── Form ───────────────────────────
  const form = $('eventForm');

  function fillAnchorOptions(type, value) {
    const sel = form.cycleAnchorDay;
    if (type === 'monthly') {
      $('anchorLabel').textContent = '每月幾號重置';
      sel.innerHTML = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1} 號${i + 1 >= 29 ? '（小月取月底）' : ''}</option>`).join('');
    } else {
      $('anchorLabel').textContent = '星期幾重置';
      sel.innerHTML = WEEKDAY.slice(1).map((w, i) => `<option value="${i + 1}">${w}</option>`).join('');
    }
    sel.value = String(value || 1);
  }
  function syncCycleUI() {
    const type = form.cycleType.value;
    $('anchorField').hidden = type === 'none';
    if (type !== 'none') fillAnchorOptions(type, form.cycleAnchorDay.value);
    $('cycleHint').textContent = {
      none: '上限與門檻以整個活動期間計算',
      monthly: '每月在指定日期重置上限；29~31 號在小月會用當月最後一天',
      weekly: '每週在指定星期重置上限',
      biweekly: '以活動開始日那週起算，每 14 天重置一次'
    }[type];
  }
  form.cycleType.addEventListener('change', syncCycleUI);

  function setMode(mode) {
    state.form.mode = mode;
    A.setPressed($('rewardModeSeg'), '[data-mode]', mode, 'mode');
    form.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== mode; });
  }
  $('rewardModeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  function setScope(scope) {
    state.form.scope = scope;
    A.setPressed($('scopeSeg'), '[data-scope]', scope, 'scope');
    $('scopeHint').textContent = scope === 'cycleTotal' ? '本期累積消費達門檻後，整期消費都有回饋（固定回饋則每期給一次）' : '每一筆都要達門檻才計入';
  }
  $('scopeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-scope]'); if (b) setScope(b.dataset.scope); });

  function toggleBoxes() {
    $('merchantBox').hidden = !form.requireMerchantMatch.checked;
    $('excludeBox').hidden = !form.excludeMerchantMatch.checked;
    $('regDateField').hidden = !form.requiresRegistration.checked;
    $('unspecWrap').hidden = !state.form.pms.size;
  }
  ['requireMerchantMatch', 'excludeMerchantMatch', 'requiresRegistration'].forEach((n) => form[n].addEventListener('change', toggleBoxes));

  function renderPickers() {
    const pick = (list, set, kind) => (list.length
      ? list.map((x) => `<button type="button" class="chip" data-pick="${kind}" data-id="${x.id}" aria-pressed="${set.has(x.id)}">${x.imageUrl ? `<img class="chip-img" src="${esc(A.asset(x.imageUrl))}" alt="">` : ''}${esc(x.name)}</button>`).join('')
      : `<a class="text-sm text-brand-600 underline" href="${A.url('/tags')}">先新增${kind === 'card' ? '卡片' : '支付方式'}</a>`);
    $('cardPick').innerHTML = pick(state.cards, state.form.cards, 'card');
    $('pmPick').innerHTML = pick(state.pms, state.form.pms, 'pm');
  }
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const set = b.dataset.pick === 'card' ? state.form.cards : state.form.pms;
    const id = Number(b.dataset.id);
    if (set.has(id)) set.delete(id); else set.add(id);
    b.setAttribute('aria-pressed', String(set.has(id)));
    toggleBoxes();
  });

  function openForm(ev, prefill) {
    form.reset();
    A.showError($('eventFormError'), '');
    const src = ev || prefill || {};
    form.id.value = ev ? ev.id : '';
    $('eventSheetTitle').textContent = ev ? '編輯活動' : '新增回饋活動';
    $('deleteEventBtn').hidden = !ev;
    const set = (n, v) => { if (form[n]) form[n].value = v == null ? '' : v; };
    ['title', 'startDate', 'endDate', 'sourceUrl', 'cashbackPercent', 'cashbackFixed', 'maxReward', 'minimumSpend', 'note', 'description', 'registeredAt'].forEach((n) => set(n, src[n] != null ? (['cashbackPercent', 'cashbackFixed', 'maxReward', 'minimumSpend'].includes(n) ? Number(src[n]) : src[n]) : ''));
    set('rewardType', src.rewardType || 'cash');
    set('cycleType', src.cycleType || 'none');
    set('rewardCalcMode', src.rewardCalcMode || 'aggregate');
    set('rewardRounding', src.rewardRounding || 'round');
    set('rewardPrecision', src.rewardPrecision != null ? String(src.rewardPrecision) : '0');
    set('merchantKeywords', Array.isArray(src.merchantKeywords) ? src.merchantKeywords.join('\n') : src.merchantKeywords || '');
    set('excludeMerchantKeywords', Array.isArray(src.excludeMerchantKeywords) ? src.excludeMerchantKeywords.join('\n') : src.excludeMerchantKeywords || '');
    form.matchUnspecifiedPayment.checked = !!src.matchUnspecifiedPayment;
    form.requireMerchantMatch.checked = !!src.requireMerchantMatch;
    form.excludeMerchantMatch.checked = !!src.excludeMerchantMatch;
    form.requiresRegistration.checked = !!src.requiresRegistration;
    state.form.cards = new Set((src.cards || []).map((c) => c.id).concat(src.cardIds || []));
    state.form.pms = new Set((src.paymentMethods || []).map((p) => p.id).concat(src.paymentMethodIds || []));
    setMode(src.cashbackFixed != null && !(src.cashbackPercent > 0) && src.cashbackFixed !== '' ? 'fixed' : 'percent');
    setScope(src.minimumSpendScope === 'cycleTotal' ? 'cycleTotal' : 'perTransaction');
    syncCycleUI();
    if (src.cycleAnchorDay) form.cycleAnchorDay.value = String(src.cycleAnchorDay);
    renderPickers();
    toggleBoxes();
    A.sheet.open('eventSheet');
  }

  $('newEventBtn').addEventListener('click', () => openForm(null));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('saveEventBtn');
    if (!form.title.value.trim()) { A.showError($('eventFormError'), '請輸入活動名稱'); form.title.focus(); return; }
    const pct = state.form.mode === 'percent';
    const body = {
      title: form.title.value,
      startDate: form.startDate.value || null,
      endDate: form.endDate.value || null,
      sourceUrl: form.sourceUrl.value.trim() || null,
      cashbackPercent: pct ? form.cashbackPercent.value || null : null,
      cashbackFixed: pct ? null : form.cashbackFixed.value || null,
      rewardType: form.rewardType.value,
      maxReward: form.maxReward.value || null,
      minimumSpend: form.minimumSpend.value || null,
      minimumSpendScope: state.form.scope,
      cycleType: form.cycleType.value,
      cycleAnchorDay: form.cycleType.value === 'none' ? null : form.cycleAnchorDay.value,
      cardIds: Array.from(state.form.cards),
      paymentMethodIds: Array.from(state.form.pms),
      matchUnspecifiedPayment: state.form.pms.size ? form.matchUnspecifiedPayment.checked : false,
      requireMerchantMatch: form.requireMerchantMatch.checked,
      merchantKeywords: form.merchantKeywords.value,
      excludeMerchantMatch: form.excludeMerchantMatch.checked,
      excludeMerchantKeywords: form.excludeMerchantKeywords.value,
      requiresRegistration: form.requiresRegistration.checked,
      registeredAt: form.requiresRegistration.checked ? form.registeredAt.value || null : null,
      rewardCalcMode: form.rewardCalcMode.value,
      rewardRounding: form.rewardRounding.value,
      rewardPrecision: form.rewardPrecision.value,
      note: form.note.value || null,
      description: form.description.value || null
    };
    A.setLoading(btn, true, '儲存中');
    try {
      const id = form.id.value;
      const saved = id ? await A.send('PUT', `/cashback/${id}`, body) : await A.send('POST', '/cashback', body);
      A.sheet.close('eventSheet');
      A.toast(id ? '已更新活動' : '已新增活動');
      await loadEvents();
      if (!id && saved.timing && saved.timing.phase !== 'active' && state.status === 'ongoing') A.toast('新活動尚未開始，可在「即將開始」查看');
    } catch (err) {
      A.showError($('eventFormError'), err.message);
    } finally {
      A.setLoading(btn, false);
    }
  });

  $('deleteEventBtn').addEventListener('click', async () => {
    const id = form.id.value;
    if (!id) return;
    if (!(await A.confirm('刪除後無法復原，此活動的入帳紀錄也會一併刪除（交易紀錄不受影響）。', { title: '刪除活動？', okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/cashback/${id}`);
      A.sheet.close('eventSheet');
      A.toast('已刪除活動');
      loadEvents();
    } catch (err) { A.showError($('eventFormError'), err.message); }
  });

  // AI keyword helper inside the form
  form.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ai-kw]');
    if (!b) return;
    const field = b.dataset.aiKw;
    const text = await A.prompt('貼上商家清單或活動文字', '', { maxLength: 4000, placeholder: '例如：適用全家、7-ELEVEN、萊爾富' });
    if (!text) return;
    A.setLoading(b, true, '分析中');
    try {
      const r = await A.send('POST', '/ai/parse-merchants', { text, model: state.aiModel || undefined });
      const existing = form[field].value.split('\n').map((s) => s.trim()).filter(Boolean);
      const seen = new Set(existing.map((s) => s.toUpperCase()));
      (r.keywords || []).forEach((k) => { if (!seen.has(k.toUpperCase())) { existing.push(k); seen.add(k.toUpperCase()); } });
      form[field].value = existing.join('\n');
      A.toast(`加入 ${(r.keywords || []).length} 個關鍵字`);
    } catch (err) { A.toast(aiError(err), { type: 'error' }); } finally { A.setLoading(b, false); }
  });

  // ─────────────────────────── AI parse ───────────────────────────
  function aiError(err) {
    if (err.code === 'GEMINI_NOT_CONFIGURED') return '尚未設定 Gemini 金鑰，請到「設定 → AI 金鑰」新增';
    return err.message;
  }
  $('aiParseBtn').addEventListener('click', () => {
    A.showError($('aiParseError'), '');
    if (!state.aiModels.length) loadModels();
    A.sheet.open('aiParseSheet');
  });
  $('aiParseRun').addEventListener('click', async () => {
    const text = $('aiParseInput').value.trim();
    if (!text) { A.showError($('aiParseError'), '請貼上活動文字'); return; }
    const btn = $('aiParseRun');
    A.setLoading(btn, true, 'AI 解析中');
    A.showError($('aiParseError'), '');
    try {
      const r = await A.send('POST', '/ai/parse-event', { text, model: state.aiModel || undefined });
      const lower = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
      const match = (names, list) => (names || []).map((n) => list.find((x) => lower(x.name).includes(lower(n)) || lower(n).includes(lower(x.name)))).filter(Boolean).map((x) => x.id);
      const prefill = {
        ...r,
        description: r.description || text,
        cardIds: match(r.cardNames, state.cards),
        paymentMethodIds: match(r.paymentMethodNames, state.pms),
        requireMerchantMatch: !!r.requireMerchantMatch && (r.merchantKeywords || []).length > 0,
        excludeMerchantMatch: !!r.excludeMerchantMatch && (r.excludeMerchantKeywords || []).length > 0,
        sourceUrl: A.safeUrl(r.sourceUrl)
      };
      A.sheet.close('aiParseSheet');
      $('aiParseInput').value = '';
      setTimeout(() => {
        openForm(null, prefill);
        const unmatched = (r.cardNames || []).length + (r.paymentMethodNames || []).length - prefill.cardIds.length - prefill.paymentMethodIds.length;
        A.toast(unmatched > 0 ? '已填入，部分卡片/支付對不到，請手動勾選' : '已填入，請檢查後儲存');
      }, 80);
    } catch (err) {
      A.showError($('aiParseError'), aiError(err));
    } finally {
      A.setLoading(btn, false);
    }
  });

  async function loadModels() {
    try {
      const d = await A.get('/ai/models');
      state.aiModels = d.models || [];
      const has = (n) => state.aiModels.some((m) => m.name === n);
      if (!has(state.aiModel)) state.aiModel = has(d.default) ? d.default : (state.aiModels[0] && state.aiModels[0].name) || '';
      const opts = state.aiModels.map((m) => `<option value="${esc(m.name)}" ${m.name === state.aiModel ? 'selected' : ''}>${esc(m.displayName || m.name)}</option>`).join('');
      $('aiModel').innerHTML = opts;
      $('aiParseModel').innerHTML = opts;
    } catch (_) {
      $('aiModel').innerHTML = '<option value="">（無法載入）</option>';
      $('aiParseModel').innerHTML = '<option value="">（無法載入）</option>';
    }
  }
  ['aiModel', 'aiParseModel'].forEach((id) => $(id).addEventListener('change', (e) => {
    state.aiModel = e.target.value;
    A.store.set('aiModel', state.aiModel);
    $('aiModel').value = state.aiModel;
    $('aiParseModel').value = state.aiModel;
  }));

  // ─────────────────────────── AI search ───────────────────────────
  $('aiSearchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = $('aiQuery').value.trim();
    if (!query) return;
    const btn = $('aiSearchBtn');
    A.setLoading(btn, true, 'AI 分析中');
    $('aiResults').innerHTML = A.skeletonRows(2, 'h-40');
    try {
      const d = await A.send('POST', '/ai/search-rewards', { query, web: $('aiWeb').checked, model: state.aiModel || undefined });
      const refs = new Map((d.refs || []).map((r) => [r.id, r]));
      $('aiResults').innerHTML = `<div class="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-100">${icon('sparkles', 'i-sm')} ${esc(d.summary)}${d.cached ? ' <span class="faint">（快取）</span>' : ''}</div>`
        + (d.recommendations || []).map((r, i) => `<article class="card card-pad">
          <div class="flex items-start gap-3"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-full ${i === 0 ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'} text-sm font-bold">${i + 1}</span>
            <div class="min-w-0 flex-1"><h3 class="font-semibold">${esc(r.title)}</h3>${r.rewardText ? `<span class="badge badge-brand mt-1">${esc(r.rewardText)}</span>` : ''}</div></div>
          ${r.reason ? `<p class="mt-2 whitespace-pre-wrap text-sm muted">${esc(r.reason)}</p>` : ''}
          ${(r.cautions || []).length ? `<ul class="mt-2 space-y-1 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">${r.cautions.map((c) => `<li>• ${esc(c)}</li>`).join('')}</ul>` : ''}
          <div class="mt-2 flex flex-wrap gap-2">${(r.eventIds || []).map((id) => refs.get(id)).filter(Boolean).map((x) => `<button type="button" class="btn btn-tonal btn-xs" data-open-event="${x.id}">${esc(x.title)}</button>`).join('')}
          ${A.safeUrl(r.checkUrl) ? `<a class="btn btn-secondary btn-xs" target="_blank" rel="noopener" href="${esc(r.checkUrl)}">${icon('external', 'i-sm')}確認名額</a>` : ''}</div>
        </article>`).join('');
      if (!(d.recommendations || []).length) $('aiResults').insertAdjacentHTML('beforeend', `<div class="card">${A.emptyState('search', '找不到相關方案')}</div>`);
      // Make referenced events openable even if not in the current list filter.
      if ((d.refs || []).length && !state.events.length) loadEvents();
    } catch (err) {
      $('aiResults').innerHTML = `<div class="card">${A.emptyState('alert', 'AI 搜尋失敗', aiError(err))}</div>`;
    } finally { A.setLoading(btn, false); }
  });

  // ─────────────────────────── Audit ───────────────────────────
  function rangeQuery() {
    const qs = new URLSearchParams({ status: 'all' });
    const now = new Date();
    if (state.range === 'prevCycle') qs.set('range', 'prevCycle');
    else if (state.range === 'thisMonth' || state.range === 'lastMonth') {
      const off = state.range === 'thisMonth' ? 0 : -1;
      qs.set('range', 'range');
      qs.set('from', new Date(now.getFullYear(), now.getMonth() + off, 1).toISOString());
      qs.set('to', new Date(now.getFullYear(), now.getMonth() + off + 1, 1).toISOString());
    } else if (state.range === 'custom') {
      if (!$('raFrom').value || !$('raTo').value) return null;
      const [fy, fm, fd] = $('raFrom').value.split('-').map(Number);
      const [ty, tm, td] = $('raTo').value.split('-').map(Number);
      qs.set('range', 'range');
      qs.set('from', new Date(fy, fm - 1, fd).toISOString());
      qs.set('to', new Date(ty, tm - 1, td + 1).toISOString());
    } else {
      qs.set('status', 'active');
    }
    return qs;
  }

  function auditCard(ev) {
    const u = ev.usage;
    const r = ev.reconciliation || {};
    let status = '<span class="badge badge-slate">未記錄入帳</span>';
    if (r.received != null) {
      if (r.difference < 0) status = `<span class="badge badge-rose">少 ${F.reward(-r.difference, ev.rewardType)}</span>`;
      else if (r.difference > 0) status = `<span class="badge badge-green">多 ${F.reward(r.difference, ev.rewardType)}</span>`;
      else status = `<span class="badge badge-green">${icon('check', 'i-sm')}相符</span>`;
    }
    const receipts = (ev.receipts || []).map((x) => `<button type="button" class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] active:bg-slate-50 dark:active:bg-slate-800" data-receipt="${ev.id}:${x.id}"><span class="muted">${F.date(x.receivedDate, { year: true })} 入帳${x.note ? `・${esc(x.note)}` : ''}</span><span class="font-semibold money">${F.reward(x.receivedAmount, ev.rewardType)}</span></button>`).join('');
    return `<article class="card card-pad">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0"><h3 class="line-clamp-2 text-[15px] font-semibold">${esc(ev.title)}</h3>
          <div class="mt-0.5 text-[12px] muted">${ev.period.start ? F.date(ev.period.start, { year: true }) : '不限'} ～ ${ev.period.end ? F.date(ev.period.end, { year: true }) : '不限'}・${u.txnCount} 筆 ${F.money(u.usedAmount, { decimals: 0 })}</div></div>
        ${status}
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <div><div class="stat-label">應得</div><div class="text-lg font-bold money">${F.reward(u.estimatedReward, ev.rewardType)}</div>${u.capReached ? '<div class="text-[11px] text-emerald-600">已達上限</div>' : ''}</div>
        <div><div class="stat-label">實際入帳</div><div class="text-lg font-bold money">${r.received != null ? F.reward(r.received, ev.rewardType) : '—'}</div></div>
      </div>
      ${receipts ? `<div class="mt-2">${receipts}</div>` : ''}
      <div class="mt-3 flex gap-2">
        <button type="button" class="btn btn-secondary btn-sm flex-1" data-audit-txns="${ev.id}">${icon('list', 'i-sm')}明細</button>
        <button type="button" class="btn btn-tonal btn-sm flex-1" data-audit-receipt="${ev.id}">${icon('plus', 'i-sm')}記錄入帳</button>
      </div>
    </article>`;
  }

  async function loadAudit() {
    const qs = rangeQuery();
    $('customRange').hidden = state.range !== 'custom';
    A.setPressed($('rangeChips'), '[data-range]', state.range, 'range');
    if (!qs) { $('auditList').innerHTML = `<div class="card">${A.emptyState('calendar', '請選擇起訖日期')}</div>`; return; }
    $('auditList').innerHTML = A.skeletonRows(2, 'h-44');
    try {
      const d = await A.get('/cashback/rewards-audit?' + qs);
      state.audit = d;
      const tt = $('auditTotals');
      tt.querySelector('[data-t="expected"]').textContent = F.money(d.totals.expected, { decimals: 0 });
      tt.querySelector('[data-t="received"]').textContent = F.money(d.totals.received, { decimals: 0 });
      tt.querySelector('[data-t="spend"]').textContent = F.money(d.totals.spend, { decimals: 0 });
      $('auditList').innerHTML = d.events.length
        ? d.events.map(auditCard).join('')
        : `<div class="card">${A.emptyState('audit', state.range === 'prevCycle' ? '還沒有已結算的週期' : '這段期間沒有可核對的活動', state.range === 'prevCycle' ? '有週期且已跑完至少一期的活動才會出現' : '')}</div>`;
    } catch (err) {
      $('auditList').innerHTML = `<div class="card">${A.errorState(err)}</div>`;
    }
  }
  $('rangeChips').addEventListener('click', (e) => { const b = e.target.closest('[data-range]'); if (b) { state.range = b.dataset.range; loadAudit(); } });
  ['raFrom', 'raTo'].forEach((id) => $(id).addEventListener('change', loadAudit));
  $('auditList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-audit-txns]');
    const r = e.target.closest('[data-audit-receipt]');
    const ex = e.target.closest('[data-receipt]');
    if (t) openTxnDetail(t.dataset.auditTxns, { fromAudit: true });
    if (r) openReceipt(state.audit.events.find((x) => x.id === Number(r.dataset.auditReceipt)), null);
    if (ex) {
      const [eid, rid] = ex.dataset.receipt.split(':').map(Number);
      const ev = state.audit.events.find((x) => x.id === eid);
      openReceipt(ev, ev.receipts.find((x) => x.id === rid));
    }
  });

  async function openTxnDetail(eventId, opts) {
    let ev = opts.fromAudit && state.audit ? state.audit.events.find((x) => x.id === Number(eventId)) : null;
    const el = A.sheet.create({ id: 'txnSheet', title: '計入明細', size: 'sheet-lg', body: A.skeletonRows(4, 'h-12') });
    A.sheet.open(el);
    try {
      if (!ev) {
        const d = await A.get(`/cashback/rewards-audit?status=all&range=cycle`);
        ev = d.events.find((x) => x.id === Number(eventId));
      }
      if (!ev) { el.querySelector('.sheet-body').innerHTML = A.emptyState('list', '此活動沒有綁定卡片'); return; }
      const u = ev.usage;
      const perTxn = new Map((u.txnRewards || []).map((x) => [x.transactionId, x.reward]));
      const row = (t, extra) => `<div class="row !px-0"><div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">${esc(t.note || '（無備註）')}</div><div class="text-[12px] muted">${F.datetime(t.transactionAt)}${extra || ''}</div></div><div class="text-right"><div class="text-sm font-semibold money">${F.money(t.amount)}</div>${perTxn.has(t.id) ? `<div class="text-[12px] text-emerald-600">+${F.num(perTxn.get(t.id))}</div>` : ''}</div></div>`;
      const formula = u.rewardKind === 'percent'
        ? (u.rewardCalcMode === 'perTransaction' ? '每筆各自計算回饋後加總' : `消費合計 ${F.money(u.usedAmount)} × ${F.num(ev.cashbackPercent, 3)}% 一次計算`)
        : `每筆符合條件得 ${F.reward(ev.cashbackFixed, ev.rewardType)}`;
      el.querySelector('.sheet-title').textContent = ev.title;
      el.querySelector('.sheet-body').innerHTML = `
        <div class="rounded-xl bg-slate-50 p-3 text-[13px] dark:bg-slate-800/60">${esc(formula)}，${u.rewardRounding === 'floor' ? '無條件捨去' : '四捨五入'}${u.rewardPrecision ? `至小數 ${u.rewardPrecision} 位` : '至整數'}${u.cap != null ? `，上限 ${F.reward(u.cap, ev.rewardType)}` : ''} → <b>${F.reward(u.estimatedReward, ev.rewardType)}</b></div>
        <h3 class="section-title">計入（${u.transactions.length}）</h3>
        <div class="list">${u.transactions.map((t) => row(t)).join('') || '<div class="py-4 text-center text-sm muted">沒有交易</div>'}</div>
        ${u.excludedTransactions.length ? `<h3 class="section-title">未計入（${u.excludedTransactions.length}）</h3><div class="list">${u.excludedTransactions.map((t) => row(t, `・<span class="text-amber-600">${esc((REASON[t.reason] || (() => t.reason))(t))}</span>`)).join('')}</div>` : ''}`;
    } catch (err) {
      el.querySelector('.sheet-body').innerHTML = A.errorState(err);
    }
  }

  // Receipts
  const rForm = $('receiptForm');
  function openReceipt(ev, receipt) {
    if (!ev) return;
    rForm.reset();
    A.showError($('receiptError'), '');
    rForm.eventId.value = ev.id;
    rForm.rid.value = receipt ? receipt.id : '';
    $('deleteReceiptBtn').hidden = !receipt;
    $('receiptTitle').textContent = receipt ? '修改入帳紀錄' : '記錄實際入帳';
    const period = receipt || ev.period || (ev.timing && ev.timing.cycle ? { start: ev.timing.cycle.start, end: ev.timing.cycle.end } : {});
    rForm.periodStart.value = receipt ? receipt.periodStart || '' : period.start || ev.startDate || '';
    rForm.periodEnd.value = receipt ? receipt.periodEnd || '' : period.end || ev.endDate || '';
    rForm.receivedDate.value = receipt ? receipt.receivedDate : F.inputDate(new Date());
    rForm.receivedAmount.value = receipt ? receipt.receivedAmount : '';
    rForm.note.value = receipt ? receipt.note || '' : '';
    const expected = receipt ? receipt.expectedAmount : (ev.usage && ev.usage.estimatedReward);
    $('receiptInfo').innerHTML = `<div class="font-semibold">${esc(ev.title)}</div><div class="mt-0.5 muted">系統計算應得 <b class="text-slate-900 dark:text-white">${expected != null ? F.reward(expected, ev.rewardType) : '—'}</b>（依期間自動重算並存成快照）</div>`;
    A.sheet.open('receiptSheet');
    setTimeout(() => rForm.receivedAmount.focus(), 120);
  }
  rForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (rForm.receivedAmount.value === '') { A.showError($('receiptError'), '請輸入實際入帳金額'); return; }
    const body = {
      receivedAmount: rForm.receivedAmount.value,
      receivedDate: rForm.receivedDate.value || null,
      periodStart: rForm.periodStart.value || null,
      periodEnd: rForm.periodEnd.value || null,
      note: rForm.note.value || null
    };
    const btn = rForm.closest('.sheet').querySelector('[type=submit]');
    A.setLoading(btn, true);
    try {
      const rid = rForm.rid.value;
      const saved = rid
        ? await A.send('PUT', `/cashback/${rForm.eventId.value}/receipts/${rid}`, body)
        : await A.send('POST', `/cashback/${rForm.eventId.value}/receipts`, body);
      A.sheet.close('receiptSheet');
      const diff = saved.difference;
      A.toast(diff == null ? '已記錄入帳' : (diff < 0 ? `已記錄，比應得少 ${F.num(-diff)}` : (diff > 0 ? `已記錄，比應得多 ${F.num(diff)}` : '已記錄，與應得相符')), { type: diff < 0 ? 'error' : undefined });
      if (state.tab === 'audit') loadAudit();
    } catch (err) {
      A.showError($('receiptError'), err.message);
    } finally { A.setLoading(btn, false); }
  });
  $('deleteReceiptBtn').addEventListener('click', async () => {
    if (!(await A.confirm('刪除這筆入帳紀錄？', { okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/cashback/${rForm.eventId.value}/receipts/${rForm.rid.value}`);
      A.sheet.close('receiptSheet');
      A.toast('已刪除');
      loadAudit();
    } catch (err) { A.showError($('receiptError'), err.message); }
  });

  // ─────────────────────────── Boot ───────────────────────────
  async function boot() {
    A.setPressed($('statusChips'), '[data-status]', state.status, 'status');
    $('fSort').value = state.sort;
    $('fGroup').value = state.group;
    syncFilterDot();
    try {
      const { cards, pms } = await A.loadTags();
      state.cards = cards;
      state.pms = pms;
      $('fCard').insertAdjacentHTML('beforeend', cards.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''));
      $('fPm').insertAdjacentHTML('beforeend', pms.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(''));
    } catch (_) { /* pickers will show a link instead */ }
    setTab(state.tab);
    await loadEvents();
    const openId = params.get('open') || params.get('edit');
    if (openId) {
      if (!findEvent(openId)) {
        try { state.events.push(await A.get(`/cashback/${openId}`)); } catch (_) { /* ignore */ }
      }
      if (params.get('edit')) openForm(findEvent(openId)); else openDetail(openId);
    } else if (params.get('new')) openForm(null);
    ['open', 'edit', 'new'].forEach((k) => params.delete(k));
    history.replaceState(history.state, '', location.pathname + (params.toString() ? '?' + params : ''));
  }
  boot();
})();
