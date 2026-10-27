/*
 * Gmail連携(仕様: docs/gmail-spec.md)
 * - Google Identity Services(トークン方式)でログインし、Gmail API(読み取り専用)で新着メールを探す
 * - アクセストークンはメモリ上だけに持つ(保存しない)。約1時間で切れ、再取得にはボタンのクリックが必要
 * - 企業の「メールの送信元」ドメイン、または件名に含まれる企業名で、どの企業のメールかを判定する
 */
const Gmail = {
  SCOPE: 'https://www.googleapis.com/auth/gmail.readonly',
  API: 'https://gmail.googleapis.com/gmail/v1/users/me',
  GIS_SRC: 'https://accounts.google.com/gsi/client',
  LOOKBACK_DAYS: 14,      // 初回・条件変更時にさかのぼる日数
  OVERLAP_DAYS: 1,        // 取りこぼし防止のため、前回確認より少し前から検索する
  TERMS_PER_QUERY: 15,    // 1回の検索に入れる条件の数(長すぎる検索を避ける)
  MAX_PER_QUERY: 300,     // 1回の確認で1つの検索から取得する最大件数

  token: null,
  expiresAt: 0,
  checking: false,
  timer: null,
  lastError: '',
  gisPromise: null,

  get conf() { return Store.data.settings.gmail; },

  /* ---------- 状態 ---------- */

  /** http(s) で開いているか(file:// ではGoogleのログインが使えない) */
  isServed() { return /^https?:$/.test(location.protocol); },
  isConfigured() { return !!this.conf.clientId; },
  isConnected() { return !!this.token && Date.now() < this.expiresAt - 30 * 1000; },

  /**
   * 画面表示用の状態
   * file: file://で開いている / unset: クライアントID未設定 / off: 未接続
   * expired: 接続が切れた / checking: 確認中 / on: 接続中
   */
  state() {
    if (!this.isServed()) return 'file';
    if (!this.isConfigured()) return 'unset';
    if (this.checking) return 'checking';
    if (this.isConnected()) return 'on';
    return this.token ? 'expired' : 'off';
  },

  statusText() {
    const last = this.conf.lastCheckedAt ? `最終確認 ${U.ago(this.conf.lastCheckedAt)}` : 'まだ確認していません';
    return {
      file: 'ローカルサーバーで起動していません',
      unset: '未設定',
      off: `未接続 ・ ${last}`,
      expired: `接続が切れました ・ ${last}`,
      checking: '確認中…',
      on: `接続中 ・ ${last}`
    }[this.state()];
  },

  /* ---------- 接続・切断 ---------- */

  /** Googleのログイン用スクリプトを読み込む(1回だけ) */
  loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!this.gisPromise) {
      this.gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = this.GIS_SRC;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { this.gisPromise = null; reject(new Error('Googleのログイン画面を読み込めませんでした。ネット接続を確認してください。')); };
        document.head.appendChild(s);
      });
    }
    return this.gisPromise;
  },

  /** 接続(必ずボタンのクリックから呼ぶ。クリックなしではログイン画面を開けないため) */
  async connect() {
    if (this.state() === 'file') return UI.toast('起動.command からアプリを開いてください', 'error');
    if (!this.isConfigured()) return UI.toast('設定画面でクライアントIDを入力してください', 'error');
    try {
      await this.loadGis();
    } catch (e) {
      return UI.toast(e.message, 'error');
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: this.conf.clientId,
      scope: this.SCOPE,
      callback: resp => this.onToken(resp),
      error_callback: err => {
        // ポップアップを閉じた・ブロックされた場合など
        const msg = err && err.type === 'popup_closed' ? 'ログインがキャンセルされました' : 'ログイン画面を開けませんでした(ポップアップがブロックされていないか確認してください)';
        UI.toast(msg, 'error');
      }
    });
    // 2回目以降は同じアカウントを指定して、選び直しの手間を省く
    client.requestAccessToken({ prompt: this.conf.account ? '' : 'consent', hint: this.conf.account || undefined });
  },

  async onToken(resp) {
    if (resp.error) {
      UI.toast('接続できませんでした: ' + (resp.error_description || resp.error), 'error');
      return;
    }
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, this.SCOPE)) {
      UI.toast('Gmailの読み取りが許可されませんでした。もう一度接続し、チェックを入れて許可してください。', 'error');
      return;
    }
    this.token = resp.access_token;
    this.expiresAt = Date.now() + Number(resp.expires_in || 3600) * 1000;
    this.lastError = '';
    try {
      const profile = await this.api('/profile');
      this.conf.account = profile.emailAddress;
      Store.save(true);
    } catch (e) { /* アカウント名が取れなくても確認は続ける */ }
    UI.toast(`Gmail(${this.conf.account})に接続しました`);
    this.startPolling();
    await this.check();
  },

  disconnect() {
    if (this.token && window.google) google.accounts.oauth2.revoke(this.token, () => {});
    this.token = null;
    this.expiresAt = 0;
    this.stopPolling();
    App.refresh();
    UI.toast('Gmailとの接続を切りました');
  },

  startPolling() {
    this.stopPolling();
    const ms = Math.max(1, Number(this.conf.pollMinutes) || 5) * 60 * 1000;
    this.timer = setInterval(() => {
      if (this.isConnected()) this.check();
      else { this.stopPolling(); App.refresh(); } // 切れたら止めて「再接続」を表示
    }, ms);
  },

  stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  /* ---------- Gmail API ---------- */

  async api(path, params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => [].concat(v).forEach(x => x !== undefined && qs.append(k, x)));
    const res = await fetch(`${this.API}${path}${qs.toString() ? '?' + qs : ''}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (res.status === 401) {
      this.expiresAt = 0; // 期限切れ扱い
      throw new Error('接続が切れました。再接続してください。');
    }
    if (!res.ok) throw new Error(`Gmailの読み込みに失敗しました(${res.status})`);
    return res.json();
  },

  /* ---------- 照合 ---------- */

  /** 企業の送信元ドメインを整える("@Example.co.jp " → "example.co.jp") */
  cleanDomain(d) {
    return String(d || '').trim().toLowerCase().replace(/^.*@/, '').replace(/^\.+|\.+$/g, '');
  },

  /** "採用担当 <recruit@mail.example.jp>" → "mail.example.jp" */
  domainOf(from) {
    const m = String(from || '').match(/<([^>]+)>/);
    const addr = (m ? m[1] : from || '').trim().toLowerCase();
    return addr.includes('@') ? addr.split('@').pop() : '';
  },

  /** メールが一致する企業のIDを返す(送信元ドメイン or 件名の企業名) */
  matchCompanies(from, subject) {
    const domain = this.domainOf(from);
    const subj = String(subject || '').toLowerCase();
    return Store.data.companies.filter(c => {
      const byDomain = (c.mailDomains || []).map(d => this.cleanDomain(d)).filter(Boolean)
        .some(d => domain === d || domain.endsWith('.' + d));
      const byName = c.name && subj.includes(c.name.toLowerCase());
      return byDomain || byName;
    }).map(c => c.id);
  },

  /** Gmailの検索に使う条件(送信元ドメインと企業名) */
  searchTerms() {
    const terms = new Set();
    Store.data.companies.forEach(c => {
      (c.mailDomains || []).map(d => this.cleanDomain(d)).filter(Boolean).forEach(d => terms.add(`from:${d}`));
      if (c.name) terms.add(`"${c.name.replace(/"/g, '')}"`);
    });
    return [...terms].sort();
  },

  /* ---------- 新着の確認 ---------- */

  async check() {
    if (this.checking) return;
    if (!this.isConnected()) { App.refresh(); return; }
    this.checking = true;
    App.refresh();
    const startedAt = new Date();
    try {
      const terms = this.searchTerms();
      const key = terms.join('|');
      // 初回、または照合の条件が変わったら過去14日分を検索し直す
      const fresh = !this.conf.lastCheckedAt || this.conf.queryKey !== key;
      const since = fresh
        ? Date.now() - this.LOOKBACK_DAYS * 86400000
        : new Date(this.conf.lastCheckedAt).getTime() - this.OVERLAP_DAYS * 86400000;
      const after = Math.floor(since / 1000);

      const known = new Set(Store.data.mails.map(m => m.id));
      const ids = new Set();
      for (let i = 0; i < terms.length; i += this.TERMS_PER_QUERY) {
        const q = `{${terms.slice(i, i + this.TERMS_PER_QUERY).join(' ')}} after:${after}`;
        let pageToken;
        let count = 0;
        do {
          const res = await this.api('/messages', { q, maxResults: 100, pageToken });
          (res.messages || []).forEach(m => { if (!known.has(m.id)) ids.add(m.id); });
          count += (res.messages || []).length;
          pageToken = res.nextPageToken;
        } while (pageToken && count < this.MAX_PER_QUERY);
      }

      // 新しいメールの送信元・件名・日時を取得して照合
      const found = [];
      const list = [...ids];
      for (let i = 0; i < list.length; i += 10) {
        const metas = await Promise.all(list.slice(i, i + 10).map(id =>
          this.api(`/messages/${id}`, { format: 'metadata', metadataHeaders: ['From', 'Subject'] })));
        metas.forEach(m => {
          const h = name => ((m.payload && m.payload.headers) || []).find(x => x.name.toLowerCase() === name)?.value || '';
          const from = h('from');
          const subject = h('subject');
          const matched = this.matchCompanies(from, subject);
          if (!matched.length) return; // 一致しないメールは保存しない
          found.push({
            id: m.id,
            from,
            subject: subject || '(件名なし)',
            date: new Date(Number(m.internalDate)).toISOString(),
            companyId: matched.length === 1 ? matched[0] : '',
            candidateIds: matched.length > 1 ? matched : [],
            checked: false
          });
        });
      }

      const added = Store.addMails(found);
      this.conf.lastCheckedAt = startedAt.toISOString();
      this.conf.queryKey = key;
      this.lastError = '';
      Store.save(true);
      if (added) UI.toast(`企業からの新着メールが${added}件あります`);
    } catch (e) {
      console.error(e);
      this.lastError = e.message;
      UI.toast(e.message, 'error');
    } finally {
      this.checking = false;
      App.refresh();
    }
  },

  /** Gmailでそのメールを開くURL(接続したアカウントを指定) */
  link(mailId) {
    const who = this.conf.account ? `?authuser=${encodeURIComponent(this.conf.account)}` : 'u/0/';
    return `https://mail.google.com/mail/${who}#all/${encodeURIComponent(mailId)}`;
  }
};
