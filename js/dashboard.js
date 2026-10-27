/* ダッシュボード画面 */
const Dashboard = {
  render(el) {
    const d = Store.data;
    const statuses = d.companies.map(c => Store.companyStatus(c.id));
    const count = s => statuses.filter(x => x === s).length;
    const openTasks = d.tasks.filter(t => !t.done);
    const overdue = openTasks.filter(t => U.urgency(t) === 'overdue').length;
    const soon = openTasks.filter(t => U.urgency(t) === 'soon').length;
    // Gmail連携を使っているときだけ「未確認のメール」を出す
    const showMail = Gmail.isConfigured() || d.mails.length > 0;
    const mailCount = Store.uncheckedMailCount();

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1>ダッシュボード</h1>
          <div class="sub">${this.today()}</div>
        </div>
        <div class="actions">
          <button class="btn" data-act="add-task">＋ タスク</button>
          <button class="btn primary" data-act="add-company">＋ 企業を登録</button>
        </div>
      </div>

      <div class="kpis ${showMail ? 'six' : ''}">
        ${this.kpi('登録企業', d.companies.length, '社')}
        ${this.kpi('選考中', count('active'), '社')}
        ${this.kpi('内定', count('offer'), '社')}
        ${this.kpi(`締切${d.settings.dueSoonDays}日以内`, soon, '件', soon ? 'warn' : '')}
        ${this.kpi('期限切れ', overdue, '件', overdue ? 'alert' : '')}
        ${showMail ? `<a class="card kpi kpi-mail ${mailCount ? 'has' : ''}" href="#mail" title="メールの画面を開く">
          <div class="label">未確認のメール →</div><div class="value">${mailCount}<small>件</small></div></a>` : ''}
      </div>

      <div class="dash-grid">
        <section class="card">
          <div class="card-title">締切が近いタスク <a class="more" href="#tasks">すべて見る →</a></div>
          ${this.upcomingTasks()}
        </section>
        <section class="card">
          <div class="card-title">今後の選考予定 <span class="hint">日付を登録したステージ</span></div>
          ${this.upcomingStages()}
        </section>
        <section class="card">
          <div class="card-title">選考段階の分布 <span class="hint">進行中のルートが次に進むステージ</span></div>
          ${this.stageChart()}
        </section>
        <section class="card">
          <div class="card-title">企業の状況</div>
          ${this.statusChart(statuses)}
        </section>
        <section class="card span-2">
          <div class="card-title">選考中の企業 <span class="hint">志望度順</span><a class="more" href="#companies">企業一覧 →</a></div>
          ${this.progressTable()}
        </section>
      </div>`;

    el.querySelector('[data-act=add-company]').onclick = () => Companies.openForm();
    el.querySelector('[data-act=add-task]').onclick = () => Tasks.openForm();
    el.querySelectorAll('[data-company]').forEach(r => (r.onclick = () => (location.hash = '#company/' + r.dataset.company)));
    Tasks.bindRowEvents(el);
  },

  today() {
    const t = new Date();
    return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日(${'日月火水木金土'[t.getDay()]})`;
  },

  kpi(label, value, unit, cls = '') {
    return `<div class="card kpi ${cls}"><div class="label">${label}</div><div class="value">${value}<small>${unit}</small></div></div>`;
  },

  upcomingTasks() {
    const list = Store.data.tasks
      .filter(t => !t.done && t.deadline)
      .sort((a, b) => U.parse(a.deadline) - U.parse(b.deadline))
      .slice(0, 6);
    if (!list.length) return UI.empty('期限のある未完了タスクはありません');
    return `<div>${list.map(t => Tasks.row(t, true)).join('')}</div>`;
  },

  upcomingStages() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const items = [];
    Store.data.routes.forEach(r => {
      if (r.result !== '進行中') return;
      const c = Store.company(r.companyId);
      if (!c) return;
      r.stages.forEach(s => {
        const dt = U.parse(s.date);
        if (dt && !s.done && dt >= now) items.push({ c, r, s, dt });
      });
    });
    items.sort((a, b) => a.dt - b.dt);
    if (!items.length) return UI.empty('予定はまだありません。<br>企業詳細の「ステージ編集」で日付を登録できます。');
    return `<div class="list">${items.slice(0, 6).map(({ c, r, s, dt }) => `
      <div class="list-item clickable" data-company="${c.id}" style="cursor:pointer">
        <div class="date-box"><div class="m">${dt.getMonth() + 1}月</div><div class="d">${dt.getDate()}</div></div>
        <div class="grow">
          <div class="title">${U.esc(s.name)}<span class="muted" style="font-weight:400"> ・ ${U.esc(c.name)}</span></div>
          <div class="meta">${U.esc(r.name)} ・ ${U.fmt(s.date)} ・ ${U.leftLabel(s.date).replace('まで', '')}</div>
        </div>
      </div>`).join('')}</div>`;
  },

  stageChart() {
    const counts = new Map();
    Store.data.routes.forEach(r => {
      if (r.result !== '進行中') return;
      const i = Store.currentIndex(r);
      const name = i === -1 ? '全ステージ完了' : r.stages[i].name;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    if (!counts.size) return UI.empty('進行中の選考ルートがありません');

    // テンプレートの並び順で表示(カスタムのステージ名は後ろへ)
    const order = [];
    Store.data.stageTemplates.forEach(t => t.stages.forEach(s => { if (!order.includes(s)) order.push(s); }));
    const rank = n => (order.includes(n) ? order.indexOf(n) : 999);
    const rows = [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
    const max = Math.max(...rows.map(r => r[1]));

    return `<div class="bars">${rows.map(([name, n]) => `
      <div class="bar-row">
        <span class="name" title="${U.esc(name)}">${U.esc(name)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div>
        <span class="num">${n}</span>
      </div>`).join('')}</div>`;
  },

  statusChart(statuses) {
    const total = statuses.length;
    if (!total) return UI.empty('企業が登録されていません');
    const parts = [
      ['active', '選考中', 'var(--accent)'],
      ['offer', '内定', 'var(--offer)'],
      ['idle', '検討中', 'var(--week)'],
      ['closed', '終了', 'var(--closed)']
    ].map(([k, label, color]) => ({ label, color, n: statuses.filter(s => s === k).length }));

    const openTasks = Store.data.tasks.filter(t => !t.done).length;
    const doneTasks = Store.data.tasks.length - openTasks;
    const pct = Store.data.tasks.length ? Math.round((doneTasks / Store.data.tasks.length) * 100) : 0;

    return `
      <div class="stack">${parts.filter(p => p.n).map(p => `<span style="width:${(p.n / total) * 100}%;background:${p.color}" title="${p.label} ${p.n}社"></span>`).join('')}</div>
      <div class="legend">${parts.map(p => `<span><i style="background:${p.color}"></i>${p.label} ${p.n}社</span>`).join('')}</div>
      <div style="margin-top:22px" class="card-title">タスクの完了率 <span class="hint">${doneTasks} / ${Store.data.tasks.length} 件</span></div>
      <div class="stack"><span style="width:${pct}%;background:var(--accent)"></span></div>
      <div class="legend"><span>完了 ${pct}%</span><span>未完了 ${openTasks}件</span></div>`;
  },

  progressTable() {
    const list = Store.data.companies
      .filter(c => Store.hasActiveRoute(c.id))
      .sort((a, b) => (b.aspiration || 0) - (a.aspiration || 0));
    if (!list.length) return UI.empty('選考中の企業はありません');

    return `<table class="prog-table"><tbody>${list.map(c => {
      const routes = Store.routesOf(c.id).filter(r => r.result === '進行中');
      const next = Companies.nextAction(c.id);
      return `<tr class="clickable" data-company="${c.id}">
        <td class="cname" style="width:170px">${U.esc(c.name)}<br>${U.stars(c.aspiration)}</td>
        <td>${routes.map(r => {
          const i = Store.currentIndex(r);
          return `<div style="margin:3px 0">
            <div style="font-size:12px;color:var(--muted)">${U.esc(r.name)} ・ 次: <b style="color:var(--text)">${i === -1 ? '完了' : U.esc(r.stages[i].name)}</b></div>
            <div class="mini-steps">${r.stages.map((s, j) => `<span class="${s.done ? 'done' : j === i ? 'current' : ''}" title="${U.esc(s.name)}"></span>`).join('')}</div>
          </div>`;
        }).join('')}</td>
        <td style="width:260px;font-size:12.5px">${next}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
  }
};
