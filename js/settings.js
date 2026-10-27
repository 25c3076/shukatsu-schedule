/* 設定・バックアップ画面 */
const Settings = {
  render(el) {
    const d = Store.data;
    const last = d.meta.lastBackupAt;

    el.innerHTML = `
      <div class="page-head"><div><h1>設定・バックアップ</h1></div></div>
      <div class="settings-grid">
        <div style="display:flex;flex-direction:column;gap:16px">
          <section class="card">
            <div class="card-title">バックアップ(JSONファイル)</div>
            <p class="stat-line">
              データはクラウドに自動で保存されています。念のための控えとして、ときどきJSONファイルにも保存しておくと安心です。<br>
              最終バックアップ: <b>${last ? `${new Date(last).toLocaleString('ja-JP')}(${U.ago(last)})` : 'まだありません'}</b>
            </p>
            <div class="btn-row">
              <button class="btn primary" data-act="export">JSONに保存</button>
              <button class="btn" data-act="import">JSONから読み込み</button>
            </div>
          </section>

          ${this.accountCard()}

          ${this.gmailCard()}

          <section class="card">
            <div class="card-title">表示設定</div>
            <div class="field" style="margin-bottom:14px">
              <label>テーマ</label>
              <select id="themeSel" style="width:auto">
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
                <option value="system">自動(OSの設定に合わせる)</option>
              </select>
            </div>
            <div class="field">
              <label>「締切間近」とみなす日数</label>
              <div class="inline" style="align-items:center">
                <input type="number" id="dueSoonDays" min="1" max="30" value="${d.settings.dueSoonDays}" style="width:90px">
                <span class="muted">日以内の締切をオレンジで強調し、サイドバーの件数に含めます</span>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-title">データ</div>
            <p class="stat-line">企業 ${d.companies.length}社 / 選考ルート ${d.routes.length}件 / タスク ${d.tasks.length}件 / メール ${d.mails.length}件</p>
            <div class="btn-row">
              <button class="btn" data-act="sample">サンプルデータを読み込む</button>
              <button class="btn danger" data-act="reset">すべてのデータを削除(クラウドも)</button>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card-title">選考ステージのテンプレート</div>
          <p class="stat-line">選考ルートを追加するときのひな形です。変更しても、作成済みのルートには影響しません。</p>
          <div id="tplList">${d.stageTemplates.map(t => this.tplItem(t)).join('')}</div>
          <div class="btn-row">
            <button class="btn small" data-act="add-tpl">＋ テンプレートを追加</button>
            <button class="btn small primary" data-act="save-tpl">テンプレートを保存</button>
          </div>
        </section>
      </div>`;

    el.querySelector('[data-act=export]').onclick = async () => {
      if (await Store.exportJSON()) UI.toast('バックアップを保存しました');
    };
    el.querySelector('[data-act=import]').onclick = () => App.pickImport();
    this.bindGmail(el);
    const so = el.querySelector('[data-act=signout]');
    if (so) so.onclick = () => {
      if (confirm('ログアウトしますか？この端末のデータは削除されます(クラウドには残ります)。')) Sync.signOut();
    };
    const themeSel = el.querySelector('#themeSel');
    themeSel.value = d.settings.theme || 'system';
    themeSel.onchange = () => App.setTheme(themeSel.value);
    el.querySelector('#dueSoonDays').onchange = e => {
      const n = Math.min(30, Math.max(1, Number(e.target.value) || 3));
      d.settings.dueSoonDays = n;
      Store.save();
      UI.toast('保存しました');
    };
    el.querySelector('[data-act=sample]').onclick = () => {
      if (d.companies.length && !confirm('現在のデータをサンプルデータで置き換えますか？\n(必要なら先にJSONで保存してください)')) return;
      App.loadSample();
    };
    el.querySelector('[data-act=reset]').onclick = () => {
      if (!confirm('すべてのデータを、この端末とクラウドの両方から削除しますか？ほかの端末からも消えます。この操作は元に戻せません。')) return;
      if (!confirm('本当に削除しますか？')) return;
      Store.resetAll();
      UI.toast('すべてのデータを削除しました');
    };

    const tplList = el.querySelector('#tplList');
    el.querySelector('[data-act=add-tpl]').onclick = () => {
      tplList.insertAdjacentHTML('beforeend', this.tplItem({ id: 'tpl-' + U.uid(), name: '', stages: ['エントリー', 'ES提出', '面接', '内定'] }));
      tplList.lastElementChild.querySelector('input').focus();
    };
    tplList.addEventListener('click', e => {
      const b = e.target.closest('[data-del-tpl]');
      if (b) b.closest('.tpl-item').remove();
    });
    el.querySelector('[data-act=save-tpl]').onclick = () => {
      const tpls = [...tplList.querySelectorAll('.tpl-item')].map(item => ({
        id: item.dataset.id,
        name: item.querySelector('input').value.trim(),
        stages: item.querySelector('textarea').value.split('\n').map(s => s.trim()).filter(Boolean)
      })).filter(t => t.name && t.stages.length);
      if (!tpls.length) { UI.toast('テンプレートは1つ以上必要です', 'error'); return; }
      d.stageTemplates = tpls;
      Store.save();
      UI.toast('テンプレートを保存しました');
    };
  },

  /* ---------- アカウントと同期 ---------- */

  accountCard() {
    const u = Sync.user;
    return `<section class="card">
      <div class="card-title">アカウントと同期</div>
      <p class="stat-line" style="margin-bottom:10px">
        ログイン中: <b>${u ? U.esc(u.email || u.displayName || '') : '—'}</b><br>
        状態: <b>${U.esc(Sync.statusText())}</b>
        ${Sync.status === 'error' && Sync.lastError ? `<br><span style="color:var(--overdue)">${U.esc(Sync.lastError)}</span>` : ''}
      </p>
      <p class="stat-line" style="font-size:12px">データはクラウドに保存され、同じアカウントでログインしたPC・スマホで同じ内容を使えます。</p>
      ${u ? '<div class="btn-row"><button class="btn" data-act="signout">ログアウト</button></div>' : ''}
    </section>`;
  },

  /* ---------- Gmail連携 ---------- */

  gmailCard() {
    const g = Store.data.settings.gmail;
    const st = Gmail.state();
    return `<section class="card">
      <div class="card-title">Gmail連携</div>
      ${st === 'file' ? `<p class="stat-line" style="color:var(--soon-text)">今は index.html を直接開いているため、Gmail連携は使えません。<b>起動.command</b> から開いてください。</p>` : ''}
      <div class="field" style="margin-bottom:12px">
        <label>クライアントID</label>
        <div class="inline">
          <input type="text" id="gmClientId" value="${U.esc(g.clientId)}" placeholder="〜.apps.googleusercontent.com">
          <button class="btn" data-act="gm-save">保存</button>
        </div>
        <div class="help">Google Cloudの「クライアント」で作成したIDを貼り付けます。クライアントシークレットは入力しないでください。</div>
      </div>
      <p class="stat-line" style="margin-bottom:10px">
        状態: <b>${U.esc(Gmail.statusText())}</b>${g.account ? `<br>アカウント: <b>${U.esc(g.account)}</b>` : ''}
        ${Gmail.lastError ? `<br><span style="color:var(--overdue)">${U.esc(Gmail.lastError)}</span>` : ''}
      </p>
      <div class="btn-row">
        ${st === 'off' || st === 'expired' ? `<button class="btn primary" data-act="gm-connect">${st === 'expired' ? '再接続' : 'Gmailに接続'}</button>` : ''}
        ${st === 'on' || st === 'checking' ? `<button class="btn primary" data-act="gm-check" ${st === 'checking' ? 'disabled' : ''}>今すぐ確認</button><button class="btn" data-act="gm-disconnect">切断</button>` : ''}
      </div>
      ${st === 'on' || st === 'checking' ? `<div class="field" style="margin-top:14px">
        <label>過去のメールを読み込み直す</label>
        <div class="inline" style="align-items:center;flex-wrap:wrap">
          <select id="gmLookback" style="width:auto">
            <option value="14">過去14日分</option><option value="30" selected>過去30日分</option>
            <option value="60">過去60日分</option><option value="90">過去90日分</option>
          </select>
          <button class="btn" data-act="gm-rescan" ${st === 'checking' ? 'disabled' : ''}>読み込み直す</button>
        </div>
        <div class="help">企業の「メールの送信元」を後から登録したときや、古いメールも拾いたいときに使います。取り込み済みのメールが重複したり、確認済みが戻ったりすることはありません。</div>
      </div>` : ''}
      <p class="stat-line" style="margin:12px 0 0;font-size:12px">接続は約1時間で切れます。切れたら「再接続」を押してください。開いている間は${g.pollMinutes}分おきに新着を確認します。</p>
    </section>`;
  },

  bindGmail(el) {
    const g = Store.data.settings.gmail;
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-act=gm-save]', () => {
      const v = el.querySelector('#gmClientId').value.trim();
      if (v && !/\.apps\.googleusercontent\.com$/.test(v)) {
        UI.toast('クライアントIDは「.apps.googleusercontent.com」で終わる文字列です', 'error');
        return;
      }
      if (v !== g.clientId) {
        // IDを変えたら、これまでの接続とアカウントの情報はリセット(取得済みのメールは残す)
        if (Gmail.token) Gmail.disconnect();
        g.account = '';
        g.lastCheckedAt = null;
        g.queryKey = '';
      }
      g.clientId = v;
      Store.save();
      if (v && Gmail.isServed()) Gmail.loadGis().catch(() => {});
      UI.toast(v ? 'クライアントIDを保存しました' : 'クライアントIDを削除しました');
    });
    on('[data-act=gm-connect]', () => Gmail.connect());
    on('[data-act=gm-check]', () => Gmail.check());
    on('[data-act=gm-rescan]', () => Gmail.check(Number(el.querySelector('#gmLookback').value)));
    on('[data-act=gm-disconnect]', () => Gmail.disconnect());
  },

  tplItem(t) {
    return `<div class="tpl-item" data-id="${U.esc(t.id)}">
      <div class="inline">
        <input type="text" value="${U.esc(t.name)}" placeholder="テンプレート名">
        <button type="button" class="icon-btn" data-del-tpl title="削除">🗑</button>
      </div>
      <textarea placeholder="1行に1ステージ">${U.esc(t.stages.join('\n'))}</textarea>
    </div>`;
  }
};
