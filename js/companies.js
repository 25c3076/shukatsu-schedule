/* 企業一覧・企業詳細・企業/選考ルートの編集 */
const Companies = {
  filter: { q: '', status: 'all', sort: 'aspiration' },

  /* ================= 一覧 ================= */
  renderList(el) {
    const f = this.filter;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>企業</h1><div class="sub">${Store.data.companies.length}社を管理中</div></div>
        <div class="actions"><button class="btn primary" data-act="add">＋ 企業を登録</button></div>
      </div>
      <div class="toolbar">
        <input type="search" id="cq" placeholder="企業名・業界・職種で検索" value="${U.esc(f.q)}">
        <div class="seg" id="cstatus">
          ${[['all', 'すべて'], ['active', '選考中'], ['idle', '検討中'], ['offer', '内定'], ['closed', '終了']]
            .map(([k, l]) => `<button type="button" data-v="${k}" class="${f.status === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
        <select id="csort">
          <option value="aspiration">志望度順</option>
          <option value="deadline">締切が近い順</option>
          <option value="name">名前順</option>
          <option value="created">登録順</option>
        </select>
      </div>
      <div id="clist"></div>`;

    el.querySelector('#csort').value = f.sort;
    el.querySelector('[data-act=add]').onclick = () => this.openForm();
    el.querySelector('#cq').oninput = e => { f.q = e.target.value; this.renderCards(); };
    el.querySelector('#csort').onchange = e => { f.sort = e.target.value; this.renderCards(); };
    el.querySelectorAll('#cstatus button').forEach(b => (b.onclick = () => {
      f.status = b.dataset.v;
      el.querySelectorAll('#cstatus button').forEach(x => x.classList.toggle('on', x === b));
      this.renderCards();
    }));
    this.renderCards();
  },

  renderCards() {
    const box = document.getElementById('clist');
    if (!box) return;
    const f = this.filter;
    const q = f.q.trim().toLowerCase();

    let list = Store.data.companies.filter(c => {
      if (f.status !== 'all' && Store.companyStatus(c.id) !== f.status) return false;
      if (!q) return true;
      return [c.name, c.industry, ...(c.jobTypes || [])].join(' ').toLowerCase().includes(q);
    });

    const nearest = c => {
      const ds = Store.tasksOf(c.id).filter(t => !t.done && t.deadline).map(t => U.parse(t.deadline));
      return ds.length ? Math.min(...ds) : Infinity;
    };
    const sorters = {
      aspiration: (a, b) => (b.aspiration || 0) - (a.aspiration || 0),
      deadline: (a, b) => nearest(a) - nearest(b),
      name: (a, b) => a.name.localeCompare(b.name, 'ja'),
      created: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')
    };
    list.sort(sorters[f.sort]);

    if (!Store.data.companies.length) {
      box.innerHTML = UI.empty('まだ企業が登録されていません。', '<button class="btn primary" data-act="add2">＋ 最初の企業を登録</button>');
      box.querySelector('[data-act=add2]').onclick = () => this.openForm();
      return;
    }
    if (!list.length) {
      box.innerHTML = UI.empty('条件に合う企業がありません');
      return;
    }

    box.innerHTML = `<div class="company-list">
      <div class="company-list-head">
        <span>企業</span><span>状態</span><span>選考の進み具合</span><span>次にやること</span><span></span>
      </div>
      ${list.map(c => this.card(c)).join('')}
    </div>`;
    box.querySelectorAll('[data-company]').forEach(x => (x.onclick = () => (location.hash = '#company/' + x.dataset.company)));
  },

  /** 企業一覧の1行 */
  card(c) {
    const status = Store.companyStatus(c.id);
    const routes = Store.routesOf(c.id);
    const badgeCls = { active: 'r-active', offer: 'r-offer', closed: '', idle: 'u-week' }[status];
    return `<div class="company-row" data-company="${c.id}">
      <div class="c-name">
        <div class="name">${U.esc(c.name)}${Store.uncheckedMailCount(c.id) ? `<span class="mailicon" title="未確認のメール ${Store.uncheckedMailCount(c.id)}件">✉ ${Store.uncheckedMailCount(c.id)}</span>` : ''}</div>
        <div class="industry">${U.esc(c.industry || '業界未設定')} ${U.stars(c.aspiration)}</div>
      </div>
      <div class="c-status"><span class="badge ${badgeCls}">${UI.statusLabel(status)}</span></div>
      <div class="c-routes">
        ${routes.length ? routes.map(r => {
          const i = Store.currentIndex(r);
          const label = r.result !== '進行中' ? UI.resultBadge(r.result) : `次: <b>${i === -1 ? '完了' : U.esc(r.stages[i].name)}</b>`;
          return `<div class="route-line">
            <div><span class="rname">${U.esc(r.name)}</span> ・ ${label}</div>
            <div class="mini-steps">${r.stages.map((s, j) => `<span class="${s.done ? 'done' : j === i && r.result === '進行中' ? 'current' : ''}"></span>`).join('')}</div>
          </div>`;
        }).join('') : '<div class="route-line muted">選考ルート未登録</div>'}
      </div>
      <div class="c-next">${this.nextAction(c.id)}</div>
      <div class="c-arrow" aria-hidden="true">›</div>
    </div>`;
  },

  /** 次にやること: 最も近い未完了タスク → 日付つきの次ステージ → 次ステージ */
  nextAction(companyId) {
    const t = Store.tasksOf(companyId)
      .filter(x => !x.done && x.deadline)
      .sort((a, b) => U.parse(a.deadline) - U.parse(b.deadline))[0];
    if (t) return `<b>締切</b> ${U.esc(t.title)} ${UI.urgencyBadge(t)}`;

    const routes = Store.routesOf(companyId).filter(r => r.result === '進行中');
    for (const r of routes) {
      const i = Store.currentIndex(r);
      if (i >= 0 && r.stages[i].date) return `<b>予定</b> ${U.esc(r.stages[i].name)} ・ ${U.fmt(r.stages[i].date)}`;
    }
    for (const r of routes) {
      const i = Store.currentIndex(r);
      if (i >= 0) return `<b>次</b> ${U.esc(r.stages[i].name)}<span class="muted">(日程未定)</span>`;
    }
    return '<span class="muted">予定されているアクションはありません</span>';
  },

  /* ================= 詳細 ================= */
  renderDetail(el, id) {
    const c = Store.company(id);
    if (!c) {
      el.innerHTML = UI.empty('企業が見つかりません', '<a class="btn" href="#companies">企業一覧へ</a>');
      return;
    }
    const routes = Store.routesOf(id);
    const tasks = Store.tasksOf(id).sort((a, b) => (a.done - b.done) || ((U.parse(a.deadline) || Infinity) - (U.parse(b.deadline) || Infinity)));

    el.innerHTML = `
      <a class="back" href="#companies">← 企業一覧</a>
      <div class="page-head">
        <div>
          <h1>${U.esc(c.name)}</h1>
          <div class="sub">${U.esc(c.industry || '業界未設定')} ・ 志望度 ${U.stars(c.aspiration)} ・ ${UI.statusLabel(Store.companyStatus(id))}</div>
        </div>
        <div class="actions">
          ${this.linkButton(c.url, '採用ページ', 'btn')}
          ${this.isUrl(c.mypageUrl)
            ? this.linkButton(c.mypageUrl, 'マイページを開く', 'btn mypage-btn')
            : `<button class="btn mypage-add" data-act="mypage-edit">＋ マイページを登録</button>`}
          <button class="btn" data-act="edit">編集</button>
          <button class="btn danger" data-act="del">削除</button>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <section>
            <div class="card-title" style="margin-bottom:10px">選考ルート <span class="hint">ステージをクリックすると「ここまで完了」になります</span>
              <button class="btn small more" data-act="add-route" style="margin-left:auto">＋ ルートを追加</button></div>
            ${routes.length ? routes.map(r => this.routeCard(r)).join('<div style="height:12px"></div>') :
              UI.empty('選考ルートがありません。<br>本選考・インターンなど、選考ごとにルートを追加します。', '<button class="btn primary" data-act="add-route">＋ ルートを追加</button>')}
          </section>

          <section class="card">
            <div class="card-title">タスク・提出物 <button class="btn small more" data-act="add-task">＋ タスク</button></div>
            ${tasks.length ? tasks.map(t => Tasks.row(t)).join('') : UI.empty('この企業のタスクはありません')}
          </section>

          ${Mail.companyCard(id)}
        </div>

        <div>
          <section class="card">
            <div class="card-title">企業情報</div>
            <dl class="info-list">
              <dt>職種</dt><dd>${(c.jobTypes || []).map(j => `<span class="chip">${U.esc(j)}</span>`).join(' ') || '—'}</dd>
              <dt>特色</dt><dd>${U.esc(c.features) || '—'}</dd>
              <dt>求める人材</dt><dd>${U.esc(c.idealCandidate) || '—'}</dd>
              <dt>メモ</dt><dd>${U.esc(c.memo) || '—'}</dd>
              <dt>メール送信元</dt><dd>${(c.mailDomains || []).map(m => U.esc(m)).join('<br>') || '—'}<div class="future">将来のGmail連携で使用</div></dd>
            </dl>
          </section>
        </div>
      </div>`;

    el.querySelector('[data-act=edit]').onclick = () => this.openForm(c);
    el.querySelectorAll('[data-act=mypage-edit]').forEach(b => (b.onclick = () => this.openMypageForm(c)));
    el.querySelector('[data-act=del]').onclick = () => {
      if (!confirm(`「${c.name}」を削除しますか？\n選考ルートとタスクもすべて削除されます。`)) return;
      Store.deleteCompany(id);
      UI.toast('削除しました');
      location.hash = '#companies';
    };
    el.querySelectorAll('[data-act=add-route]').forEach(b => (b.onclick = () => this.openRouteForm(id)));
    el.querySelector('[data-act=add-task]').onclick = () => Tasks.openForm(null, id);

    el.querySelectorAll('[data-step]').forEach(b => (b.onclick = () => {
      const [rid, i] = b.dataset.step.split(':');
      const r = Store.route(rid);
      const wasComplete = Store.isComplete(r);
      Store.setProgress(rid, Number(i));
      if (!wasComplete) this.askOffer(rid);
    }));
    el.querySelectorAll('[data-route-edit]').forEach(b => (b.onclick = () => this.openStageEditor(b.dataset.routeEdit)));
    el.querySelectorAll('[data-route-del]').forEach(b => (b.onclick = () => {
      const r = Store.route(b.dataset.routeDel);
      if (confirm(`選考ルート「${r.name}」を削除しますか？`)) Store.deleteRoute(r.id);
    }));
    el.querySelectorAll('[data-route-result]').forEach(s => (s.onchange = () => {
      const r = Store.route(s.dataset.routeResult);
      r.result = s.value;
      Store.updateRoute(r);
    }));
    Tasks.bindRowEvents(el);
    Mail.bindRows(el);
  },

  routeCard(r) {
    return `<div class="card route-card">
      <div class="route-head">
        <h3>${U.esc(r.name)}</h3>
        <span class="muted" style="font-size:12px">${Math.round(Store.progress(r) * 100)}% 完了</span>
        <div class="actions">
          <select data-route-result="${r.id}" aria-label="結果">
            ${Store.RESULTS.map(x => `<option ${x === r.result ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
          <button class="btn small" data-route-edit="${r.id}">ステージ編集</button>
          <button class="icon-btn" data-route-del="${r.id}" title="ルートを削除">🗑</button>
        </div>
      </div>
      ${r.stages.length ? UI.stepper(r, true) : '<div class="muted">ステージがありません。「ステージ編集」から追加してください。</div>'}
    </div>`;
  },

  /* ================= 企業フォーム ================= */
  openForm(c = null) {
    const isNew = !c;
    c = c || { aspiration: 3 };
    const tplOpts = Store.data.stageTemplates.map(t => `<option value="${t.id}">${U.esc(t.name)}</option>`).join('');

    UI.modal({
      title: isNew ? '企業を登録' : '企業情報を編集',
      wide: true,
      body: `<div class="form-grid">
        <div class="field"><label>企業名 <span class="req">*</span></label><input type="text" name="name" required value="${U.esc(c.name)}"></div>
        <div class="field"><label>業界</label><input type="text" name="industry" value="${U.esc(c.industry)}" placeholder="例: IT・ソフトウェア"></div>
        <div class="field"><label>志望度</label>
          <div class="radio-stars">${[1, 2, 3, 4, 5].map(n => `<label class="${n <= c.aspiration ? 'on' : ''}"><input type="radio" name="aspiration" value="${n}" ${n === c.aspiration ? 'checked' : ''}>★</label>`).join('')}</div>
        </div>
        <div class="field"><label>職種</label><input type="text" name="jobTypes" value="${U.esc((c.jobTypes || []).join(', '))}" placeholder="カンマ区切り 例: 総合職, エンジニア"></div>
        <div class="field"><label>採用ページURL</label><input type="url" name="url" value="${U.esc(c.url)}" placeholder="https://"></div>
        <div class="field"><label>マイページURL</label><input type="url" name="mypageUrl" value="${U.esc(c.mypageUrl)}" placeholder="https://">
          <div class="help">ID・パスワードは保存しないでください</div></div>
        <div class="field full"><label>企業の特色</label><textarea name="features" placeholder="事業内容、強み、社風など">${U.esc(c.features)}</textarea></div>
        <div class="field full"><label>求める人材</label><textarea name="idealCandidate">${U.esc(c.idealCandidate)}</textarea></div>
        <div class="field full"><label>メモ</label><textarea name="memo">${U.esc(c.memo)}</textarea></div>
        <div class="field full"><label>メールの送信元ドメイン</label><input type="text" name="mailDomains" value="${U.esc((c.mailDomains || []).join(', '))}" placeholder="例: example.co.jp, axol.jp">
          <div class="help">将来のGmail連携で、この企業からのメールを見分けるのに使います(今は入力だけ)</div></div>
        ${isNew ? `<div class="field full"><label>最初の選考ルート</label>
          <select name="template"><option value="">あとで追加する</option>${tplOpts}</select></div>` : ''}
      </div>`,
      onOpen: form => {
        const labels = form.querySelectorAll('.radio-stars label');
        labels.forEach((l, i) => l.querySelector('input').addEventListener('change', () => {
          labels.forEach((x, j) => x.classList.toggle('on', j <= i));
        }));
      },
      onSubmit: form => {
        const fd = new FormData(form);
        const data = {
          name: fd.get('name').trim(),
          industry: fd.get('industry').trim(),
          aspiration: Number(fd.get('aspiration')) || 0,
          jobTypes: U.splitList(fd.get('jobTypes')),
          url: fd.get('url').trim(),
          mypageUrl: fd.get('mypageUrl').trim(),
          features: fd.get('features').trim(),
          idealCandidate: fd.get('idealCandidate').trim(),
          memo: fd.get('memo').trim(),
          mailDomains: U.splitList(fd.get('mailDomains'))
        };
        if (!data.name) return false;
        if (!isNew) data.id = c.id;
        const saved = Store.upsertCompany(data);
        if (isNew && fd.get('template')) Store.addRoute(saved.id, '', fd.get('template'));
        UI.toast(isNew ? `「${data.name}」を登録しました` : '保存しました');
        if (isNew) location.hash = '#company/' + saved.id;
      }
    });
  },

  /**
   * 全ステージを完了にしたとき、結果を「内定」にするか確認する
   * (進行中のルートで、今回の操作で初めて全完了になった場合だけ)
   */
  askOffer(routeId) {
    const r = Store.route(routeId);
    if (!r || r.result !== '進行中' || !Store.isComplete(r)) return;
    const c = Store.company(r.companyId);
    UI.modal({
      title: '全ステージが完了しました',
      body: `<p style="margin:0">「${U.esc(c ? c.name : '')}」の「${U.esc(r.name)}」がすべて完了しました。<br>結果を<b>「内定」</b>にしますか？</p>
        <p class="muted" style="font-size:12px;margin:10px 0 0">インターンなど内定がない選考の場合は「あとで」を選んでください。結果はルートのプルダウンからいつでも変更できます。</p>`,
      submitLabel: '内定にする',
      onSubmit: () => {
        r.result = '内定';
        Store.updateRoute(r);
        UI.toast('結果を「内定」にしました 🎉');
      }
    });
    // キャンセルボタンの文言を「あとで」に
    const cancel = document.querySelector('#modal .modal-foot [data-close]');
    if (cancel) cancel.textContent = 'あとで';
  },

  isUrl(url) {
    return /^https?:\/\//i.test(url || '');
  },

  /** 外部リンクをボタンの見た目で表示(URLがなければ何も出さない) */
  linkButton(url, label, cls) {
    if (!this.isUrl(url)) return '';
    return `<a class="${cls}" href="${U.esc(url)}" target="_blank" rel="noopener noreferrer" title="${U.esc(url)}">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
      ${U.esc(label)}</a>`;
  },

  /** マイページURLだけを登録・変更する小さなフォーム */
  openMypageForm(c) {
    const has = this.isUrl(c.mypageUrl);
    UI.modal({
      title: has ? 'マイページURLを変更' : 'マイページを登録',
      body: `<div class="field">
          <label>マイページURL <span class="req">*</span></label>
          <input type="url" name="mypageUrl" required value="${U.esc(c.mypageUrl)}" placeholder="https://">
          <div class="help">ブラウザでマイページを開き、アドレスバーのURLをコピーして貼り付けてください。<br>ID・パスワードは保存しないでください。</div>
        </div>`,
      submitLabel: has ? '保存' : '登録',
      footLeft: has ? '<button type="button" class="btn danger" data-clear>登録を解除</button>' : '',
      onOpen: form => {
        const clear = form.querySelector('[data-clear]');
        if (clear) clear.onclick = () => {
          Store.upsertCompany({ id: c.id, mypageUrl: '' });
          UI.closeModal();
          UI.toast('マイページの登録を解除しました');
        };
      },
      onSubmit: form => {
        const url = form.querySelector('[name=mypageUrl]').value.trim();
        if (!this.isUrl(url)) {
          UI.toast('https:// から始まるURLを入力してください', 'error');
          return false;
        }
        Store.upsertCompany({ id: c.id, mypageUrl: url });
        UI.toast('マイページを登録しました');
      }
    });
  },

  /* ================= ルート追加 ================= */
  openRouteForm(companyId) {
    UI.modal({
      title: '選考ルートを追加',
      body: `<div class="form-grid">
        <div class="field full"><label>テンプレート</label>
          <select name="template">${Store.data.stageTemplates.map(t => `<option value="${t.id}">${U.esc(t.name)}(${t.stages.length}ステージ)</option>`).join('')}</select>
          <div class="help">追加後に「ステージ編集」で自由に変更できます。テンプレートは設定画面で編集できます。</div></div>
        <div class="field full"><label>ルート名</label><input type="text" name="name" placeholder="例: 本選考、夏インターン(空欄ならテンプレート名)"></div>
      </div>`,
      submitLabel: '追加',
      onSubmit: form => {
        const fd = new FormData(form);
        Store.addRoute(companyId, fd.get('name').trim(), fd.get('template'));
        UI.toast('ルートを追加しました');
      }
    });
  },

  /* ================= ステージ編集 ================= */
  openStageEditor(routeId) {
    const route = Store.route(routeId);
    const wasComplete = Store.isComplete(route);
    let name = route.name;
    let stages = route.stages.map(s => ({ ...s }));

    const rowsHtml = () => stages.map((s, i) => `
      <div class="stage-edit-row" data-i="${i}">
        <span class="drag-handle" title="ドラッグで並べ替え">⠿</span>
        <span class="idx">${i + 1}</span>
        <input type="text" data-k="name" value="${U.esc(s.name)}" placeholder="ステージ名" required>
        <input type="datetime-local" data-k="date" value="${U.esc(s.date && s.date.length === 10 ? s.date + 'T00:00' : s.date)}" title="日時(任意)">
        <div class="ops">
          <label class="icon-btn" title="完了" style="display:grid;place-items:center"><input type="checkbox" data-k="done" ${s.done ? 'checked' : ''}></label>
          <button type="button" class="icon-btn" data-op="del" title="削除">✕</button>
        </div>
      </div>`).join('');

    // 再描画の前に入力中の値を取り込む
    const sync = form => {
      name = form.querySelector('[name=routeName]').value;
      form.querySelectorAll('#stageRows .stage-edit-row').forEach(row => {
        const s = stages[Number(row.dataset.i)];
        s.name = row.querySelector('[data-k=name]').value;
        s.date = row.querySelector('[data-k=date]').value;
        s.done = row.querySelector('[data-k=done]').checked;
      });
    };

    UI.modal({
      title: 'ステージ編集',
      wide: true,
      body: `
        <div class="field" style="margin-bottom:14px"><label>ルート名</label><input type="text" name="routeName" value="${U.esc(name)}" required></div>
        <div class="field"><label>ステージ(上から順に進みます。左端の ⠿ をドラッグで並べ替え)</label></div>
        <div class="stage-edit-row muted" style="font-size:11px"><span></span><span></span><span>名前</span><span>日時(面接日・締切など)</span><span>完了 / 削除</span></div>
        <div id="stageRows">${rowsHtml()}</div>
        <button type="button" class="btn small" data-op="add" style="margin-top:6px">＋ ステージを追加</button>`,
      onOpen: form => {
        const box = form.querySelector('#stageRows');
        form.addEventListener('click', e => {
          const b = e.target.closest('[data-op]');
          if (!b) return;
          sync(form);
          const row = b.closest('.stage-edit-row');
          const i = row ? Number(row.dataset.i) : -1;
          const op = b.dataset.op;
          if (op === 'add') stages.push({ id: U.uid(), name: '', date: '', done: false });
          if (op === 'del') stages.splice(i, 1);
          box.innerHTML = rowsHtml();
          if (op === 'add') box.querySelector('.stage-edit-row:last-child [data-k=name]').focus();
        });
        this.enableDragSort(box, newOrder => {
          sync(form);
          stages = newOrder.map(i => stages[i]);
          box.innerHTML = rowsHtml();
        });
      },
      onSubmit: form => {
        sync(form);
        route.name = name.trim() || route.name;
        route.stages = stages.filter(s => s.name.trim()).map(s => ({ ...s, name: s.name.trim() }));
        Store.updateRoute(route);
        UI.toast('ステージを保存しました');
        // このモーダルが閉じてから確認を出す
        if (!wasComplete) setTimeout(() => this.askOffer(route.id), 0);
      }
    });
  },

  /**
   * ドラッグで行を並べ替える(HTML5 Drag and Drop)
   * - 行の ⠿(.drag-handle)を掴んだときだけドラッグできる(入力欄の文字選択と干渉しないように)
   * - ドラッグ中は行を実際に移動させて見せ、離したら新しい順番(元の data-i の並び)を onDrop に渡す
   */
  enableDragSort(box, onDrop) {
    let dragging = null;

    box.addEventListener('mousedown', e => {
      const handle = e.target.closest('.drag-handle');
      if (handle) handle.closest('.stage-edit-row').draggable = true;
    });
    box.addEventListener('dragstart', e => {
      dragging = e.target.closest('.stage-edit-row');
      if (!dragging) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragging.dataset.i); // Firefox はこれがないとドラッグが始まらない
      requestAnimationFrame(() => dragging && dragging.classList.add('dragging'));
    });
    box.addEventListener('dragover', e => {
      if (!dragging) return;
      e.preventDefault();
      const target = e.target.closest('.stage-edit-row');
      if (!target || target === dragging) return;
      const r = target.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      box.insertBefore(dragging, after ? target.nextSibling : target);
    });
    box.addEventListener('drop', e => e.preventDefault());
    box.addEventListener('dragend', () => {
      if (!dragging) return;
      dragging.classList.remove('dragging');
      dragging.draggable = false;
      dragging = null;
      const order = [...box.querySelectorAll('.stage-edit-row')].map(r => Number(r.dataset.i));
      onDrop(order);
    });
    // 掴んだだけで離した場合も draggable を戻す
    box.addEventListener('mouseup', () => box.querySelectorAll('[draggable=true]').forEach(r => (r.draggable = false)));
  }
};
