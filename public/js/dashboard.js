(function () {
  'use strict';
  const A = window.App;

  const grid = document.getElementById('pointsGrid');
  const expiringBox = document.getElementById('expiringEvents');
  const alertSection = document.getElementById('expiryAlertSection');
  const alertsBox = document.getElementById('expiryAlerts');

  const NETWORK_LABELS = {
    visa: 'VISA', mastercard: 'MC', jcb: 'JCB',
    amex: 'AMEX', unionpay: 'UP', other: ''
  };
  const CYCLE_LABELS = { weekly: '本週', biweekly: '本雙週', monthly: '本月' };
  const SPEND_PREFIX = { weekly: '本週', biweekly: '本雙週', monthly: '本月', none: '活動內' };

  // Percent + reward-cap → how much can be spent in one cycle before further
  // spending stops earning cashback. Null if either input is missing.
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
    return `<div class="mt-2 text-[11px] bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 text-emerald-800 flex items-center gap-1"><span aria-hidden="true">🎯</span><span><strong>${prefix}最高消費</strong> NT$${A.fmtNumber(Math.ceil(s))} 拿滿回饋</span></div>`;
  }

  function getNextResetDate(today, cycleType, anchorDay) {
    const d = new Date(today);
    if (cycleType === 'monthly') {
      const anchor = Math.min(anchorDay || 1, 28);
      let nextReset = new Date(d.getFullYear(), d.getMonth(), anchor);
      if (nextReset <= d) nextReset = new Date(d.getFullYear(), d.getMonth() + 1, anchor);
      return nextReset;
    }
    if (cycleType === 'weekly' || cycleType === 'biweekly') {
      const anchor = (anchorDay || 1);
      const currentDay = d.getDay() || 7;
      let daysUntil = anchor - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (cycleType === 'biweekly' && daysUntil <= 7) daysUntil += 7;
      const next = new Date(d);
      next.setDate(next.getDate() + daysUntil);
      return next;
    }
    return null;
  }

  function pointCardEl(p) {
    const wrap = document.createElement('a');
    wrap.href = A.url('/points');
    wrap.className = 'card p-3 flex flex-col gap-2 hover:shadow-md transition focus:ring-2 focus:ring-brand-300';
    const top = document.createElement('div');
    top.className = 'flex items-center gap-3';

    const icon = document.createElement('div');
    icon.className = 'w-12 h-12 rounded-2xl text-white grid place-items-center text-base font-bold flex-shrink-0';
    if (p.imageUrl) {
      icon.style.background = '#e2e8f0';
      icon.textContent = '';
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

    const balance = document.createElement('div');
    balance.className = 'text-xl font-semibold tabular-nums';
    balance.textContent = A.fmtNumber(p.currentBalance);

    wrap.append(top, balance);
    return wrap;
  }

  function eventCardEl(ev) {
    const card = document.createElement('div');
    card.className = 'card p-3 cursor-pointer hover:shadow-md transition';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = ev.endDate ? Math.ceil((new Date(ev.endDate) - today) / 86400000) : null;

    // Event remaining
    let eventLeftStr = '無期限';
    if (daysLeft !== null) {
      if (daysLeft < 0) eventLeftStr = '已結束';
      else if (daysLeft === 0) eventLeftStr = '今天最後一天';
      else {
        const m = Math.floor(daysLeft / 30);
        const d = daysLeft % 30;
        eventLeftStr = m > 0 ? `活動剩 ${m} 月 ${d} 天` : `活動剩 ${d} 天`;
      }
    }

    // Cycle remaining — 本月/本週
    let cycleHtml = '';
    if (ev.cycleType && ev.cycleType !== 'none') {
      const nextReset = getNextResetDate(today, ev.cycleType, ev.cycleAnchorDay);
      if (nextReset) {
        const cDays = Math.ceil((nextReset - today) / 86400000);
        const label = CYCLE_LABELS[ev.cycleType] || '';
        cycleHtml = `<div class="text-[10px] text-slate-500 mt-0.5">${label}剩 <strong>${cDays}</strong> 天</div>`;
      }
    }

    // Card/PM chips with image support
    const cardChips = (ev.cards || []).map((c) => {
      if (c.imageUrl) {
        return `<span class="credit-card-mini"><img class="credit-card-mini__img" src="${A.url(c.imageUrl)}" alt="" />${c.name}</span>`;
      }
      return `<span class="credit-card-mini">💳 ${c.name}</span>`;
    });
    const pmChips = (ev.paymentMethods || []).map((p) => {
      if (p.imageUrl) {
        return `<span class="pm-badge" style="font-size:0.6rem;padding:2px 6px"><img class="pm-badge__img" style="width:16px;height:16px" src="${A.url(p.imageUrl)}" alt="" />${p.name}</span>`;
      }
      return `<span class="chip">${p.name}</span>`;
    });
    const tags = cardChips.concat(pmChips).join(' ');

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="font-medium flex items-center gap-2">
            <span class="truncate min-w-0" title="${ev.title}">${ev.title}</span>
            ${ev.sourceUrl ? `<a href="${ev.sourceUrl}" target="_blank" class="text-brand-600 hover:text-brand-700 flex-shrink-0" title="開啟活動連結"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
          </div>
          <div class="text-xs text-slate-500 mt-0.5">${A.fmtDateOnly(ev.startDate)} ~ ${A.fmtDateOnly(ev.endDate)}</div>
          <div class="mt-2 flex flex-wrap gap-1">${tags}</div>
        </div>
        <div class="text-right">
          <div class="text-sm font-semibold text-brand-600">${ev.cashbackPercent ? ev.cashbackPercent + '%' : (ev.cashbackFixed ? '+' + A.fmtNumber(ev.cashbackFixed) : '')}</div>
          <div class="text-[10px] text-slate-400 mt-1">${eventLeftStr}</div>
          ${cycleHtml}
        </div>
      </div>
      ${maxSpendCalloutHtml(ev)}`;
    
    // Open details on click (ignore if clicked on the sourceUrl link)
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      openEventDetails(ev, tags, eventLeftStr, cycleHtml);
    });
    
    return card;
  }

  function openEventDetails(ev, tagsHtml, eventLeftStr, cycleHtml) {
    document.getElementById('eventDetailsTitle').textContent = ev.title;
    document.getElementById('eventDetailsContent').innerHTML = `
      <div class="text-sm text-slate-600">
        <div class="mb-2"><strong>活動期間：</strong> ${A.fmtDateOnly(ev.startDate)} ~ ${A.fmtDateOnly(ev.endDate)}</div>
        <div class="mb-2"><strong>倒數計時：</strong> ${eventLeftStr} ${cycleHtml}</div>
        <div class="mb-2"><strong>回饋比例：</strong> ${ev.cashbackPercent ? ev.cashbackPercent + '%' : (ev.cashbackFixed ? '+' + A.fmtNumber(ev.cashbackFixed) : '—')}</div>
        <div class="mb-2"><strong>最低門檻：</strong> ${ev.minimumSpend != null ? A.fmtNumber(ev.minimumSpend) : '—'}</div>
        <div class="mb-2"><strong>回饋上限：</strong> ${ev.maxReward != null ? A.fmtNumber(ev.maxReward) : '—'}</div>
        ${(() => { const s = calcMaxUsefulSpend(ev); if (s == null) return ''; const prefix = SPEND_PREFIX[ev.cycleType || 'none'] || '活動內'; return `<div class="mb-2"><strong>${prefix}最高消費：</strong> <span class="text-emerald-700 font-semibold">NT$${A.fmtNumber(Math.ceil(s))}</span> 即拿滿回饋</div>`; })()}
        <div class="mb-2"><strong>適用卡片/支付：</strong> <div class="mt-1 flex flex-wrap gap-1">${tagsHtml}</div></div>
        ${ev.description ? `<div class="mb-2"><strong>活動說明：</strong><p class="mt-1 whitespace-pre-wrap">${ev.description}</p></div>` : ''}
        ${ev.sourceUrl ? `<div class="mb-2"><strong>參考連結：</strong> <a href="${ev.sourceUrl}" target="_blank" class="text-brand-600 hover:underline break-all">${ev.sourceUrl}</a></div>` : ''}
      </div>
    `;
    const editBtn = document.getElementById('eventDetailsEditBtn');
    editBtn.href = A.url('/cashback?edit=' + ev.id);
    A.openModal('eventDetailsModal');
  }

  // ─── Expiry Alert Card ───
  function expiryAlertEl(alert) {
    const card = document.createElement('div');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((new Date(alert.expiryDate) - today) / 86400000);

    let urgencyClass = 'border-amber-200 bg-amber-50';
    let urgencyText = 'text-amber-700';
    let urgencyLabel = `${daysLeft} 天後到期`;
    if (daysLeft <= 0) {
      urgencyClass = 'border-rose-200 bg-rose-50';
      urgencyText = 'text-rose-700';
      urgencyLabel = daysLeft === 0 ? '今天到期！' : '已過期';
    } else if (daysLeft <= 3) {
      urgencyClass = 'border-rose-200 bg-rose-50';
      urgencyText = 'text-rose-600';
      urgencyLabel = `⚠️ ${daysLeft} 天後到期`;
    }

    const pointName = alert.point ? alert.point.name : '—';

    card.className = `rounded-xl border p-3 ${urgencyClass} flex items-center justify-between gap-3 transition`;
    card.innerHTML = `
      <div class="min-w-0">
        <div class="font-medium text-sm truncate ${urgencyText}">${pointName}</div>
        <div class="text-xs text-slate-600 mt-0.5">
          <strong>${A.fmtNumber(alert.amount)}</strong> 點 · ${alert.expiryDate}
        </div>
        <div class="text-[10px] ${urgencyText} font-medium mt-0.5">${urgencyLabel}</div>
        ${alert.note ? `<div class="text-[10px] text-slate-400 truncate mt-0.5">${alert.note}</div>` : ''}
      </div>
      <div class="flex gap-1 flex-shrink-0">
        <button data-dismiss-alert="${alert.id}" data-point="${alert.pointId}"
                class="text-[10px] px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                title="已使用 / 警報解除">設定使用</button>
      </div>`;

    card.querySelector('[data-dismiss-alert]').addEventListener('click', async (e) => {
      const eid = e.currentTarget.dataset.dismissAlert;
      const pid = e.currentTarget.dataset.point;
      try {
        await A.jsonFetch(A.api(`/points/${pid}/expiries/${eid}`), {
          method: 'PUT', body: { status: 'dismissed' }
        });
        card.remove();
        // Hide section if no more alerts
        if (!alertsBox.children.length) alertSection.classList.add('hidden');
      } catch (err) {
        console.error('dismiss alert failed', err);
      }
    });
    return card;
  }

  async function load() {
    try {
      const [points, events, alerts] = await Promise.all([
        A.jsonFetch(A.api('/points')),
        A.jsonFetch(A.api('/cashback?status=active')),
        A.jsonFetch(A.api('/expiries/alerts'))
      ]);

      // Expiry alerts
      if (alerts.length) {
        alertSection.classList.remove('hidden');
        alertsBox.innerHTML = '';
        for (const a of alerts) alertsBox.appendChild(expiryAlertEl(a));
      }

      grid.innerHTML = '';
      if (!points.length) {
        grid.innerHTML = `<div class="text-sm text-slate-400 col-span-full">尚未建立點數，<a class="underline text-brand-600" href="${A.url('/points')}">前往新增</a></div>`;
      } else {
        for (const p of points) grid.appendChild(pointCardEl(p));
      }

      // All active events sorted by cashback % (highest first)
      const sorted = events.slice().sort((a, b) => {
        const pA = Number(a.cashbackPercent) || 0;
        const pB = Number(b.cashbackPercent) || 0;
        return pB - pA;
      });
      expiringBox.innerHTML = '';
      if (!sorted.length) {
        expiringBox.innerHTML = `<div class="text-sm text-slate-400 col-span-full">沒有進行中的活動</div>`;
      } else {
        for (const ev of sorted) expiringBox.appendChild(eventCardEl(ev));
      }

      // stats
      const stats = document.getElementById('summaryStats');
      stats.querySelector('[data-stat="count"]').textContent = points.length;
      stats.querySelector('[data-stat="activeEvents"]').textContent = events.length;

      const totalBalance = points.reduce((sum, p) => sum + (Number(p.currentBalance) || 0), 0);
      const totalEl = document.querySelector('[data-stat="totalBalance"]');
      if (totalEl) totalEl.textContent = A.fmtNumber(totalBalance);

      // Earned/spent this month
      const monthKey = new Date().toISOString().slice(0, 7);
      let earned = 0; let spent = 0;
      const allHistories = await Promise.all(
        points.map((p) => A.jsonFetch(A.api(`/points/${p.id}/histories`)).catch(() => null))
      );
      for (const r of allHistories) {
        if (!r) continue;
        for (const h of r.histories) {
          if (String(h.occurredAt).slice(0, 7) !== monthKey) continue;
          const d = Number(h.delta) || 0;
          if (h.changeType === 'spend' || d < 0) spent += Math.abs(d);
          else if (h.changeType === 'earn' || d > 0) earned += d;
        }
      }
      stats.querySelector('[data-stat="earned"]').textContent = '+' + A.fmtNumber(earned);
      stats.querySelector('[data-stat="spent"]').textContent = '-' + A.fmtNumber(spent);
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<div class="text-sm text-rose-500 col-span-full">載入失敗：${err.message}</div>`;
      expiringBox.innerHTML = '';
    }
  }

  load();
})();
