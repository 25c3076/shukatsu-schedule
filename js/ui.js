/* モーダル・トースト・小さな表示部品 */
const UI = {
  /**
   * モーダルを開く
   * onSubmit(form) が false を返すと閉じない
   */
  modal({ title, body, submitLabel = '保存', onSubmit, onOpen, wide = false, footLeft = '' }) {
    const dlg = document.getElementById('modal');
    dlg.className = 'modal' + (wide ? ' wide' : '');
    dlg.innerHTML = `
      <form class="modal-form">
        <header class="modal-head">
          <h2>${U.esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="閉じる">✕</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">
          ${footLeft}
          <span class="spacer"></span>
          <button type="button" class="btn" data-close>${onSubmit ? 'キャンセル' : '閉じる'}</button>
          ${onSubmit ? `<button type="submit" class="btn primary">${U.esc(submitLabel)}</button>` : ''}
        </footer>
      </form>`;
    const form = dlg.querySelector('form');
    dlg.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => dlg.close()));
    form.onsubmit = e => {
      e.preventDefault();
      if (!onSubmit) return;
      if (onSubmit(form) !== false) dlg.close();
    };
    if (onOpen) onOpen(form, dlg);
    dlg.showModal();
    const first = form.querySelector('.modal-body input:not([type=checkbox]), .modal-body select, .modal-body textarea');
    if (first) first.focus();
  },

  closeModal() {
    document.getElementById('modal').close();
  },

  toast(msg, type = 'info') {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add('hide'), 2600);
    setTimeout(() => el.remove(), 3000);
  },

  /** 緊急度のバッジ */
  urgencyBadge(task) {
    const u = U.urgency(task);
    if (u === 'done') return '<span class="badge done">完了</span>';
    return `<span class="badge u-${u}">${U.esc(U.leftLabel(task.deadline))}</span>`;
  },

  resultBadge(result) {
    const cls = { '進行中': 'active', '内定': 'offer', '不合格': 'closed', '辞退': 'closed' }[result] || 'closed';
    return `<span class="badge r-${cls}">${U.esc(result)}</span>`;
  },

  statusLabel(status) {
    return { active: '選考中', offer: '内定', closed: '終了', idle: '検討中' }[status];
  },

  /** 企業の選択肢 */
  companyOptions(selectedId, withNone = true) {
    const opts = Store.data.companies
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${U.esc(c.name)}</option>`)
      .join('');
    return (withNone ? `<option value="">(企業なし)</option>` : '') + opts;
  },

  /** 選考ステージのステッパー表示 */
  stepper(route, interactive = false) {
    const cur = Store.currentIndex(route);
    const finished = route.result !== '進行中';
    return `<ol class="stepper ${interactive ? 'interactive' : ''} ${finished ? 'finished' : ''}">
      ${route.stages.map((s, i) => {
        const state = s.done ? 'done' : i === cur && !finished ? 'current' : 'todo';
        const inner = `<span class="dot">${s.done ? '✓' : i + 1}</span>
          <span class="step-name">${U.esc(s.name)}</span>
          <span class="step-date">${s.date ? U.fmt(s.date) : ''}</span>`;
        return interactive
          ? `<li class="step ${state}"><button type="button" data-step="${route.id}:${i}" title="ここまで完了にする">${inner}</button></li>`
          : `<li class="step ${state}">${inner}</li>`;
      }).join('')}
    </ol>`;
  },

  empty(msg, actionHtml = '') {
    return `<div class="empty"><p>${msg}</p>${actionHtml}</div>`;
  }
};
