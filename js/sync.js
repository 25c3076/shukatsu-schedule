/*
 * データの同期(仕様: docs/sync-spec.md)
 * - Firebase Authentication(Googleアカウント)でログインする。ログイン必須
 * - データは Firestore の users/{uid}/data/main に、全体を JSON 文字列で1つにまとめて保存する
 * - 編集はまず localStorage に保存し、約1秒後にクラウドへ送る。他の端末の変更は自動で反映する
 */
const Sync = {
  STATE_KEY: 'shukatsu-sync',     // この端末の同期情報 { owner: ログインしたユーザーID, dirty: 未送信あり }
  DEVICE_KEY: 'shukatsu-device',  // この端末を見分けるID(どの端末で更新したかの記録用)
  PUSH_DELAY: 1000,

  auth: null,
  db: null,
  user: null,
  docRef: null,
  unsubscribe: null,
  pushTimer: null,
  applying: false,      // クラウドの内容を反映中(このときは送り返さない)
  lastRev: null,        // 自分が最後に送った版(自分の送信が戻ってきたときに無視するため)
  status: 'loading',    // loading | synced | pending | offline | error | local
  lastSyncedAt: null,
  lastError: '',

  /* ---------- この端末の同期情報 ---------- */

  meta() {
    try { return JSON.parse(localStorage.getItem(this.STATE_KEY)) || {}; } catch (e) { return {}; }
  },
  setMeta(patch) {
    try { localStorage.setItem(this.STATE_KEY, JSON.stringify({ ...this.meta(), ...patch })); } catch (e) { /* 保存できなくても続ける */ }
  },
  deviceId() {
    let id = null;
    try { id = localStorage.getItem(this.DEVICE_KEY); } catch (e) { /* なし */ }
    if (!id) {
      id = U.uid();
      try { localStorage.setItem(this.DEVICE_KEY, id); } catch (e) { /* なし */ }
    }
    return id;
  },

  /** 企業・タスクなど、中身のあるデータか */
  hasContent(d) {
    return !!d && ['companies', 'routes', 'tasks', 'mails'].some(k => Array.isArray(d[k]) && d[k].length);
  },

  /* ---------- 起動 ---------- */

  start() {
    window.addEventListener('online', () => { if (this.meta().dirty) this.push(); else this.setStatus('synced'); });
    window.addEventListener('offline', () => this.setStatus('offline'));

    if (!Gmail.isServed()) return AuthScreen.show('file');

    if (typeof firebase === 'undefined') {
      // ネットにつながらずSDKを読み込めなかった。以前ログインした端末なら、この端末のデータだけで使う
      if (this.meta().owner) {
        this.setStatus('local');
        AuthScreen.hide();
        App.render(true);
        return;
      }
      return AuthScreen.show('error', 'ネットに接続できないため、ログイン画面を表示できません。接続を確認して、再読み込みしてください。');
    }

    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.db = firebase.firestore();
    AuthScreen.show('loading');
    this.auth.onAuthStateChanged(user => this.onUser(user));
  },

  async onUser(user) {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    if (!user) {
      this.user = null;
      this.docRef = null;
      AuthScreen.show('login');
      return;
    }
    this.user = user;
    this.docRef = this.db.collection('users').doc(user.uid).collection('data').doc('main');
    AuthScreen.show('loading', 'データを読み込んでいます…');

    const meta = this.meta();
    const sameOwner = meta.owner === user.uid;
    let snap = null;
    try {
      snap = await this.docRef.get();
    } catch (e) {
      console.error(e);
      if (e.code === 'permission-denied') {
        return AuthScreen.show('error', 'データを読み込む権限がありません。Firebaseの「Firestore」→「ルール」が設定されているか確認してください。');
      }
      if (!sameOwner) {
        return AuthScreen.show('error', '初めてこの端末でログインするときは、ネットへの接続が必要です。接続を確認して、再読み込みしてください。');
      }
      // オフライン: この端末のデータで続け、つながったら送る
    }

    let cloud = null;
    if (snap && snap.exists) {
      try { cloud = JSON.parse(snap.data().json); } catch (e) { cloud = null; }
    }
    const neverSynced = !!snap && !snap.exists;

    if (snap) {
      if (sameOwner) {
        if (meta.dirty) await this.push();       // 前回送れなかった変更を送る
        else if (cloud) this.applyRemote(cloud);
        else if (this.hasContent(Store.data)) await this.push(); // クラウドに文書がない → この端末のデータを送る
      } else {
        const localHas = this.hasContent(Store.data);
        const cloudHas = this.hasContent(cloud);
        if (localHas && cloudHas) {
          const choice = await this.askWhichToKeep(Store.data, cloud);
          if (choice === 'cloud') this.applyRemote(cloud);
          else await this.push();
        } else if (localHas) {
          await this.push();
        } else if (cloud) {
          this.applyRemote(cloud);
        }
      }
    }
    else if (meta.dirty) this.push(); // オフライン: つながったら送られる
    this.setMeta({ owner: user.uid });
    // クラウドに文書があるか(「削除された」ことを見分けるために覚えておく)
    this.cloudExists = snap ? (snap.exists || this.hasContent(Store.data)) : true;

    // 他の端末からの変更を受け取る
    this.unsubscribe = this.docRef.onSnapshot(s => this.onRemote(s), err => {
      console.error(err);
      this.lastError = err.message;
      this.setStatus('error');
    });
    if (!this.meta().dirty) this.setStatus(navigator.onLine ? 'synced' : 'offline');

    AuthScreen.hide();
    App.render(true);
    if (neverSynced && !this.hasContent(Store.data)) App.welcome();
  },

  /* ---------- クラウド → この端末 ---------- */

  onRemote(snap) {
    if (snap.metadata.hasPendingWrites) return; // 自分の送信中のもの
    const existed = this.cloudExists;
    this.cloudExists = snap.exists;
    if (!snap.exists) {
      // 文書が「あった → なくなった」ときだけ、ほかの端末で「すべてのデータを削除」されたとみなす
      if (!existed) return;
      if (this.deletingByMe) { this.deletingByMe = false; return; }
      if (this.hasContent(Store.data)) {
        this.applyRemote(Store.defaults());
        UI.toast('ほかの端末ですべてのデータが削除されました');
      }
      return;
    }
    const d = snap.data();
    if (d.rev && d.rev === this.lastRev) { this.markSynced(); return; } // 自分が送ったもの
    if (this.meta().dirty) return; // この端末に未送信の変更がある(この後送るので、そちらを優先)
    let data;
    try { data = JSON.parse(d.json); } catch (e) { return; }
    this.applyRemote(data);
    this.markSynced();
  },

  applyRemote(data) {
    this.applying = true;
    Store.data = Store.normalize(data);
    Store.writeLocal();
    this.applying = false;
    App.refresh();
  },

  /* ---------- この端末 → クラウド ---------- */

  /** Store.save() のたびに呼ばれる */
  queuePush() {
    if (!this.user || this.applying) return;
    this.setMeta({ dirty: true });
    this.setStatus(navigator.onLine ? 'pending' : 'offline');
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.push(), this.PUSH_DELAY);
  },

  async push() {
    if (!this.user || !this.docRef) return;
    clearTimeout(this.pushTimer);
    const rev = U.uid();
    this.lastRev = rev;
    this.setMeta({ dirty: true });
    this.setStatus(navigator.onLine ? 'pending' : 'offline');
    try {
      // オフラインのときは、つながるまで完了しない(Firestoreが送信を待つ)
      await this.docRef.set({
        json: JSON.stringify(Store.data),
        updatedAt: new Date().toISOString(),
        device: this.deviceId(),
        rev
      });
      if (this.lastRev === rev) this.markSynced();
    } catch (e) {
      console.error(e);
      this.lastError = e.message;
      this.setStatus(navigator.onLine ? 'error' : 'offline');
    }
  },

  markSynced() {
    this.setMeta({ dirty: false });
    this.lastSyncedAt = new Date().toISOString();
    this.setStatus('synced');
  },

  /** すべてのデータを削除したとき、クラウドからも削除する */
  async deleteCloud() {
    if (!this.user || !this.docRef) return;
    clearTimeout(this.pushTimer);
    this.deletingByMe = true;
    this.setMeta({ dirty: false });
    try {
      await this.docRef.delete();
      this.markSynced();
    } catch (e) {
      console.error(e);
      this.deletingByMe = false;
      UI.toast('クラウドのデータを削除できませんでした: ' + e.message, 'error');
    }
  },

  /* ---------- ログイン・ログアウト ---------- */

  async signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await this.auth.signInWithPopup(provider);
    } catch (e) {
      const msg = {
        'auth/popup-closed-by-user': '',
        'auth/cancelled-popup-request': '',
        'auth/popup-blocked': 'ログイン画面がブロックされました。ブラウザでポップアップを許可してから、もう一度押してください。',
        'auth/unauthorized-domain': `このアドレス(${location.host})は、Firebaseの「Authentication」→「設定」→「承認済みドメイン」に登録されていません。`,
        'auth/operation-not-allowed': 'FirebaseでGoogleログインが有効になっていません。「Authentication」→「ログイン方法」で有効にしてください。',
        'auth/network-request-failed': 'ネットに接続できませんでした。'
      }[e.code];
      if (msg !== '') AuthScreen.setError(msg || `ログインできませんでした(${e.code || e.message})`);
    }
  },

  async signOut() {
    if (this.meta().dirty) {
      // 未送信の変更を送ってからログアウト(最大5秒待つ)
      await Promise.race([this.push(), new Promise(r => setTimeout(r, 5000))]);
      if (this.meta().dirty && !confirm('クラウドに送れていない変更があります。ログアウトすると、この変更は失われます。ログアウトしますか？')) return;
    }
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    clearTimeout(this.pushTimer);
    // この端末のデータは削除する(クラウドには残る)
    try {
      localStorage.removeItem(Store.KEY);
      localStorage.removeItem(this.STATE_KEY);
    } catch (e) { /* なし */ }
    Store.data = Store.defaults();
    Gmail.token = null;
    Gmail.stopPolling();
    await this.auth.signOut(); // → onUser(null) でログイン画面を表示
    UI.toast('ログアウトしました');
  },

  /* ---------- 初回ログイン時の選択 ---------- */

  askWhichToKeep(local, cloud) {
    const count = d => `企業 ${d.companies.length}社 / タスク ${d.tasks.length}件 / メール ${(d.mails || []).length}件`;
    const when = d => (d.meta && d.meta.updatedAt ? `最終更新 ${new Date(d.meta.updatedAt).toLocaleString('ja-JP')}` : '');
    return new Promise(resolve => {
      AuthScreen.hide();
      UI.modal({
        title: 'どちらのデータを使いますか？',
        body: `<div class="welcome">
          <p>この端末とクラウドの両方にデータがあります。使う方を選んでください。<br>
          <b style="color:var(--overdue)">選ばなかった方のデータは上書きされます。</b>心配な場合は、先に「設定」からJSONに保存してください。</p>
          <div class="choices">
            <button type="button" data-k="cloud"><b>☁ クラウドのデータを使う</b><span>${count(cloud)}<br>${when(cloud)}</span></button>
            <button type="button" data-k="local"><b>💻 この端末のデータを使う</b><span>${count(local)}<br>${when(local)}<br>(クラウドを上書きします)</span></button>
          </div>
        </div>`,
        onOpen: (form, dlg) => {
          form.querySelector('.modal-foot').remove();          // 閉じるボタンは出さない
          form.querySelector('.modal-head [data-close]').remove();
          const block = e => e.preventDefault();                // Escキーで閉じられないようにする
          dlg.addEventListener('cancel', block);
          form.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => {
            if (b.dataset.k === 'local' && !confirm('クラウドのデータを、この端末のデータで上書きします。よろしいですか？')) return;
            dlg.removeEventListener('cancel', block);
            UI.closeModal();
            resolve(b.dataset.k);
          }));
        }
      });
    });
  },

  /* ---------- 表示 ---------- */

  setStatus(s) {
    this.status = s;
    if (typeof App !== 'undefined' && document.getElementById('saveStatus')) App.updateChrome();
  },

  statusText() {
    const last = this.lastSyncedAt ? ` ・ ${U.ago(this.lastSyncedAt)}` : '';
    return {
      loading: '読み込み中…',
      synced: `☁ 同期済み${last}`,
      pending: '☁ 送信中…',
      offline: '⚠ オフライン(つながったら送信します)',
      error: '⚠ 同期エラー(設定画面を確認)',
      local: '⚠ オフラインのため同期していません'
    }[this.status] || '';
  }
};

