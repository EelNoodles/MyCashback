(function () {
  'use strict';
  const A = window.App;

  const cardListEl = document.getElementById('cardList');
  const pmListEl = document.getElementById('pmList');
  const newCardBtn = document.getElementById('newCardBtn');
  const newPmBtn = document.getElementById('newPmBtn');

  const cardForm = document.getElementById('cardForm');
  const cardFormError = document.getElementById('cardFormError');
  const cardModalTitle = document.getElementById('cardModalTitle');
  const deleteCardBtn = document.getElementById('deleteCardBtn');
  const cardPreview = document.getElementById('cardPreview');

  const pmForm = document.getElementById('pmForm');
  const pmFormError = document.getElementById('pmFormError');
  const pmModalTitle = document.getElementById('pmModalTitle');
  const deletePmBtn = document.getElementById('deletePmBtn');

  const KIND_LABELS = { credit: '信用卡', debit: '金融卡', bank: '銀行', other: '其他' };
  const NETWORK_LABELS = {
    visa: 'VISA', mastercard: 'Mastercard', jcb: 'JCB',
    amex: 'AMEX', unionpay: '銀聯', other: ''
  };

  // ─── Credit Card Renderer ───
  function renderCreditCard(item, opts = {}) {
    const { clickable = true, size = 'full' } = opts;
    const wrap = document.createElement('div');
    wrap.className = `credit-card credit-card--${item.kind || 'credit'}`;
    if (size === 'mini') {
      wrap.style.maxWidth = '180px';
      wrap.style.fontSize = '0.6rem';
    }

    let bgHtml = '';
    if (item.imageUrl) {
      bgHtml = `<img class="credit-card__bg" src="${A.url(item.imageUrl)}" alt="" />`;
    }

    const lastFourDisplay = item.lastFour
      ? `•••• •••• •••• ${item.lastFour}`
      : '•••• •••• •••• ••••';

    const networkLabel = item.network ? (NETWORK_LABELS[item.network] || '') : '';

    wrap.innerHTML = `
      ${bgHtml}
      <div class="credit-card__content">
        <div class="credit-card__header">
          <div>
            <div style="opacity:0.7;font-size:0.55rem">${KIND_LABELS[item.kind] || ''}</div>
            <div>${item.issuer || ''}</div>
          </div>
          <div class="credit-card__chip"></div>
        </div>
        <div class="credit-card__number">${lastFourDisplay}</div>
        <div class="credit-card__footer">
          <div class="credit-card__name">${item.name}</div>
          <div class="credit-card__network">${networkLabel}</div>
        </div>
      </div>`;

    if (clickable) {
      wrap.addEventListener('click', () => openCardModal(item));
    }
    return wrap;
  }

  // ─── Payment Method Renderer ───
  function renderPmCard(item) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'w-14 h-14 rounded-xl overflow-hidden flex-shrink-0';

    if (item.imageUrl) {
      iconWrap.innerHTML = `<img src="${A.url(item.imageUrl)}" alt="${item.name}" class="w-full h-full object-contain" />`;
    } else {
      iconWrap.style.background = A.gradientFromName(item.name);
      iconWrap.className += ' grid place-items-center text-white text-lg font-bold';
      iconWrap.textContent = A.initialsFrom(item.name);
    }

    const label = document.createElement('div');
    label.className = 'text-xs font-medium text-center truncate w-full';
    label.textContent = item.name;

    wrap.append(iconWrap, label);
    wrap.addEventListener('click', () => openPmModal(item));
    return wrap;
  }

  async function loadCards() {
    try {
      const data = await A.jsonFetch(A.api('/tags/cards'));
      cardListEl.innerHTML = '';
      if (!data.length) {
        cardListEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full">尚未新增任何卡片</div>`;
        return;
      }
      for (const c of data) cardListEl.appendChild(renderCreditCard(c));
    } catch (err) {
      cardListEl.innerHTML = `<div class="text-sm text-rose-500 col-span-full">載入失敗：${err.message}</div>`;
    }
  }

  async function loadPms() {
    try {
      const data = await A.jsonFetch(A.api('/tags/payment-methods'));
      pmListEl.innerHTML = '';
      if (!data.length) {
        pmListEl.innerHTML = `<div class="text-sm text-slate-400 col-span-full">尚未新增任何支付方式</div>`;
        return;
      }
      for (const p of data) pmListEl.appendChild(renderPmCard(p));
    } catch (err) {
      pmListEl.innerHTML = `<div class="text-sm text-rose-500 col-span-full">載入失敗：${err.message}</div>`;
    }
  }

  // ─── Live Card Preview ───
  function updateCardPreview() {
    if (!cardPreview) return;
    const item = {
      name: cardForm.name.value || '卡片名稱',
      kind: cardForm.kind.value || 'credit',
      issuer: cardForm.issuer.value || '',
      lastFour: cardForm.lastFour.value || '',
      network: cardForm.network.value || '',
      imageUrl: null  // no preview for file upload
    };
    cardPreview.innerHTML = '';
    cardPreview.appendChild(renderCreditCard(item, { clickable: false }));
  }

  // Listen to form changes to update preview
  ['name', 'kind', 'issuer', 'lastFour', 'network'].forEach(n => {
    const el = cardForm?.[n];
    if (el) el.addEventListener('input', updateCardPreview);
    if (el) el.addEventListener('change', updateCardPreview);
  });

  // ─── Card modal ───
  function openCardModal(c) {
    cardForm.reset();
    A.showError(cardFormError, '');
    if (c) {
      cardModalTitle.textContent = '編輯卡片';
      cardForm.id.value = c.id;
      cardForm.name.value = c.name;
      cardForm.kind.value = c.kind || 'credit';
      cardForm.issuer.value = c.issuer || '';
      cardForm.lastFour.value = c.lastFour || '';
      cardForm.network.value = c.network || '';
      cardForm.note.value = c.note || '';
      deleteCardBtn.classList.remove('hidden');
    } else {
      cardModalTitle.textContent = '新增卡片';
      cardForm.id.value = '';
      deleteCardBtn.classList.add('hidden');
    }
    updateCardPreview();
    A.openModal('cardModal');
  }
  newCardBtn?.addEventListener('click', () => openCardModal(null));

  cardForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = cardForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(cardFormError, '');
    try {
      const fd = new FormData(cardForm);
      const id = fd.get('id');
      // strip empty file input
      if (fd.get('image') && !(fd.get('image').size > 0)) fd.delete('image');
      if (id) {
        fd.delete('id');
        await A.jsonFetch(A.api(`/tags/cards/${id}`), { method: 'PUT', body: fd });
      } else {
        fd.delete('id');
        await A.jsonFetch(A.api('/tags/cards'), { method: 'POST', body: fd });
      }
      A.closeModal('cardModal');
      await loadCards();
    } catch (err) {
      A.showError(cardFormError, err.status === 409 ? '名稱重複' : err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deleteCardBtn?.addEventListener('click', async () => {
    const id = cardForm.id.value;
    if (!id) return;
    if (!confirm('刪除此卡片？已關聯的活動會自動解除綁定。')) return;
    try {
      await A.jsonFetch(A.api(`/tags/cards/${id}`), { method: 'DELETE' });
      A.closeModal('cardModal');
      await loadCards();
    } catch (err) {
      A.showError(cardFormError, err.message);
    }
  });

  // ─── PM modal ───
  function openPmModal(p) {
    pmForm.reset();
    A.showError(pmFormError, '');
    if (p) {
      pmModalTitle.textContent = '編輯支付方式';
      pmForm.id.value = p.id;
      pmForm.name.value = p.name;
      pmForm.note.value = p.note || '';
      deletePmBtn.classList.remove('hidden');
    } else {
      pmModalTitle.textContent = '新增支付方式';
      pmForm.id.value = '';
      deletePmBtn.classList.add('hidden');
    }
    A.openModal('pmModal');
  }
  newPmBtn?.addEventListener('click', () => openPmModal(null));

  pmForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = pmForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(pmFormError, '');
    try {
      const fd = new FormData(pmForm);
      const id = fd.get('id');
      if (fd.get('image') && !(fd.get('image').size > 0)) fd.delete('image');
      if (id) {
        fd.delete('id');
        await A.jsonFetch(A.api(`/tags/payment-methods/${id}`), { method: 'PUT', body: fd });
      } else {
        fd.delete('id');
        await A.jsonFetch(A.api('/tags/payment-methods'), { method: 'POST', body: fd });
      }
      A.closeModal('pmModal');
      await loadPms();
    } catch (err) {
      A.showError(pmFormError, err.status === 409 ? '名稱重複' : err.message);
    } finally {
      A.setLoading(submitBtn, false);
    }
  });

  deletePmBtn?.addEventListener('click', async () => {
    const id = pmForm.id.value;
    if (!id) return;
    if (!confirm('刪除此支付方式？已關聯的活動會自動解除綁定。')) return;
    try {
      await A.jsonFetch(A.api(`/tags/payment-methods/${id}`), { method: 'DELETE' });
      A.closeModal('pmModal');
      await loadPms();
    } catch (err) {
      A.showError(pmFormError, err.message);
    }
  });

  loadCards();
  loadPms();
})();
