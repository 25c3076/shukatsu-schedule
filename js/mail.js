/* メール画面(Gmail連携で取得した、企業からのメールの一覧) */
const Mail = {
  filter: { status: 'unchecked', company: '' },

  render(el, companyId) {
    // 企業詳細の「すべて見る」(#mail/企業ID)から来たときは、その企業のメールをすべて表示
    if (location.hash !== this.lastHash) {
      this.lastHash = location.hash;
      if (companyId) { this.filter.company = companyId; this.filter.status = 'all'; }
    }
    const st = Gmail.state();
    const f = this.filter;

    const head = `
      <div class="page-head">
        <div><h1>メール</h1><div class="sub">登録した企業から届いたメール(Gmail連携)</div></div>
        <div class="actions">
          <span class="muted gmail-status" style="font-size:12px">${U.esc(Gmail.statusText())}</span>
          ${st === 'on' || st === 'checking'
            ? `<button class="btn primary" data-act="check" ${st === 'checking' ? 'disabled' : ''}>↻ 更新</button>`
            : (st === 'off' || st === 'expired') ? `<button class="btn primary" data-act="connect">${st === 'expired' ? '再接続' : 'Gmailに接続'}</button>` : ''}
        </div>
      </div>`;

    // 使える状態になっていない場合の案内
    if (st === 'file' || st === 'unset') {
      el.innerHTML = head + UI.empty(st === 'file'
        ? 'Gmail連携は、<b>起動.command</b> から開いたときだけ使えます。<br>今は index.html を直接開いているため、Googleにログインできません。'
        : 'Gmail連携がまだ設定されていません。<br>設定画面でGoogle CloudのクライアントIDを入力してください。',
        st === 'unset' ? '<a class="btn primary" href="#settings">設定画面へ</a>' : '');
      return;
    }

    const all = Store.data.mails.slice().sort((a, b) => b.date.localeCompare(a.date));
    const list = all.filter(m => {
      if (f.status === 'unchecked' && m.checked) return false;
      if (f.company && m.companyId !== f.company) return false;
      return true;
    });
    // 企業が決まっていないメールは一番上に
    const undecided = list.filter(m => !m.companyId);
    const decided = list.filter(m => m.companyId);

    el.innerHTML = head + `
      <div class="toolbar">
        <div class="seg" id="mstatus">
          ${[['unchecked', `未確認 ${Store.uncheckedMailCount()}`], ['all', 'すべて']]
            .map(([k, l]) => `<button type="button" data-v="${k}" class="${f.status === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
        <select id="mcompany" style="width:auto"><option value="">すべての企業</option>${UI.companyOptions(f.company, false)}</select>
      </div>
      ${list.length
        ? `<div class="mail-list">${[...undecided, ...decided].map(m => this.row(m)).join('')}</div>`
        : UI.empty(all.length
          ? (f.status === 'unchecked' ? '未確認のメールはありません' : '条件に合うメールはありません')
          : (st === 'on' ? '登録した企業からのメールは見つかりませんでした。<br>企業情報の「メールの送信元」を登録すると見つけやすくなります。' : 'Gmailに接続すると、企業からのメールがここに表示されます。'))}`;

    el.querySelectorAll('#mstatus button').forEach(b => (b.onclick = () => { f.status = b.dataset.v; this.render(el); }));
    el.querySelector('#mcompany').onchange = e => { f.company = e.target.value; this.render(el); };
    this.bindHead(el);
    this.bindRows(el);
  },

  bindHead(el) {
    const c = el.querySelector('[data-act=check]');
    if (c) c.onclick = () => Gmail.check();
    const k = el.querySelector('[data-act=connect]');
    if (k) k.onclick = () => Gmail.connect();
  },

  /**
   * メール1行
   * opts.showCompany=false: 企業詳細の中など、企業名を出さない場合
   */
  row(m, opts = {}) {
    const showCompany = opts.showCompany !== false;
    const c = m.companyId ? Store.company(m.companyId) : null;
    const task = Store.taskOfMail(m.id);
    const d = new Date(m.date);
    const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    let companyCell = '';
    if (showCompany) {
      if (c) {
        companyCell = `<a class="m-company" href="#company/${c.id}">${U.esc(c.name)}</a>`;
      } else {
        // 複数の企業に一致: ユーザーが選ぶ(一致した企業を先頭に)
        const cand = (m.candidateIds || []).map(id => Store.company(id)).filter(Boolean);
        const others = Store.data.companies.filter(x => !(m.candidateIds || []).includes(x.id));
        companyCell = `<select class="m-pick" data-mail-pick="${m.id}" title="どの企業のメールか選んでください">
          <option value="">企業を選択</option>
          <optgroup label="一致した企業">${cand.map(x => `<option value="${x.id}">${U.esc(x.name)}</option>`).join('')}</optgroup>
          ${others.length ? `<optgroup label="その他の企業">${others.map(x => `<option value="${x.id}">${U.esc(x.name)}</option>`).join('')}</optgroup>` : ''}
        </select>`;
      }
    }

    return `<div class="mail-row ${m.checked ? 'checked' : ''} ${!m.companyId ? 'undecided' : ''} ${showCompany ? '' : 'no-company'}">
      <button type="button" class="m-check ${m.checked ? 'on' : ''}" data-mail-check="${m.id}" title="${m.checked ? '確認済み(押すと未確認に戻す)' : '未確認(押すと確認済みにする)'}" aria-label="${m.checked ? '未確認に戻す' : '確認済みにする'}">${m.checked ? '✓' : ''}</button>
      ${showCompany ? `<div class="m-co">${companyCell}</div>` : ''}
      <div class="m-main">
        <a class="m-subject" href="${U.esc(Gmail.link(m.id))}" target="_blank" rel="noopener noreferrer" title="Gmailで開く:${U.esc(m.subject)}">${U.esc(m.subject)}<span class="m-ext" aria-hidden="true">↗</span></a>
        <div class="m-from" title="${U.esc(m.from)}">${U.esc(m.from)}${!m.companyId ? ` ・ ${(m.candidateIds || []).length}社に一致` : ''}</div>
      </div>
      <div class="m-when">${when}</div>
      <div class="m-ops">
        ${task
          ? `<button type="button" class="donechip" data-task-open="${task.id}" title="登録したタスク:${U.esc(task.title)}(押すと詳細を表示)">☑ 登録済み:${U.esc(task.title)}</button>`
          : `<button type="button" class="btn small primary task-add" data-mail-task="${m.id}" title="件名と企業が入った状態でタスクを追加">＋ タスクに登録</button>`}
      </div>
    </div>`;
  },

  bindRows(root) {
    root.querySelectorAll('[data-mail-check]').forEach(b => (b.onclick = () => {
      const m = Store.mail(b.dataset.mailCheck);
      Store.setMailChecked(m.id, !m.checked);
    }));
    root.querySelectorAll('[data-mail-task]').forEach(b => (b.onclick = () => {
      const m = Store.mail(b.dataset.mailTask);
      Tasks.openForm(null, m.companyId, '', { mailId: m.id, title: m.subject });
    }));
    root.querySelectorAll('[data-task-open]').forEach(b => (b.onclick = () => Tasks.openDetail(Store.task(b.dataset.taskOpen))));
    root.querySelectorAll('[data-mail-pick]').forEach(s => (s.onchange = () => {
      if (s.value) {
        Store.setMailCompany(s.dataset.mailPick, s.value);
        UI.toast(`「${Store.company(s.value).name}」のメールにしました`);
      }
    }));
  },

  /** 企業詳細の「メール」カード(新しい5件まで) */
  companyCard(companyId) {
    const mails = Store.mailsOf(companyId);
    if (!mails.length && !Gmail.isConfigured()) return ''; // Gmail連携を使っていないなら出さない
    const unchecked = Store.uncheckedMailCount(companyId);
    return `<section class="card">
      <div class="card-title">メール <span class="hint">${mails.length ? `${mails.length}件${unchecked ? `(未確認 ${unchecked}件)` : ''}` : ''}</span>
        ${mails.length > 5 ? `<a class="more" href="#mail/${companyId}">すべて見る →</a>` : ''}</div>
      ${mails.length
        ? `<div class="mail-list">${mails.slice(0, 5).map(m => this.row(m, { showCompany: false })).join('')}</div>`
        : UI.empty('この企業からのメールはまだありません')}
    </section>`;
  }
};
