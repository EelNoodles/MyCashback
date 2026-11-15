(function () {
  'use strict';
  const A = window.App;
  const { esc, icon } = A;
  const F = A.fmt;
  const $ = (id) => document.getElementById(id);

  const state = { points: [], current: null, histories: [], expiries: [], hType: 'earn' };

  function pointRow(p) {
    const exp = p.nextExpiry;
    const expBadge = exp
      ? `<span class="badge ${exp.daysLeft <= 7 ? 'badge-rose' : 'badge-amber'}">${F.num(exp.amount)} 點 ${exp.daysLeft <= 0 ? '今天' : `${exp.daysLeft} 天後`}到期</span>`
      : '';
    const month = (p.monthEarned || p.monthSpent)
      ? `<span class="text-[12px] muted">本月 ${p.monthEarned ? `<span class="text-emerald-600">+${F.num(p.monthEarned)}</span>` : ''}${p.monthSpent ? ` <span class="text-rose-600">−${F.num(p.monthSpent)}</span>` : ''}</span>`
      : '';
    return `<button type="button" class="row row-tap w-full text-left" data-point="${p.id}">
      ${A.avatar(p.name, p.imageUrl)}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[15px] font-semibold">${esc(p.name)}</span>
        <span class="mt-0.5 flex flex-wrap items-center gap-1.5">${p.issuer ? `<span class="text-[12px] muted">${esc(p.issuer)}</span>` : ''}${month}${expBadge}</span>
      </span>
      <span class="shrink-0 text-right">
        <span class="block text-[17px] font-bold money">${F.num(p.currentBalance)}</span>
        ${p.value != null ? `<span class="block text-[12px] muted money">≈ ${F.money(p.value, { decimals: 0 })}</span>` : ''}
      </span>
    </button>`;
  }

  async function loadPoints() {
    try {
      state.points = await A.get('/points');
      const valued = state.points.filter((p) => p.value != null);
      $('sumValue').textContent = valued.length ? F.money(valued.reduce((s, p) => s + p.value, 0), { decimals: 0 }) : '—';
      $('sumEarned').textContent = '+' + F.num(state.points.reduce((s, p) => s + (p.monthEarned || 0), 0));
      $('sumSpent').textContent = '−' + F.num(state.points.reduce((s, p) => s + (p.monthSpent || 0), 0));
      $('pointList').innerHTML = state.points.length
        ? `<div class="card overflow-hidden"><div class="list">${state.points.map(pointRow).join('')}</div></div>`
        : `<div class="card">${A.emptyState('star', '還沒有點數', '記下各家點數與到期日，到期前會提醒你', `<button class="btn btn-primary btn-sm" data-new-point>${icon('plus', 'i-sm')}新增點數</button>`)}</div>`;
    } catch (err) {
      $('pointList').innerHTML = `<div class="card">${A.errorState(err)}</div>`;
    }
  }

  // ─── Detail ───
  const TYPE_LABEL = { earn: '獲得', spend: '使用', set: '校正' };
  function historyRow(h) {
    const d = Number(h.delta);
    const color = h.changeType === 'earn' ? 'text-emerald-600 dark:text-emerald-400' : h.changeType === 'spend' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300';
    const amount = h.changeType === 'set' ? `= ${F.num(h.targetBalance != null ? h.targetBalance : h.balanceAfter)}` : `${d >= 0 ? '+' : '−'}${F.num(Math.abs(d))}`;
    return `<button type="button" class="row row-tap w-full text-left" data-history="${h.id}">
      <span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold">${esc(h.note || TYPE_LABEL[h.changeType])}</span><span class="block text-[12px] muted">${F.datetime(h.occurredAt)}・餘額 ${F.num(h.balanceAfter)}</span></span>
      <span class="shrink-0 text-[15px] font-bold money ${color}">${amount}</span>
    </button>`;
  }
  function expiryRow(x) {
    const dismissed = x.status === 'dismissed';
    const tone = dismissed ? 'badge-slate' : (x.daysLeft <= 7 ? 'badge-rose' : 'badge-amber');
    const label = dismissed ? '已使用' : (x.daysLeft < 0 ? '已過期' : (x.daysLeft === 0 ? '今天到期' : `${x.daysLeft} 天後`));
    return `<div class="row ${dismissed ? 'opacity-60' : ''}">
      <button type="button" class="min-w-0 flex-1 text-left" data-expiry="${x.id}"><span class="block text-sm font-semibold">${F.num(x.amount)} 點・${F.date(x.expiryDate, { year: true })}</span><span class="block text-[12px] muted">${esc(x.note || '')}</span></button>
      <span class="badge ${tone}">${label}</span>
      <button type="button" class="btn btn-xs ${dismissed ? 'btn-secondary' : 'btn-tonal'}" data-toggle-expiry="${x.id}">${dismissed ? '復原' : '已使用'}</button>
    </div>`;
  }

  async function openPoint(id, keepOpen) {
    state.current = state.points.find((p) => p.id === Number(id));
    if (!state.current) return;
    $('pdTitle').textContent = state.current.name;
    if (!keepOpen) {
      $('pdTimeline').innerHTML = A.skeletonRows(3, 'h-12');
      $('pdExpiries').innerHTML = '';
      A.sheet.open('pointSheet');
    }
    try {
      const [h, ex] = await Promise.all([A.get(`/points/${id}/histories`), A.get(`/points/${id}/expiries`)]);
      state.histories = h.histories;
      state.expiries = ex;
      const p = h.point;
      $('pdBalance').textContent = F.num(p.currentBalance);
      $('pdValue').textContent = p.value != null ? `約值 ${F.money(p.value, { decimals: 0 })}（每點 ${F.num(p.valuePerPoint, 4)} 元）` : (p.issuer || '');
      const m = (h.stats || [])[0];
      $('pdMonth').textContent = m ? `${m.period}：+${F.num(m.earned)} / −${F.num(m.spent)}` : '';
      $('pdTimeline').innerHTML = h.histories.length ? `<div class="list">${h.histories.map(historyRow).join('')}</div>` : A.emptyState('clock', '還沒有紀錄');
      $('pdExpiries').innerHTML = ex.length ? `<div class="list">${ex.map(expiryRow).join('')}</div>` : '<div class="px-4 py-4 text-center text-sm muted">沒有設定到期提醒</div>';
    } catch (err) {
      $('pdTimeline').innerHTML = A.errorState(err);
    }
  }

  async function refreshAll() {
    const id = state.current && state.current.id;
    await loadPoints();
    if (id && !$('pointSheet').hidden) openPoint(id, true);
  }

  // ─── History form ───
  const hForm = $('historyForm');
  function setHType(t) {
    state.hType = t;
    A.setPressed($('hTypeSeg'), '[data-type]', t, 'type');
    $('hAmountLabel').textContent = t === 'set' ? '當下的實際餘額' : (t === 'earn' ? '獲得多少點' : '使用多少點');
    $('hHint').textContent = t === 'set' ? '以這個時間點的實際餘額為準；之後補登更早的紀錄也不會改變它' : '';
  }
  $('hTypeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (b) setHType(b.dataset.type); });
  function openHistory(h, type) {
    hForm.reset();
    A.showError($('hError'), '');
    hForm.hid.value = h ? h.id : '';
    $('hTitle').textContent = h ? '編輯紀錄' : `${state.current.name}`;
    $('hDelete').hidden = !h;
    setHType(h ? h.changeType : type);
    hForm.amount.value = h ? (h.changeType === 'set' ? (h.targetBalance != null ? h.targetBalance : h.balanceAfter) : Math.abs(h.delta)) : '';
    hForm.occurredAt.value = F.inputDateTime(h ? h.occurredAt : new Date());
    hForm.occurredAt.dataset.initial = hForm.occurredAt.value;
    hForm.note.value = h ? h.note || '' : '';
    A.sheet.open('historySheet');
    setTimeout(() => hForm.amount.focus(), 150);
  }
  document.querySelectorAll('[data-change]').forEach((b) => b.addEventListener('click', () => openHistory(null, b.dataset.change)));
  $('pdTimeline').addEventListener('click', (e) => {
    const r = e.target.closest('[data-history]');
    if (r) openHistory(state.histories.find((h) => h.id === Number(r.dataset.history)));
  });
  hForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (hForm.amount.value === '') { A.showError($('hError'), '請輸入數量'); return; }
    const body = {
      changeType: state.hType,
      amount: hForm.amount.value,
      // Untouched "now" default → send the precise current time (the input drops
      // seconds, which could otherwise order this before a just-created entry).
      occurredAt: !hForm.occurredAt.value || (!hForm.hid.value && hForm.occurredAt.value === hForm.occurredAt.dataset.initial)
        ? new Date().toISOString()
        : (hForm.occurredAt.value === hForm.occurredAt.dataset.initial ? undefined : new Date(hForm.occurredAt.value).toISOString()),
      note: hForm.note.value || null
    };
    const btn = hForm.closest('.sheet').querySelector('[type=submit]');
    A.setLoading(btn, true);
    try {
      const hid = hForm.hid.value;
      const r = hid
        ? await A.send('PUT', `/points/${state.current.id}/histories/${hid}`, body)
        : await A.send('POST', `/points/${state.current.id}/histories`, body);
      A.sheet.close('historySheet');
      A.toast(`餘額 ${F.num(r.currentBalance)}`);
      refreshAll();
    } catch (err) { A.showError($('hError'), err.message); } finally { A.setLoading(btn, false); }
  });
  $('hDelete').addEventListener('click', async () => {
    if (!(await A.confirm('刪除這筆紀錄？餘額會重新計算。', { okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/points/${state.current.id}/histories/${hForm.hid.value}`);
      A.sheet.close('historySheet');
      refreshAll();
    } catch (err) { A.showError($('hError'), err.message); }
  });

  // ─── Expiries ───
  const eForm = $('expiryForm');
  function openExpiry(x) {
    eForm.reset();
    A.showError($('eError'), '');
    eForm.eid.value = x ? x.id : '';
    $('eDelete').hidden = !x;
    if (x) { eForm.amount.value = x.amount; eForm.expiryDate.value = x.expiryDate; eForm.note.value = x.note || ''; }
    A.sheet.open('expirySheet');
  }
  $('addExpiryBtn').addEventListener('click', () => openExpiry(null));
  $('pdExpiries').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle-expiry]');
    const ed = e.target.closest('[data-expiry]');
    if (t) {
      const x = state.expiries.find((y) => y.id === Number(t.dataset.toggleExpiry));
      try {
        await A.send('PUT', `/points/${state.current.id}/expiries/${x.id}`, { status: x.status === 'dismissed' ? 'active' : 'dismissed' });
        refreshAll();
      } catch (err) { A.toast(err.message, { type: 'error' }); }
    } else if (ed) openExpiry(state.expiries.find((y) => y.id === Number(ed.dataset.expiry)));
  });
  eForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!eForm.amount.value || !eForm.expiryDate.value) { A.showError($('eError'), '請輸入數量與到期日'); return; }
    const body = { amount: eForm.amount.value, expiryDate: eForm.expiryDate.value, note: eForm.note.value || null };
    try {
      const eid = eForm.eid.value;
      if (eid) await A.send('PUT', `/points/${state.current.id}/expiries/${eid}`, body);
      else await A.send('POST', `/points/${state.current.id}/expiries`, body);
      A.sheet.close('expirySheet');
      A.toast('已儲存到期提醒');
      refreshAll();
    } catch (err) { A.showError($('eError'), err.message); }
  });
  $('eDelete').addEventListener('click', async () => {
    if (!(await A.confirm('刪除這個到期提醒？', { okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/points/${state.current.id}/expiries/${eForm.eid.value}`);
      A.sheet.close('expirySheet');
      refreshAll();
    } catch (err) { A.showError($('eError'), err.message); }
  });

  // ─── Point form ───
  const pForm = $('pointForm');
  function openPointForm(p) {
    pForm.reset();
    A.showError($('pfError'), '');
    pForm.id.value = p ? p.id : '';
    $('pfTitle').textContent = p ? '編輯點數' : '新增點數';
    $('pfDelete').hidden = !p;
    $('pfBalanceField').hidden = !!p;
    if (p) {
      pForm.name.value = p.name;
      pForm.issuer.value = p.issuer || '';
      pForm.valuePerPoint.value = p.valuePerPoint != null ? p.valuePerPoint : '';
      pForm.note.value = p.note || '';
    }
    A.sheet.open('pointFormSheet');
  }
  $('newPointBtn').addEventListener('click', () => openPointForm(null));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-new-point]')) openPointForm(null); });
  $('pdEdit').addEventListener('click', () => openPointForm(state.current));
  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pForm.name.value.trim()) { A.showError($('pfError'), '請輸入名稱'); return; }
    const fd = new FormData(pForm);
    const id = fd.get('id');
    fd.delete('id');
    if (!(fd.get('image') && fd.get('image').size > 0)) fd.delete('image');
    if (id) fd.delete('currentBalance');
    const btn = pForm.closest('.sheet').querySelector('[type=submit]');
    A.setLoading(btn, true);
    try {
      await A.jsonFetch(A.api(id ? `/points/${id}` : '/points'), { method: id ? 'PUT' : 'POST', body: fd });
      A.sheet.close('pointFormSheet');
      A.toast(id ? '已更新' : '已新增點數');
      refreshAll();
    } catch (err) { A.showError($('pfError'), err.message); } finally { A.setLoading(btn, false); }
  });
  $('pfDelete').addEventListener('click', async () => {
    if (!(await A.confirm('刪除此點數與所有紀錄、到期提醒？', { okText: '刪除', danger: true }))) return;
    try {
      await A.send('DELETE', `/points/${pForm.id.value}`);
      A.sheet.close('pointFormSheet');
      A.sheet.close('pointSheet');
      state.current = null;
      loadPoints();
    } catch (err) { A.showError($('pfError'), err.message); }
  });

  $('pointList').addEventListener('click', (e) => {
    const r = e.target.closest('[data-point]');
    if (r) openPoint(r.dataset.point);
  });

  loadPoints();
})();
