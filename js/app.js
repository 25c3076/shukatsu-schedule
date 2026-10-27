/* 画面の切り替えと全体の制御(最後に読み込む) */
const App = {
  routes: {
    dashboard: el => Dashboard.render(el),
    companies: el => Companies.renderList(el),
    company: (el, id) => Companies.renderDetail(el, id),
    calendar: el => Calendar.render(el),
    mail: (el, id) => Mail.render(el, id),
    tasks: el => Tasks.render(el),
    settings: el => Settings.render(el)
  },

  init() {
    Store.load();
    window.addEventListener('hashchange', () => this.render(true));
    document.getElementById('importInput').addEventListener('change', e => this.handleImport(e));
    document.querySelectorAll('[data-theme-set]').forEach(b => (b.onclick = () => this.setTheme(b.dataset.themeSet)));

    // 1分ごとに残り日数・バッジを更新(入力中は邪魔しない)
    setInterval(() => this.refresh(), 60 * 1000);

    // Gmail連携を設定済みなら、ログイン用のスクリプトを先に読み込んでおく(接続ボタンをすぐ使えるように)
    if (Gmail.isServed() && Gmail.isConfigured()) Gmail.loadGis().catch(() => {});

    // ログインとデータの同期を始める(ログインするまではログイン画面を表示)
    Sync.start();
  },

  /** 現在の URL (#dashboard など) に応じて画面を描画 */
  render(scrollTop = false) {
    const [page, id] = (location.hash.slice(1) || 'dashboard').split('/');
    const fn = this.routes[page] || this.routes.dashboard;
    const view = document.getElementById('view');
    const y = window.scrollY;
    fn(view, id);
    window.scrollTo(0, scrollTop ? 0 : y);

    const navKey = page === 'company' ? 'companies' : (this.routes[page] ? page : 'dashboard');
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey));
    this.updateChrome();
    this.updateFab();
  },

  /**
   * スマホの右下「＋」ボタン
   * 今の画面の追加ボタン(.fab-src)が1つならそのボタンと同じ動き、2つ以上なら選ぶメニューを出す
   */
  updateFab() {
    const wrap = document.getElementById('fabWrap');
    const menu = document.getElementById('fabMenu');
    const fab = document.getElementById('fab');
    const backdrop = document.getElementById('fabBackdrop');
    const srcs = [...document.querySelectorAll('#view .fab-src')];
    // メニューの開け閉め(開いている間は、メニュー以外を薄暗くする)
    const setOpen = open => {
      menu.hidden = !open;
      backdrop.hidden = !open;
      fab.classList.toggle('open', open);
    };
    wrap.hidden = !srcs.length;
    setOpen(false);
    backdrop.onclick = () => setOpen(false);
    if (!srcs.length) return;
    const label = b => b.dataset.fabLabel || b.textContent.replace('＋', '').trim();
    fab.setAttribute('aria-label', srcs.length === 1 ? label(srcs[0]) : '追加');
    menu.innerHTML = srcs.map((b, i) => `<button type="button" class="fab-item" data-i="${i}">＋ ${U.esc(label(b))}</button>`).join('');
    menu.querySelectorAll('.fab-item').forEach(x => (x.onclick = () => {
      setOpen(false);
      srcs[Number(x.dataset.i)].click();
    }));
    fab.onclick = () => {
      if (srcs.length === 1) return srcs[0].click();
      setOpen(menu.hidden);
    };
  },

  /** ユーザーが入力中・ポップアップ表示中か */
  isBusy() {
    return document.getElementById('modal').open || document.activeElement.matches('input, textarea, select');
  },

  /** 自動処理からの更新: 入力中ならバッジなどだけ更新し、画面全体は描き直さない */
  refresh() {
    if (this.isBusy()) this.updateChrome();
    else this.render();
  },

  /** Store.save() のたびに呼ばれる */
  afterChange() {
    this.render();
  },

  /** テーマの切り替え: 'light' | 'dark' | 'system' */
  setTheme(theme) {
    Store.data.settings.theme = theme;
    Store.save();
  },

  applyTheme() {
    const theme = Store.data.settings.theme || 'system';
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === theme));
  },

  updateChrome() {
    this.applyTheme();
    const n = Store.alertCount();
    const badge = document.getElementById('taskBadge');
    badge.hidden = !n;
    badge.textContent = n;
    badge.title = `期限切れ・締切間近 ${n}件`;

    const meta = Store.data.meta;
    document.getElementById('saveStatus').textContent = Sync.user || Sync.status === 'local' ? Sync.statusText() : '';

    // 右上のメールアイコンに未確認件数
    const mailCount = Store.uncheckedMailCount();
    const mailBadge = document.getElementById('mailBadge');
    mailBadge.hidden = !mailCount;
    mailBadge.textContent = mailCount;
    mailBadge.parentElement.title = mailCount ? `メール(未確認 ${mailCount}件)` : 'メール';

    const banner = document.getElementById('banner');
    let html = '';

    // Gmail: 未接続・接続切れのときに接続ボタンを出す(トークンを保存しないため、開いたときにも1回押す必要がある)
    const gs = Gmail.state();
    if ((gs === 'off' || gs === 'expired') && !this.gmailBannerDismissed) {
      html += `<div class="banner banner-mail">✉ ${gs === 'expired'
        ? 'Gmailとの接続が切れました(接続は約1時間で切れます)。'
        : 'Gmailに接続されていません。'}
        <button class="btn small primary" data-act="gm-connect">${gs === 'expired' ? '再接続' : '接続して新着を確認'}</button>
        <button class="icon-btn" data-act="gm-close" title="今回は閉じる">✕</button></div>`;
    }

    // バックアップのリマインド(データがあり、7日以上バックアップしていない)
    // データはクラウドに同期されるので、控えのJSONは30日に1回の案内で十分
    // (まだ一度も保存していない場合は、最初に企業を登録した日から数える)
    const BACKUP_REMIND_DAYS = 30;
    const last = meta.lastBackupAt ? new Date(meta.lastBackupAt) : null;
    const firstUse = Store.data.companies.map(c => c.createdAt).filter(Boolean).sort()[0];
    const since = last || (firstUse ? new Date(firstUse) : null);
    const stale = !!since && Date.now() - since > BACKUP_REMIND_DAYS * 86400000;
    if (Store.data.companies.length && stale && !this.bannerDismissed) {
      html += `<div class="banner">💾 ${last ? `最終バックアップから${Math.floor((Date.now() - last) / 86400000)}日経っています。` : 'まだバックアップがありません。'}念のため、JSONファイルにも控えを保存しておくと安心です。
        <button class="btn small primary" data-act="bk">今すぐ保存</button>
        <button class="icon-btn" data-act="bk-close" title="今回は閉じる">✕</button></div>`;
    }
    banner.innerHTML = html;
    const on = (sel, fn) => { const b = banner.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-act=bk]', async () => { if (await Store.exportJSON()) UI.toast('バックアップを保存しました'); });
    on('[data-act=bk-close]', () => { this.bannerDismissed = true; this.updateChrome(); });
    on('[data-act=gm-connect]', () => Gmail.connect());
    on('[data-act=gm-close]', () => { this.gmailBannerDismissed = true; this.updateChrome(); });
  },

  pickImport() {
    const input = document.getElementById('importInput');
    input.value = '';
    input.click();
  },

  handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (Store.data.companies.length && !confirm(`「${file.name}」を読み込むと、現在のデータは置き換えられます。よろしいですか？`)) return;
        Store.importJSON(reader.result);
        UI.toast('バックアップを読み込みました');
        location.hash = '#dashboard';
      } catch (err) {
        UI.toast('読み込みに失敗しました: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  loadSample() {
    Store.data = Sample.build();
    Store.save();
    UI.toast('サンプルデータを読み込みました');
    location.hash = '#dashboard';
  },

  welcome() {
    UI.modal({
      title: 'ようこそ 就活スケジュール帳へ',
      body: `<div class="welcome">
        <p>企業ごとの選考の進み具合と、ESや課題の締切をまとめて管理できます。</p>
        <p class="muted" style="font-size:13px">データはこのブラウザに自動保存されます。設定画面からJSONファイルにバックアップできます。</p>
        <div class="choices">
          <button type="button" data-w="sample"><b>サンプルデータで試す</b><span>架空の企業8社で使い方を確認できます。あとで削除できます。</span></button>
          <button type="button" data-w="empty"><b>空の状態から始める</b><span>最初の企業を登録します。</span></button>
        </div>
        <p style="margin-top:14px"><a href="#" data-w="import">以前のバックアップ(JSON)から復元する</a></p>
      </div>`,
      onOpen: form => {
        form.querySelector('[data-w=sample]').onclick = () => { UI.closeModal(); this.loadSample(); };
        form.querySelector('[data-w=empty]').onclick = () => { UI.closeModal(); Companies.openForm(); };
        form.querySelector('[data-w=import]').onclick = e => { e.preventDefault(); UI.closeModal(); this.pickImport(); };
      }
    });
  }
};

App.init();
