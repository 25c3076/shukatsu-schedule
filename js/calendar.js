/*
 * カレンダー画面(月表示)
 * タスクの期限(tasks.deadline)と、選考ステージの日時(routes.stages.date)を表示する。
 * 新しいデータは持たず、既存のデータから毎回組み立てる。
 */
const Calendar = {
  cursor: null,     // 表示中の月の1日
  selected: null,   // 選択中の日 "YYYY-MM-DD"
  show: { tasks: true, stages: true, done: false },
  MAX_IN_CELL: 3,

  render(el) {
    if (!this.cursor) {
      const t = new Date();
      this.cursor = new Date(t.getFullYear(), t.getMonth(), 1);
      this.selected = U.ymd(t);
    }
    const y = this.cursor.getFullYear();
    const m = this.cursor.getMonth();
    const events = this.collect();
    const byDay = new Map();
    events.forEach(ev => {
      if (!byDay.has(ev.day)) byDay.set(ev.day, []);
      byDay.get(ev.day).push(ev);
    });
    byDay.forEach(list => list.sort((a, b) => (a.time || '99') .localeCompare(b.time || '99')));

    el.innerHTML = `
      <div class="page-head">
        <div><h1>カレンダー</h1><div class="sub">タスクの締切と選考の予定を月ごとに表示</div></div>
        <div class="actions"><button class="btn primary" data-act="add">＋ タスクを追加</button></div>
      </div>

      <div class="toolbar cal-toolbar">
        <div class="cal-nav">
          <button class="icon-btn" data-nav-m="-1" title="前の月">‹</button>
          <h2 class="cal-title">${y}年 ${m + 1}月</h2>
          <button class="icon-btn" data-nav-m="1" title="次の月">›</button>
          <button class="btn small" data-act="today">今日</button>
        </div>
        <div class="cal-filters">
          <label><input type="checkbox" data-show="tasks" ${this.show.tasks ? 'checked' : ''}><i class="lg lg-task"></i>タスク</label>
          <label><input type="checkbox" data-show="stages" ${this.show.stages ? 'checked' : ''}><i class="lg lg-stage"></i>選考予定</label>
          <label><input type="checkbox" data-show="done" ${this.show.done ? 'checked' : ''}>完了・終了したものも表示</label>
        </div>
      </div>

      <div class="cal-layout">
        <section class="card cal-card">
          <div class="cal-grid cal-head">${'日月火水木金土'.split('').map((w, i) => `<div class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}</div>
          <div class="cal-grid cal-body">${this.cells(y, m, byDay)}</div>
        </section>
        <section class="card cal-side">${this.dayPanel(byDay.get(this.selected) || [])}</section>
      </div>`;

    el.querySelectorAll('[data-nav-m]').forEach(b => (b.onclick = () => {
      this.cursor = new Date(y, m + Number(b.dataset.navM), 1);
      App.render();
    }));
    el.querySelector('[data-act=today]').onclick = () => {
      const t = new Date();
      this.cursor = new Date(t.getFullYear(), t.getMonth(), 1);
      this.selected = U.ymd(t);
      App.render();
    };
    el.querySelectorAll('[data-show]').forEach(c => (c.onchange = () => {
      this.show[c.dataset.show] = c.checked;
      App.render();
    }));
    el.querySelector('[data-act=add]').onclick = () => Tasks.openForm(null, '', this.selected);

    // 日付セルのクリック → その日を選択
    el.querySelectorAll('[data-day]').forEach(cell => (cell.onclick = e => {
      if (e.target.closest('[data-ev]')) return;
      this.selected = cell.dataset.day;
      // 前月・翌月の日をクリックしたらその月へ移動
      const d = U.parse(cell.dataset.day);
      if (d.getMonth() !== m) this.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      App.render();
    }));
    // 予定のクリック → タスクは編集、選考予定は企業詳細へ
    el.querySelectorAll('[data-ev]').forEach(chip => (chip.onclick = e => {
      e.stopPropagation();
      const ev = events.find(x => x.key === chip.dataset.ev);
      if (!ev) return;
      if (ev.type === 'task') Tasks.openDetail(Store.task(ev.id));
      else location.hash = '#company/' + ev.companyId;
    }));
    const addDay = el.querySelector('[data-act=add-day]');
    if (addDay) addDay.onclick = () => Tasks.openForm(null, '', this.selected);
    Tasks.bindRowEvents(el.querySelector('.cal-side'));
  },

  /** 表示する予定を集める */
  collect() {
    const out = [];
    if (this.show.tasks) {
      Store.data.tasks.forEach(t => {
        if (!t.deadline || (t.done && !this.show.done)) return;
        const [day, time] = t.deadline.split('T');
        const c = t.companyId ? Store.company(t.companyId) : null;
        out.push({
          key: 't' + t.id, type: 'task', id: t.id, day, time: time || '',
          title: t.title, company: c ? c.name : '', companyId: t.companyId,
          state: U.urgency(t), task: t
        });
      });
    }
    if (this.show.stages) {
      Store.data.routes.forEach(r => {
        const c = Store.company(r.companyId);
        if (!c) return;
        const ended = r.result !== '進行中';
        r.stages.forEach(s => {
          if (!s.date) return;
          if ((s.done || ended) && !this.show.done) return;
          const [day, time] = s.date.split('T');
          out.push({
            key: 's' + s.id, type: 'stage', day, time: time || '',
            title: s.name, company: c.name, companyId: c.id, route: r.name,
            state: s.done || ended ? 'done' : 'stage'
          });
        });
      });
    }
    return out;
  },

  /** 6週ぶんのセル(前月・翌月の日も含む) */
  cells(y, m, byDay) {
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    const today = U.ymd(new Date());
    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = U.ymd(d);
      const list = byDay.get(key) || [];
      const cls = [
        'cal-cell',
        d.getMonth() !== m ? 'other' : '',
        key === today ? 'today' : '',
        key === this.selected ? 'selected' : '',
        d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''
      ].join(' ');
      const shown = list.slice(0, this.MAX_IN_CELL);
      html += `<div class="${cls}" data-day="${key}">
        <div class="cal-date">${d.getDate()}</div>
        ${shown.map(ev => this.chip(ev)).join('')}
        ${list.length > shown.length ? `<div class="cal-more">他 ${list.length - shown.length}件</div>` : ''}
      </div>`;
    }
    return html;
  },

  chip(ev) {
    const label = ev.type === 'stage' ? `${ev.company} ${ev.title}` : ev.title;
    const tip = [ev.time, ev.company, ev.type === 'stage' ? `${ev.route}・${ev.title}` : ev.title].filter(Boolean).join(' ');
    return `<div class="ev ev-${ev.type} ev-${ev.state}" data-ev="${ev.key}" title="${U.esc(tip)}">
      ${ev.time ? `<span class="ev-time">${ev.time}</span>` : ''}${U.esc(label)}
    </div>`;
  },

  /** 右側: 選択した日の予定一覧 */
  dayPanel(list) {
    const d = U.parse(this.selected);
    const head = `${d.getMonth() + 1}月${d.getDate()}日(${'日月火水木金土'[d.getDay()]})`;
    const tasks = list.filter(e => e.type === 'task');
    const stages = list.filter(e => e.type === 'stage');
    return `
      <div class="card-title">${head}<button class="btn small more" data-act="add-day">＋ この日にタスク</button></div>
      ${!list.length ? UI.empty('予定はありません') : ''}
      ${stages.length ? `<div class="side-label">選考予定</div><div class="list">${stages.map(e => `
        <div class="list-item" data-ev="${e.key}" style="cursor:pointer">
          <span class="side-time">${e.time || '終日'}</span>
          <div class="grow">
            <div class="title">${U.esc(e.title)}</div>
            <div class="meta">${U.esc(e.company)} ・ ${U.esc(e.route)}</div>
          </div>
        </div>`).join('')}</div>` : ''}
      ${tasks.length ? `<div class="side-label">締切のタスク</div>${tasks.map(e => Tasks.row(e.task, true)).join('')}` : ''}`;
  }
};