/* ---------- ログイン画面 ---------- */
const AuthScreen = {
  el() { return document.getElementById('authScreen'); },

  /** mode: loading | login | file | error */
  show(mode, message = '') {
    const el = this.el();
    document.body.classList.add('auth-open');
    el.hidden = false;
    const brand = `<div class="auth-brand"><span class="brand-mark">就</span><div><div class="auth-title">就活スケジュール帳</div><div class="muted">就活の進捗と連絡を一元管理するスケジュール帳</div></div></div>`;
    let body = '';
    if (mode === 'loading') {
      body = `<p class="muted">${U.esc(message || '読み込んでいます…')}</p>`;
    } else if (mode === 'login') {
      body = `<p>PCとスマホで同じデータを使うために、Googleアカウントでログインしてください。</p>
        <button type="button" class="btn primary auth-btn" data-act="signin">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#fff" opacity=".55" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z"/></svg>
          Googleでログイン</button>
        <p class="auth-error" id="authError" hidden></p>
        <p class="muted auth-note">・ログインできるのは、Google Cloudの「テストユーザー」に登録したアカウントだけです。<br>・データは本人だけが読み書きできるように保護されています。</p>`;
    } else if (mode === 'file') {
      body = `<p>このアプリは、<b>起動.command</b>(PC)か、公開したURLから開いてください。</p>
        <p class="muted auth-note">index.html を直接開いた状態では、Googleアカウントでのログインができないため、データを同期できません。</p>`;
    } else {
      body = `<p class="auth-error">${U.esc(message)}</p><button type="button" class="btn" data-act="reload">再読み込み</button>`;
    }
    el.innerHTML = `<div class="auth-card">${brand}${body}</div>`;
    const signin = el.querySelector('[data-act=signin]');
    if (signin) signin.onclick = () => { this.setError(''); Sync.signIn(); };
    const reload = el.querySelector('[data-act=reload]');
    if (reload) reload.onclick = () => location.reload();
  },

  setError(msg) {
    const e = document.getElementById('authError');
    if (!e) return;
    e.hidden = !msg;
    e.textContent = msg || '';
  },

  hide() {
    document.body.classList.remove('auth-open');
    this.el().hidden = true;
    this.el().innerHTML = '';
  }
};
