(function () {
  'use strict';
  const A = window.App;
  const { esc, icon } = A;
  const F = A.fmt;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  $('todayLabel').textContent = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;

  function eventLink(id) { return A.url(`/cashback?open=${id}`); }

  const ATTN = {
    registration_needed: (a) => ({
      tone: 'rose', icon: 'alert',
      title: `「${a.title}」需要登錄`,
      sub: a.phase === 'upcoming' ? '活動開始前先登錄，才不會漏拿回饋' : '尚未登錄就不會有回饋',
      action: `<button class="btn btn-tonal btn-xs" data-reg="${a.eventId}">已登錄</button>`,
      href: eventLink(a.eventId)
    }),
    event_ending: (a) => ({
      tone: a.daysLeft <= 3 ? 'rose' : 'amber', icon: 'clock',
      title: `${a.title}・${F.daysLeftText(a.daysLeft)}`,
      sub: a.remainingReward > 0
        ? `還可拿 ${F.money(a.remainingReward)}${a.remainingCapAmount > 0 ? `，再刷 ${F.money(a.remainingCapAmount, { decimals: 0 })} 滿額` : ''}`
        : '活動即將結束',
      href: eventLink(a.eventId)
    }),
    cycle_ending: (a) => ({
      tone: 'amber', icon: 'refresh',
      title: `${a.title}・本期${F.daysLeftText(a.daysLeft)}`,
      sub: `本期還可拿 ${F.money(a.remainingReward)}，${F.date(a.resetDate)} 重置`,
      href: eventLink(a.eventId)
    }),
    threshold_pending: (a) => ({
      tone: 'amber', icon: 'info',
      title: `${a.title}・尚未達門檻`,
      sub: `本期再刷 ${F.money(a.remainingToThreshold, { decimals: 0 })} 才有回饋（門檻 ${F.money(a.minimumSpend, { decimals: 0 })}）`,
      href: eventLink(a.eventId)
    }),
    point_expiring: (a) => ({
      tone: a.daysLeft <= 7 ? 'rose' : 'slate', icon: 'star',
      title: `${a.title} ${F.num(a.amount)} 點${a.daysLeft <= 0 ? '今天到期' : ` ${a.daysLeft} 天後到期`}`,
      sub: `到期日 ${F.date(a.expiryDate, { year: true })}`,
      action: `<button class="btn btn-tonal btn-xs" data-exp="${a.expiryId}" data-point="${a.pointId}">已使用</button>`,
      href: A.url('/points')
    }),
    event_starting: (a) => ({
      tone: 'brand', icon: 'calendar',
      title: `${a.title}・${a.daysUntilStart === 0 ? '今天' : `${a.daysUntilStart} 天後`}開始`,
      sub: '記得準備好綁定的卡片與支付',
      href: eventLink(a.eventId)
    })
  };
  const TONE = {
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  };

  function attentionRow(a) {
    const spec = (ATTN[a.type] || (() => null))(a);
    if (!spec) return '';
    return `<div class="row">
      <a href="${spec.href}" class="flex min-w-0 flex-1 items-center gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE[spec.tone]}">${icon(spec.icon)}</span>
        <span class="min-w-0"><span class="line-clamp-2 text-[15px] font-semibold leading-snug">${esc(spec.title)}</span><span class="block truncate text-[13px] muted">${esc(spec.sub)}</span></span>
      </a>
      ${spec.action || `<a href="${spec.href}" class="faint" aria-hidden="true">${icon('chevron-right', 'i-sm')}</a>`}
    </div>`;
  }

  function eventCard(ev) {
    const u = ev.usage;
    const t = ev.timing || {};
    const tags = (ev.cards || []).map((c) => A.payTag(c)).concat((ev.paymentMethods || []).map((p) => A.payTag(p))).join('');
    let usage = '<div class="mt-3 text-[13px] muted">尚未綁定卡片，無法計算使用量</div>';
    if (u) {
      if (u.cap != null) {
        const line = u.capReached
          ? `<span class="font-semibold text-emerald-600 dark:text-emerald-400">已滿額 ${F.reward(u.cap, ev.rewardType)}</span>`
          : `<span>回饋 <b class="money">${F.reward(u.estimatedReward, ev.rewardType)}</b> / ${F.reward(u.cap, ev.rewardType)}</span>${u.remainingCapAmount > 0 ? `<span class="muted">再刷 ${F.money(u.remainingCapAmount, { decimals: 0 })}</span>` : ''}`;
        usage = `<div class="mt-3">${A.progressBar(u.capUsedPercent)}<div class="mt-1.5 flex items-center justify-between gap-2 text-[13px]">${line}</div></div>`;
      } else {
        usage = `<div class="mt-3 flex items-center justify-between text-[13px]"><span class="muted">已刷 ${F.money(u.usedAmount, { decimals: 0 })}</span><span>回饋 <b class="money">${F.reward(u.estimatedReward, ev.rewardType)}</b></span></div>`;
      }
      if (u.thresholdMet === false) {
        usage += `<div class="mt-1 text-[12px] text-amber-600 dark:text-amber-400">再刷 ${F.money(u.remainingToThreshold, { decimals: 0 })} 達門檻</div>`;
      }
    }
    const daysText = t.cycle && t.cycle.daysLeft != null && !t.cycle.endsWithEvent
      ? `本期剩 ${t.cycle.daysLeft} 天`
      : F.daysLeftText(t.daysLeft);
    return `<a href="${eventLink(ev.id)}" class="card card-link card-pad">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px] font-semibold">${esc(ev.title)}</div>
          <div class="mt-1.5 flex flex-wrap gap-1.5">${tags}</div>
        </div>
        <div class="shrink-0 text-right">
          <div class="text-lg font-bold text-brand-600 dark:text-brand-400">${esc(A.rewardRateText(ev))}</div>
          <div class="text-[11px] muted">${esc(daysText)}</div>
        </div>
      </div>
      ${ev.needsRegistration ? `<div class="mt-2"><span class="badge badge-rose">${icon('alert', 'i-sm')}需登錄</span></div>` : ''}
      ${usage}
    </a>`;
  }

  async function load() {
    try {
      const s = await A.get('/dashboard/summary');
      $('heroReward').textContent = F.money(s.rewards.estimatedThisCycle);
      const ptsNote = s.rewards.estimatedPointsThisCycle > 0 ? `（含 ${F.num(s.rewards.estimatedPointsThisCycle)} 點）` : '';
      $('heroReward').insertAdjacentHTML('beforeend', ptsNote ? `<span class="ml-1 align-middle text-sm font-semibold text-white/80">${esc(ptsNote)}</span>` : '');
      $('heroRemaining').textContent = s.rewards.remainingThisCycle > 0
        ? `本期還可再拿 ${F.money(s.rewards.remainingThisCycle)}`
        : (s.events.ongoing ? '本期有上限的活動都已拿滿 🎉' : '新增回饋活動開始追蹤');
      $('heroSpend').textContent = F.money(s.month.spend, { decimals: 0 });
      $('heroReceived').textContent = F.money(s.rewards.receivedThisMonth, { decimals: 0 });
      $('heroEvents').textContent = `${s.events.ongoing} 個`;
      $('ptValue').textContent = s.points.valuedCount ? F.money(s.points.totalValue, { decimals: 0 }) : `${s.points.count} 種`;
      $('ptEarned').textContent = '+' + F.num(s.points.monthEarned);
      $('ptSpent').textContent = '−' + F.num(s.points.monthSpent);
      $('lastMonthSpend').textContent = F.money(s.month.lastMonthSpend, { decimals: 0 });
      $('yearReceived').textContent = F.money(s.rewards.receivedThisYear, { decimals: 0 });

      const rows = s.attention.map(attentionRow).filter(Boolean);
      $('attentionSection').hidden = !rows.length;
      $('attentionList').innerHTML = rows.join('');
      $('attentionCount').textContent = rows.length;

      $('eventsList').innerHTML = s.ongoingEvents.length
        ? s.ongoingEvents.map(eventCard).join('')
        : `<div class="card md:col-span-2">${A.emptyState('gift', '還沒有進行中的回饋活動', '把信用卡 / 行動支付的活動記下來，系統會幫你算還能拿多少', `<a class="btn btn-primary btn-sm" href="${A.url('/cashback?new=1')}">${icon('plus', 'i-sm')}新增活動</a>`)}</div>`;
    } catch (err) {
      $('eventsList').innerHTML = `<div class="card md:col-span-2">${A.errorState(err, 'retryBtn')}</div>`;
      $('heroReward').textContent = '—';
      const r = $('retryBtn');
      if (r) r.onclick = load;
    }
  }

  $('attentionList').addEventListener('click', async (e) => {
    const reg = e.target.closest('[data-reg]');
    const exp = e.target.closest('[data-exp]');
    if (!reg && !exp) return;
    e.preventDefault();
    const btn = reg || exp;
    A.setLoading(btn, true);
    try {
      if (reg) await A.send('PUT', `/cashback/${reg.dataset.reg}/registration`, { registered: true });
      else await A.send('PUT', `/points/${exp.dataset.point}/expiries/${exp.dataset.exp}`, { status: 'dismissed' });
      A.toast(reg ? '已標記為已登錄' : '已標記為已使用');
      load();
    } catch (err) {
      A.setLoading(btn, false);
      A.toast(err.message, { type: 'error' });
    }
  });

  load();
})();
