(function () {
  'use strict';
  const A = window.App;

  const listEl = document.getElementById('pointsList');
  const timelinePane = document.getElementById('timelinePane');
  const timelineEl = document.getElementById('timeline');
  const tlBalanceEl = document.getElementById('tlBalance');
  const tlPointNameEl = document.getElementById('tlPointName');
  const tlStatsEl = document.getElementById('tlStats');

  const newPointBtn = document.getElementById('newPointBtn');
  const closeTimelineBtn = document.getElementById('closeTimelineBtn');
  const addHistoryBtn = document.getElementById('addHistoryBtn');

  // Forms
  const pointForm = document.getElementById('pointForm');
  const pointFormError = document.getElementById('pointFormError');
  const deletePointBtn = document.getElementById('deletePointBtn');
  const pointModalTitle = document.getElementById('pointModalTitle');

  const historyForm = document.getElementById('historyForm');
  const historyFormError = document.getElementById('historyFormError');
  const deleteHistoryBtn = document.getElementById('deleteHistoryBtn');
  const historyModalTitle = document.getElementById('historyModalTitle');

  let state = { points: [], currentPointId: null };

  // Expiry elements
  const addExpiryBtn = document.getElementById('addExpiryBtn');
  const expiryForm = document.getElementById('expiryForm');
  const expiryFormError = document.getElementById('expiryFormError');
  const expiryModalTitle = document.getElementById('expiryModalTitle');
  const tlExpiries = document.getElementById('tlExpiries');
  const tlExpiryList = document.getElementById('tlExpiryList');

  function pointCardEl(p) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card p-3 text-left flex flex-col gap-2 hover:shadow-md transition focus:ring-2 focus:ring-brand-300';
    card.dataset.id = p.id;

    const top = document.createElement('div');
    top.className = 'flex items-center gap-3';

    const icon = document.createElement('div');
    icon.className = 'w-12 h-12 rounded-2xl text-white grid place-items-center text-base font-bold flex-shrink-0';
    if (p.imageUrl) {
      icon.style.backgroundImage = `url(${A.url(p.imageUrl)})`;
      icon.style.backgroundSize = 'cover';
      icon.style.backgroundPosition = 'center';
    } else {
      icon.style.background = A.gradientFromName(p.name);
      icon.textContent = A.initialsFrom(p.name);
    }

    const info = document.createElement('div');
    info.className = 'min-w-0';
    info.innerHTML = `
      <div class="text-xs text-slate-500 truncate">${p.issuer || ''}</div>
      <div class="font-medium truncate">${p.name}</div>`;
    top.append(icon, info);

    const bottom = document.createElement('div');
    bottom.className = 'flex items-end justify-between';
    bottom.innerHTML = `
      <div class="text-xl font-semibold tabular-nums">${A.fmtNumber(p.currentBalance)}</div>
      <span class="text-xs text-brand-600">查看時間軸 →</span>`;

    card.append(top, bottom);
    card.addEventListener('click', () => openTimeline(p.id));

    // Long press / right click to edit
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openPointModal(p);
    });

    return card;
  }

  async function loadPoints() {
    try {
      state.points = await A.jsonFetch(A.api('/points'));
      listEl.innerHTML = '';
      if (!state.points.length) {
        listEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full">尚未建立點數，按右上「+ 新增點數」開始</div>`;
        return;
      }
      const editLink = document.createElement('div');
      editLink.className = 'text-xs text-slate-400 col-span-full';
      editLink.textContent = '長按 / 右鍵卡片可編輯資訊';
      listEl.appendChild(editLink);
      for (const p of state.points) listEl.appendChild(pointCardEl(p));
    } catch (err) {
      listEl.innerHTML = `<div class="text-sm text-rose-500 col-span-full">載入失敗：${err.message}</div>`;
    }
  }

  function timelineRowEl(h) {
    const isPos = (h.changeType === 'earn') || (Number(h.delta) > 0 && h.changeType !== 'spend');
    const sign = h.changeType === 'set' ? '=' : (isPos ? '+' : '−');
    const colorCls = h.changeType === 'set' ? 'text-slate-700'
      : isPos ? 'text-emerald-600' : 'text-rose-600';

    const li = document.createElement('li');
    li.className = 'relative pl-5 group';
    li.innerHTML = `
      <span class="absolute left-1 top-2 w-2.5 h-2.5 rounded-full bg-brand-500"></span>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xs text-slate-500">${A.fmtDate(h.occurredAt)}</div>
          <div class="text-sm truncate">${h.note || (h.changeType === 'set' ? '更新餘額' : (h.changeType === 'earn' ? '獲得' : '花費'))}</div>
          <div class="text-[10px] text-slate-400">餘額快照：${A.fmtNumber(h.balanceAfter)}</div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="${colorCls} text-base font-semibold tabular-nums">${sign}${A.fmtNumber(Math.abs(Number(h.delta)) || (h.changeType === 'set' ? h.balanceAfter : 0))}</div>
          <button class="text-[10px] text-slate-400 hover:text-brand-600" data-edit="${h.id}">編輯</button>
        </div>
      </div>`;
    li.querySelector('[data-edit]').addEventListener('click', () => openHistoryModal(h));
    return li;
  }

  async function openTimeline(pointId) {
    state.currentPointId = pointId;
    timelinePane.classList.remove('hidden');
    timelineEl.innerHTML = `<li class="text-sm text-slate-400">載入中…</li>`;
    try {
      const data = await A.jsonFetch(A.api(`/points/${pointId}/histories`));
      tlBalanceEl.textContent = A.fmtNumber(data.point.currentBalance);
      tlPointNameEl.textContent = data.point.name;

      const monthKey = new Date().toISOString().slice(0, 7);
      const m = (data.stats || []).find((s) => s.period === monthKey)
        || { earned: 0, spent: 0, net: 0 };
      tlStatsEl.querySelector('[data-tlstat="earned"]').textContent = '+' + A.fmtNumber(m.earned);
      tlStatsEl.querySelector('[data-tlstat="spent"]').textContent = '-' + A.fmtNumber(m.spent);
      tlStatsEl.querySelector('[data-tlstat="net"]').textContent = (m.net >= 0 ? '+' : '') + A.fmtNumber(m.net);

      timelineEl.innerHTML = '';
      if (!data.histories.length) {
        timelineEl.innerHTML = `<li class="text-sm text-slate-400">尚無歷史紀錄</li>`;
      } else {
        for (const h of data.histories) timelineEl.appendChild(timelineRowEl(h));
      }

      // Load expiries
      await loadExpiries(pointId);
    } catch (err) {
      timelineEl.innerHTML = `<li class="text-sm text-rose-500">載入失敗：${err.message}</li>`;
    }
  }

  // ----- Point modal -----
  function openPointModal(p) {
    pointForm.reset();
    A.showError(pointFormError, '');
    if (p) {
      pointModalTitle.textContent = '編輯點數';
      pointForm.id.value = p.id;
      pointForm.name.value = p.name || '';
      pointForm.issuer.value = p.issuer || '';
      pointForm.note.value = p.note || '';
      pointForm.currentBalance.value = p.currentBalance;
      pointForm.currentBalance.parentElement.classList.add('hidden');
      deletePointBtn.classList.remove('hidden');
    } else {
      pointModalTitle.textContent = '新增點數';
      pointForm.id.value = '';
      pointForm.currentBalance.parentElement.classList.remove('hidden');
      deletePointBtn.classList.add('hidden');
    }
    A.openModal('pointModal');
  }
  newPointBtn?.addEventListener('click', () => openPointModal(null));

  pointForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = pointForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(pointFormError, '');
    try {
      const fd = new FormData(pointForm);
      const id = fd.get('id');
      // strip empty file input
      if (fd.get('image') && !(fd.get('image').size > 0)) fd.delete('image');
      if (id) {
        fd.delete('id');
        fd.delete('currentBalance');
        await A.jsonFetch(A.api(`/points/${id}`), { method: 'PUT', body: fd });
      } else {
        fd.delete('id');
        await A.jsonFetch(A.api('/points'), { method: 'POST', body: fd });
      }
      A.closeModal('pointModal');
      await loadPoints();
    } catch (err) {
      A.showError(pointFormError, err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deletePointBtn?.addEventListener('click', async () => {
    const id = pointForm.id.value;
    if (!id) return;
    if (!confirm('確定要刪除此點數及其所有歷史紀錄？')) return;
    try {
      await A.jsonFetch(A.api(`/points/${id}`), { method: 'DELETE' });
      A.closeModal('pointModal');
      timelinePane.classList.add('hidden');
      state.currentPointId = null;
      await loadPoints();
    } catch (err) { A.showError(pointFormError, err.message); }
  });

  // ----- History modal -----
  function openHistoryModal(h) {
    historyForm.reset();
    A.showError(historyFormError, '');
    if (h) {
      historyModalTitle.textContent = '編輯紀錄';
      historyForm.hid.value = h.id;
      historyForm.changeType.value = h.changeType;
      const amt = h.changeType === 'set' ? h.balanceAfter : Math.abs(Number(h.delta));
      historyForm.amount.value = amt;
      // datetime-local needs YYYY-MM-DDTHH:MM
      const d = new Date(h.occurredAt);
      const pad = (n) => String(n).padStart(2, '0');
      historyForm.occurredAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      historyForm.note.value = h.note || '';
      deleteHistoryBtn.classList.remove('hidden');
    } else {
      historyModalTitle.textContent = '新增紀錄';
      historyForm.hid.value = '';
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      historyForm.occurredAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      deleteHistoryBtn.classList.add('hidden');
    }
    A.openModal('historyModal');
  }
  addHistoryBtn?.addEventListener('click', () => {
    if (!state.currentPointId) return;
    openHistoryModal(null);
  });
  closeTimelineBtn?.addEventListener('click', () => {
    timelinePane.classList.add('hidden');
    state.currentPointId = null;
  });

  historyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = historyForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(historyFormError, '');
    try {
      const data = {
        changeType: historyForm.changeType.value,
        amount: historyForm.amount.value,
        occurredAt: historyForm.occurredAt.value
          ? new Date(historyForm.occurredAt.value).toISOString()
          : new Date().toISOString(),
        note: historyForm.note.value
      };
      const hid = historyForm.hid.value;
      if (hid) {
        await A.jsonFetch(A.api(`/points/${state.currentPointId}/histories/${hid}`), {
          method: 'PUT', body: data
        });
      } else {
        await A.jsonFetch(A.api(`/points/${state.currentPointId}/histories`), {
          method: 'POST', body: data
        });
      }
      A.closeModal('historyModal');
      await loadPoints();
      await openTimeline(state.currentPointId);
    } catch (err) {
      A.showError(historyFormError, err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deleteHistoryBtn?.addEventListener('click', async () => {
    const hid = historyForm.hid.value;
    if (!hid || !state.currentPointId) return;
    if (!confirm('確定刪除這筆紀錄？將重新計算餘額。')) return;
    try {
      await A.jsonFetch(A.api(`/points/${state.currentPointId}/histories/${hid}`), { method: 'DELETE' });
      A.closeModal('historyModal');
      await loadPoints();
      await openTimeline(state.currentPointId);
    } catch (err) {
      A.showError(historyFormError, err.message);
    }
  });

  // ---------- Point Expiries ----------

  function expiryRowEl(exp) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((new Date(exp.expiryDate) - today) / 86400000);
    const isDismissed = exp.status === 'dismissed';

    let urgency = 'text-amber-600';
    let label = `${daysLeft} 天後到期`;
    if (daysLeft <= 0) { urgency = 'text-rose-600'; label = daysLeft === 0 ? '今天到期！' : '已過期'; }
    else if (daysLeft <= 3) { urgency = 'text-rose-500'; label = `⚠️ ${daysLeft} 天`; }

    const row = document.createElement('div');
    row.className = `flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs ${isDismissed ? 'bg-slate-50 opacity-60' : 'bg-amber-50 border border-amber-100'}`;
    row.innerHTML = `
      <div class="min-w-0">
        <span class="font-semibold">${A.fmtNumber(exp.amount)}</span> 點 · 
        <span>${exp.expiryDate}</span>
        ${!isDismissed ? `<span class="${urgency} font-medium ml-1">${label}</span>` : '<span class="text-slate-400 ml-1">已解除</span>'}
        ${exp.note ? `<span class="text-slate-400 ml-1">(${exp.note})</span>` : ''}
      </div>
      <div class="flex gap-1 flex-shrink-0">
        ${isDismissed
          ? `<button data-restore="${exp.id}" class="px-2 py-0.5 rounded bg-brand-100 text-brand-700 hover:bg-brand-200">復原</button>`
          : `<button data-dismiss="${exp.id}" class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">✓ 已用</button>`
        }
        <button data-delete="${exp.id}" class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200">刪除</button>
      </div>`;

    const pid = state.currentPointId;

    // Dismiss
    row.querySelector('[data-dismiss]')?.addEventListener('click', async () => {
      await A.jsonFetch(A.api(`/points/${pid}/expiries/${exp.id}`), { method: 'PUT', body: { status: 'dismissed' } });
      await loadExpiries(pid);
    });

    // Restore
    row.querySelector('[data-restore]')?.addEventListener('click', async () => {
      await A.jsonFetch(A.api(`/points/${pid}/expiries/${exp.id}`), { method: 'PUT', body: { status: 'active' } });
      await loadExpiries(pid);
    });

    // Delete
    row.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!confirm('確定刪除此到期設定？')) return;
      await A.jsonFetch(A.api(`/points/${pid}/expiries/${exp.id}`), { method: 'DELETE' });
      await loadExpiries(pid);
    });

    return row;
  }

  async function loadExpiries(pointId) {
    try {
      const expiries = await A.jsonFetch(A.api(`/points/${pointId}/expiries`));
      if (expiries.length) {
        tlExpiries.classList.remove('hidden');
        tlExpiryList.innerHTML = '';
        for (const e of expiries) tlExpiryList.appendChild(expiryRowEl(e));
      } else {
        tlExpiries.classList.add('hidden');
      }
    } catch (err) {
      console.error('loadExpiries', err);
    }
  }

  addExpiryBtn?.addEventListener('click', () => {
    if (!state.currentPointId) return;
    expiryForm.reset();
    expiryForm.eid.value = '';
    expiryModalTitle.textContent = '新增到期提醒';
    A.showError(expiryFormError, '');
    A.openModal('expiryModal');
  });

  expiryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = expiryForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(expiryFormError, '');
    try {
      const data = {
        amount: expiryForm.amount.value,
        expiryDate: expiryForm.expiryDate.value,
        note: expiryForm.note.value || null
      };
      const eid = expiryForm.eid.value;
      const pid = state.currentPointId;
      if (eid) {
        await A.jsonFetch(A.api(`/points/${pid}/expiries/${eid}`), { method: 'PUT', body: data });
      } else {
        await A.jsonFetch(A.api(`/points/${pid}/expiries`), { method: 'POST', body: data });
      }
      A.closeModal('expiryModal');
      await loadExpiries(pid);
    } catch (err) {
      A.showError(expiryFormError, err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  loadPoints();
})();
