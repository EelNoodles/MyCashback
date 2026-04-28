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

  const pmForm = document.getElementById('pmForm');
  const pmFormError = document.getElementById('pmFormError');
  const pmModalTitle = document.getElementById('pmModalTitle');
  const deletePmBtn = document.getElementById('deletePmBtn');

  const KIND_LABELS = { credit: '信用卡', debit: '金融卡', bank: '銀行', other: '其他' };

  function rowEl(item, type) {
    const li = document.createElement('li');
    li.className = 'py-3 flex items-center justify-between gap-3';
    const left = document.createElement('div');
    left.className = 'flex items-center gap-3 min-w-0';
    const dot = document.createElement('div');
    dot.className = 'w-9 h-9 rounded-xl text-white grid place-items-center text-sm font-semibold flex-shrink-0';
    dot.style.background = A.gradientFromName(item.name);
    dot.textContent = A.initialsFrom(item.name);
    const text = document.createElement('div');
    text.className = 'min-w-0';
    text.innerHTML = `
      <div class="text-sm font-medium truncate">${item.name}</div>
      <div class="text-xs text-slate-400 truncate">
        ${type === 'card' ? (KIND_LABELS[item.kind] || item.kind) + (item.issuer ? ` · ${item.issuer}` : '') : (item.note || '')}
      </div>`;
    left.append(dot, text);

    const actions = document.createElement('div');
    actions.className = 'flex gap-2 flex-shrink-0';
    const editBtn = document.createElement('button');
    editBtn.className = 'text-xs text-brand-600 hover:underline';
    editBtn.textContent = '編輯';
    editBtn.addEventListener('click', () => type === 'card' ? openCardModal(item) : openPmModal(item));
    actions.appendChild(editBtn);

    li.append(left, actions);
    return li;
  }

  async function loadCards() {
    try {
      const data = await A.jsonFetch(A.api('/tags/cards'));
      cardListEl.innerHTML = '';
      if (!data.length) {
        cardListEl.innerHTML = `<li class="py-3 text-sm text-slate-400">尚未新增任何卡片</li>`;
        return;
      }
      for (const c of data) cardListEl.appendChild(rowEl(c, 'card'));
    } catch (err) {
      cardListEl.innerHTML = `<li class="py-3 text-sm text-rose-500">載入失敗：${err.message}</li>`;
    }
  }
  async function loadPms() {
    try {
      const data = await A.jsonFetch(A.api('/tags/payment-methods'));
      pmListEl.innerHTML = '';
      if (!data.length) {
        pmListEl.innerHTML = `<li class="py-3 text-sm text-slate-400">尚未新增任何支付方式</li>`;
        return;
      }
      for (const p of data) pmListEl.appendChild(rowEl(p, 'pm'));
    } catch (err) {
      pmListEl.innerHTML = `<li class="py-3 text-sm text-rose-500">載入失敗：${err.message}</li>`;
    }
  }

  // ----- Card modal -----
  function openCardModal(c) {
    cardForm.reset();
    A.showError(cardFormError, '');
    if (c) {
      cardModalTitle.textContent = '編輯卡片';
      cardForm.id.value = c.id;
      cardForm.name.value = c.name;
      cardForm.kind.value = c.kind || 'credit';
      cardForm.issuer.value = c.issuer || '';
      cardForm.note.value = c.note || '';
      deleteCardBtn.classList.remove('hidden');
    } else {
      cardModalTitle.textContent = '新增卡片';
      cardForm.id.value = '';
      deleteCardBtn.classList.add('hidden');
    }
    A.openModal('cardModal');
  }
  newCardBtn?.addEventListener('click', () => openCardModal(null));

  cardForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = cardForm.querySelector('button[type=submit]');
    A.setLoading(submitBtn, true);
    A.showError(cardFormError, '');
    try {
      const id = cardForm.id.value;
      const data = {
        name: cardForm.name.value,
        kind: cardForm.kind.value,
        issuer: cardForm.issuer.value,
        note: cardForm.note.value
      };
      if (id) await A.jsonFetch(A.api(`/tags/cards/${id}`), { method: 'PUT', body: data });
      else await A.jsonFetch(A.api('/tags/cards'), { method: 'POST', body: data });
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

  // ----- PM modal -----
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
      const id = pmForm.id.value;
      const data = { name: pmForm.name.value, note: pmForm.note.value };
      if (id) await A.jsonFetch(A.api(`/tags/payment-methods/${id}`), { method: 'PUT', body: data });
      else await A.jsonFetch(A.api('/tags/payment-methods'), { method: 'POST', body: data });
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
