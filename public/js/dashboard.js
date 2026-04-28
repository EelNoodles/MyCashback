(function () {
  'use strict';
  const A = window.App;

  const grid = document.getElementById('pointsGrid');
  const expiringBox = document.getElementById('expiringEvents');

  const NETWORK_LABELS = {
    visa: 'VISA', mastercard: 'MC', jcb: 'JCB',
    amex: 'AMEX', unionpay: 'UP', other: ''
  };
  const CYCLE_LABELS = { weekly: '每週', biweekly: '雙週', monthly: '每月' };

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
    card.className = 'card p-3';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
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

    // Cycle remaining
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
        <div class="min-w-0">
          <div class="font-medium truncate">${ev.title}</div>
          <div class="text-xs text-slate-500 mt-0.5">${A.fmtDateOnly(ev.startDate)} ~ ${A.fmtDateOnly(ev.endDate)}</div>
          <div class="mt-2 flex flex-wrap gap-1">${tags}</div>
        </div>
        <div class="text-right">
          <div class="text-sm font-semibold text-brand-600">${ev.cashbackPercent ? ev.cashbackPercent + '%' : (ev.cashbackFixed ? '+' + A.fmtNumber(ev.cashbackFixed) : '')}</div>
          <div class="text-[10px] text-slate-400 mt-1">${eventLeftStr}</div>
          ${cycleHtml}
        </div>
      </div>`;
    return card;
  }

  async function load() {
    try {
      const [points, events] = await Promise.all([
        A.jsonFetch(A.api('/points')),
        A.jsonFetch(A.api('/cashback?status=active'))
      ]);

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

      // Earned/spent this month — derive by querying histories of every point in parallel
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
