/* タスク・締切画面 */
const Tasks = {
  filter: { status: 'open', company: '', priority: '' },

  GROUPS: [
    ['overdue', '期限切れ'],
    ['soon', null], // ラベルは設定日数から作る
    ['week', '7日以内'],
    ['later', 'それ以降'],
    ['none', '期限なし'],
    ['done', '完了']
  ],

  render(el) {
    const f = this.filter;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>タスク・締切</h1><div class="sub">ES・課題・提出物・面接準備などを期限順に管理</div></div>
        <div class="actions"><button class="btn primary fab-src" data-act="add" data-fab-label="タスクを追加">＋ タスクを追加</button></div>
      </div>
      <div class="toolbar"><div class="toolbar-scroll">
        <div class="seg" id="tstatus">
          ${[['open', '未完了'], ['done', '完了'], ['all', 'すべて']].map(([k, l]) => `<button type="button" data-v="${k}" class="${f.status === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
        <select id="tcompany"><option value="">すべての企業</option><option value="-">(企業なし)</option>${UI.companyOptions(f.company, false)}</select>
        <select id="tprio"><option value="">すべての優先度</option>${Store.PRIORITIES.map(p => `<option ${p === f.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </div></div>
      <div id="tlist"></div>`;

    el.querySelector('#tcompany').value = f.company;
    el.querySelector('[data-act=add]').onclick = () => this.openForm(null, f.company && f.company !== '-' ? f.company : '');
    el.querySelectorAll('#tstatus button').forEach(b => (b.onclick = () => { f.status = b.dataset.v; this.render(el); }));
    el.querySelector('#tcompany').onchange = e => { f.company = e.target.value; this.renderList(); };
    el.querySelector('#tprio').onchange = e => { f.priority = e.target.value; this.renderList(); };
    this.renderList();
  },

  renderList() {
    const box = document.getElementById('tlist');
    if (!box) return;
    const f = this.filter;
    const list = Store.data.tasks.filter(t => {
      if (f.status === 'open' && t.done) return false;
      if (f.status === 'done' && !t.done) return false;
      if (f.company === '-' && t.companyId) return false;
      if (f.company && f.company !== '-' && t.companyId !== f.company) return false;
      if (f.priority && t.priority !== f.priority) return false;
      return true;
    });

    if (!Store.data.tasks.length) {
      box.innerHTML = UI.empty('タスクはまだありません。<br>企業から届いた締切や、やることを登録しましょう。', '<button class="btn primary" data-act="add2">＋ タスクを追加</button>');
      box.querySelector('[data-act=add2]').onclick = () => this.openForm();
      return;
    }
    if (!list.length) {
      box.innerHTML = UI.empty(f.status === 'open' ? '未完了のタスクはありません 🎉' : '条件に合うタスクはありません');
      return;
    }

    const byDeadline = (a, b) => (U.parse(a.deadline) || Infinity) - (U.parse(b.deadline) || Infinity);
    const prioRank = { '高': 0, '中': 1, '低': 2 };
    box.innerHTML = this.GROUPS.map(([key, label]) => {
      const items = list.filter(t => U.urgency(t) === key)
        .sort((a, b) => byDeadline(a, b) || prioRank[a.priority] - prioRank[b.priority]);
      if (!items.length) return '';
      const title = label || `${Store.data.settings.dueSoonDays}日以内`;
      return `<div class="task-group">
        <h2><span class="badge ${key === 'done' ? 'done' : 'u-' + key}">${title}</span><span class="count">${items.length}件</span></h2>
        ${items.map(t => this.row(t)).join('')}
      </div>`;
    }).join('');
    this.bindRowEvents(box);
  },

  /** タスク1行(ダッシュボード・企業詳細でも共通で使う) */
  row(t, compact = false) {
    const c = t.companyId ? Store.company(t.companyId) : null;
    const u = U.urgency(t);
    return `<div class="task-row u-${u}">
      <button type="button" class="check ${t.done ? 'on' : ''}" data-task-check="${t.id}" title="${t.done ? '未完了に戻す' : '完了にする'}">${t.done ? '✓' : ''}</button>
      <div class="grow">
        <div class="t-title">${U.esc(t.title)}</div>
        <div class="t-meta">
          ${c ? `<a href="#company/${c.id}" class="chip" style="text-decoration:none">${U.esc(c.name)}</a>` : ''}
          <span class="badge prio-${U.esc(t.priority)}">優先度 ${U.esc(t.priority)}</span>
          ${t.mailId && Store.mail(t.mailId) ? `<a class="linkchip" href="${U.esc(Gmail.link(t.mailId))}" target="_blank" rel="noopener noreferrer" title="${U.esc(Store.mail(t.mailId).subject)}">✉ 元のメール</a>` : ''}
          ${!compact && t.memo ? `<span title="${U.esc(t.memo)}">📝 ${U.esc(t.memo.length > 30 ? t.memo.slice(0, 30) + '…' : t.memo)}</span>` : ''}
        </div>
      </div>
      <div class="t-due">${UI.urgencyBadge(t)}<div>${t.deadline ? U.fmt(t.deadline) : ''}</div></div>
      ${compact ? '' : `<button class="icon-btn" data-task-edit="${t.id}" title="編集">✎</button>
      <button class="icon-btn" data-task-del="${t.id}" title="削除">🗑</button>`}
    </div>`;
  },

  bindRowEvents(root) {
    root.querySelectorAll('[data-task-check]').forEach(b => (b.onclick = e => {
      e.stopPropagation();
      const t = Store.task(b.dataset.taskCheck);
      Store.toggleTask(t.id);
      if (t.done) UI.toast(`「${t.title}」を完了にしました`);
    }));
    root.querySelectorAll('[data-task-edit]').forEach(b => (b.onclick = () => this.openForm(Store.task(b.dataset.taskEdit))));
    root.querySelectorAll('[data-task-del]').forEach(b => (b.onclick = () => {
      const t = Store.task(b.dataset.taskDel);
      if (confirm(`タスク「${t.title}」を削除しますか？`)) Store.deleteTask(t.id);
    }));
    // 行をクリックすると詳細を表示(チェック・編集・削除・リンクのクリックは除く)
    root.querySelectorAll('.task-row').forEach(row => {
      const id = row.querySelector('[data-task-check]').dataset.taskCheck;
      row.classList.add('clickable');
      row.onclick = e => { if (!e.target.closest('a,button')) this.openDetail(Store.task(id)); };
    });
  },

  /** タスクの詳細(読むための画面)。ここから完了・編集・削除もできる */
  openDetail(t) {
    if (!t) return;
    const c = t.companyId ? Store.company(t.companyId) : null;
    const m = t.mailId ? Store.mail(t.mailId) : null;
    UI.modal({
      title: t.title,
      body: `<div class="task-detail">
        <div style="margin-bottom:12px">${UI.urgencyBadge(t)}</div>
        <dl class="info-list">
          <dt>企業</dt><dd>${c ? `<a href="#company/${c.id}" data-close-nav>${U.esc(c.name)}</a>` : '—'}</dd>
          <dt>期限</dt><dd>${t.deadline ? U.fmt(t.deadline) + (t.deadline.length === 10 ? '(23:59まで)' : '') : '期限なし'}</dd>
          <dt>優先度</dt><dd><span class="badge prio-${U.esc(t.priority)}">${U.esc(t.priority)}</span></dd>
          <dt>状態</dt><dd>${t.done ? '完了' : '未完了'}</dd>
          ${m ? `<dt>元のメール</dt><dd><a class="linkchip" href="${U.esc(Gmail.link(m.id))}" target="_blank" rel="noopener noreferrer">✉ ${U.esc(m.subject)}</a></dd>` : ''}
        </dl>
        <div class="field" style="margin-top:14px"><label>メモ</label>
          ${t.memo ? `<div class="memo-box">${U.linkify(t.memo)}</div>` : '<div class="muted" style="font-size:13px">メモはありません</div>'}
        </div>
      </div>`,
      submitLabel: t.done ? '↺ 未完了に戻す' : '✓ 完了にする',
      footLeft: '<button type="button" class="btn danger" data-del>削除</button><button type="button" class="btn" data-edit>✎ 編集</button>',
      onOpen: form => {
        const close = form.querySelector('.modal-foot [data-close]');
        if (close) close.textContent = '閉じる';
        form.querySelector('[data-edit]').onclick = () => { UI.closeModal(); this.openForm(t); };
        form.querySelector('[data-del]').onclick = () => {
          if (!confirm(`タスク「${t.title}」を削除しますか？`)) return;
          UI.closeModal();
          Store.deleteTask(t.id);
        };
        // 企業名のリンクで移動するときはポップアップを閉じる
        form.querySelectorAll('[data-close-nav]').forEach(a => a.addEventListener('click', () => UI.closeModal()));
      },
      onSubmit: () => {
        Store.toggleTask(t.id);
        UI.toast(t.done ? `「${t.title}」を完了にしました` : `「${t.title}」を未完了に戻しました`);
      }
    });
  },

  /**
   * タスクの追加・編集フォーム
   * fromMail: { mailId, title } メールから登録するとき(件名をタイトルに入れ、元メールとリンクする)
   */
  openForm(t = null, presetCompanyId = '', presetDate = '', fromMail = null) {
    const isNew = !t;
    t = t || { priority: '中', companyId: presetCompanyId, deadline: presetDate, title: fromMail ? fromMail.title : '', mailId: fromMail ? fromMail.mailId : '' };
    const srcMail = t.mailId ? Store.mail(t.mailId) : null;
    const [date, time] = (t.deadline || '').split('T');

    UI.modal({
      title: isNew ? 'タスクを追加' : 'タスクを編集',
      body: `<div class="form-grid">
        <div class="field full"><label>タイトル <span class="req">*</span></label>
          <input type="text" name="title" required value="${U.esc(t.title)}" placeholder="例: ES提出、Webテスト受検、面接の逆質問を準備"></div>
        <div class="field full"><label>企業</label><select name="companyId">${UI.companyOptions(t.companyId)}</select></div>
        <div class="field"><label>期限日</label><input type="date" name="date" value="${U.esc(date || '')}"></div>
        <div class="field"><label>時刻</label><input type="time" name="time" value="${U.esc(time || '')}">
          <div class="help">空欄なら23:59締切として扱います</div></div>
        <div class="field"><label>優先度</label>
          <select name="priority">${Store.PRIORITIES.map(p => `<option ${p === t.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        ${isNew ? '' : `<div class="field"><label>状態</label><label style="font-weight:400;color:var(--text);display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" name="done" ${t.done ? 'checked' : ''}> 完了</label></div>`}
        <div class="field full"><label>メモ</label><textarea name="memo" placeholder="提出方法、文字数、URLなど">${U.esc(t.memo)}</textarea></div>
        ${srcMail ? `<div class="field full"><label>元のメール</label>
          <div class="src-mail">✉ <span class="src-subj" title="${U.esc(srcMail.subject)}">${U.esc(srcMail.subject)}</span>
            <span class="muted">${U.fmt(srcMail.date.slice(0, 10))}</span><span class="spacer"></span>
            <a class="btn small" href="${U.esc(Gmail.link(srcMail.id))}" target="_blank" rel="noopener noreferrer">Gmailで開く ↗</a></div>
          ${isNew ? '<div class="help">締切日はメールを見て入力してください。登録すると、このメールは確認済みになります。</div>' : ''}</div>` : ''}
      </div>`,
      footLeft: isNew ? '' : '<button type="button" class="btn danger" data-del>削除</button>',
      onOpen: form => {
        const del = form.querySelector('[data-del]');
        if (del) del.onclick = () => {
          if (!confirm(`タスク「${t.title}」を削除しますか？`)) return;
          Store.deleteTask(t.id);
          UI.closeModal();
        };
      },
      onSubmit: form => {
        const fd = new FormData(form);
        const d = fd.get('date');
        const tm = fd.get('time');
        const data = {
          title: fd.get('title').trim(),
          companyId: fd.get('companyId'),
          deadline: d ? (tm ? `${d}T${tm}` : d) : '',
          priority: fd.get('priority'),
          memo: fd.get('memo').trim()
        };
        if (!data.title) return false;
        if (!isNew) { data.id = t.id; data.done = fd.get('done') === 'on'; }
        if (isNew && srcMail) {
          data.mailId = srcMail.id;
          srcMail.checked = true; // メールからタスクを登録したら、そのメールは確認済みにする(下の保存で一緒に保存される)
        }
        Store.upsertTask(data);
        UI.toast(isNew ? (srcMail ? 'タスクを追加し、メールを確認済みにしました' : 'タスクを追加しました') : '保存しました');
      }
    });
  }
};
