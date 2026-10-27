/*
 * データの読み書き
 * - 普段は localStorage に自動保存
 * - バックアップとして JSON ファイルに書き出し / 読み込み
 * 画面側は Store.xxx() を呼ぶだけで、保存方法を意識しなくてよい作りにしている。
 */
const Store = {
  KEY: 'shukatsu-schedule-data',
  VERSION: 1,
  data: null,
  isFirstRun: false,

  RESULTS: ['進行中', '内定', '不合格', '辞退'],
  PRIORITIES: ['高', '中', '低'],

  defaults() {
    return {
      version: this.VERSION,
      settings: {
        dueSoonDays: 3,
        theme: 'system', // 'light' | 'dark' | 'system'(OSに合わせる)
        gmail: { clientId: '', account: '', lastCheckedAt: null, pollMinutes: 5, queryKey: '' }
      },
      meta: { updatedAt: null, lastBackupAt: null, migrations: [] },
      stageTemplates: [
        { id: 'tpl-main', name: '本選考(一般)', stages: ['プレエントリー', 'エントリー', '説明会', 'ES提出', 'Webテスト', '1次面接', '2次面接', '最終面接', '内定'] },
        { id: 'tpl-intern', name: 'インターン', stages: ['プレエントリー', 'エントリー', 'ES提出', 'Webテスト', '面接', 'インターン参加'] },
        { id: 'tpl-short', name: '短期選考', stages: ['エントリー', 'ES提出', '面接', '最終面接', '内定'] }
      ],
      companies: [], // {id, name, industry, url, mypageUrl, jobTypes[], features, idealCandidate, aspiration, memo, mailDomains[], createdAt}
      routes: [],    // {id, companyId, name, result, stages:[{id,name,date,done}]}
      tasks: [],     // {id, companyId, title, deadline, priority, done, memo, mailId, createdAt}
      mails: []      // {id, from, subject, date, companyId, candidateIds[], checked}(Gmail連携。本文は保存しない)
    };
  },

  /* ---------- 読み込み・保存 ---------- */

  load() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }
    if (parsed) {
      this.data = this.normalize(parsed);
    } else {
      this.data = this.defaults();
      this.isFirstRun = true;
    }
  },

  /** 古い形式や項目不足のデータを現在の形に合わせる(将来の項目追加にも対応) */
  normalize(d) {
    const base = this.defaults();
    const out = {
      ...base,
      ...d,
      settings: {
        ...base.settings,
        ...(d.settings || {}),
        gmail: { ...base.settings.gmail, ...((d.settings || {}).gmail || {}) }
      },
      meta: { ...base.meta, ...(d.meta || {}) },
      stageTemplates: Array.isArray(d.stageTemplates) ? d.stageTemplates : base.stageTemplates,
      companies: Array.isArray(d.companies) ? d.companies : [],
      routes: Array.isArray(d.routes) ? d.routes : [],
      tasks: Array.isArray(d.tasks) ? d.tasks : [],
      mails: Array.isArray(d.mails) ? d.mails : []
    };
    out.companies.forEach(c => {
      c.jobTypes = c.jobTypes || [];
      c.mailDomains = c.mailDomains || [];
    });
    this.migrate(out);
    out.version = this.VERSION;
    return out;
  },

  /**
   * 保存済みデータへの一度きりの更新
   * 実行済みのものは meta.migrations に記録し、ユーザーが後から消した内容を再追加しないようにする
   */
  migrate(d) {
    const done = (d.meta.migrations = d.meta.migrations || []);
    if (!done.includes('add-entry-stage')) {
      // 既存のテンプレート(本選考・インターン)の「プレエントリー」の後ろに「エントリー」を追加
      d.stageTemplates.forEach(t => {
        if (!['tpl-main', 'tpl-intern'].includes(t.id)) return;
        const i = t.stages.indexOf('プレエントリー');
        if (i >= 0 && !t.stages.includes('エントリー')) t.stages.splice(i + 1, 0, 'エントリー');
      });
      done.push('add-entry-stage');
    }
  },

  /**
   * 保存して画面を更新する
   * background=true: 自動処理(Gmailの確認など)からの保存。入力中なら画面の描き直しを後回しにする
   */
  save(background = false) {
    this.data.meta.updatedAt = new Date().toISOString();
    this.writeLocal();
    if (typeof Sync !== 'undefined') Sync.queuePush(); // クラウドへ送る(約1秒後)
    if (typeof App !== 'undefined') background ? App.refresh() : App.afterChange();
  },

  /** この端末(localStorage)にだけ書き込む */
  writeLocal() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error(e);
      UI.toast('ブラウザへの保存に失敗しました。JSONでバックアップしてください。', 'error');
    }
  },

  /* ---------- 企業 ---------- */

  company(id) { return this.data.companies.find(c => c.id === id); },

  upsertCompany(c) {
    const list = this.data.companies;
    const i = list.findIndex(x => x.id === c.id);
    if (i >= 0) list[i] = { ...list[i], ...c };
    else list.push({ id: U.uid(), createdAt: new Date().toISOString(), ...c });
    this.save();
    return i >= 0 ? list[i] : list[list.length - 1];
  },

  deleteCompany(id) {
    this.data.companies = this.data.companies.filter(c => c.id !== id);
    this.data.routes = this.data.routes.filter(r => r.companyId !== id);
    this.data.tasks = this.data.tasks.filter(t => t.companyId !== id);
    // その企業のメール記録も削除。複数一致の候補からも外す
    this.data.mails = this.data.mails.filter(m => m.companyId !== id);
    this.data.mails.forEach(m => {
      if (m.companyId || !m.candidateIds) return;
      m.candidateIds = m.candidateIds.filter(c => c !== id);
      if (m.candidateIds.length === 1) m.companyId = m.candidateIds[0]; // 候補が1社になったら決定
    });
    this.data.mails = this.data.mails.filter(m => m.companyId || (m.candidateIds && m.candidateIds.length));
    this.save();
  },

  /**
   * 企業全体の状態(上から順に判定)
   * offer: 内定のルートがある(ほかのルートが進行中でも内定を優先)
   * active: 進行中のルートがある / closed: すべて不合格・辞退 / idle: ルート未登録(検討中)
   */
  companyStatus(id) {
    const rs = this.routesOf(id);
    if (!rs.length) return 'idle';
    if (rs.some(r => r.result === '内定')) return 'offer';
    if (rs.some(r => r.result === '進行中')) return 'active';
    return 'closed';
  },

  /** 進行中のルートがあるか(内定済みでも、まだ選考が続いているかどうか) */
  hasActiveRoute(id) {
    return this.routesOf(id).some(r => r.result === '進行中');
  },

  /** 全ステージが完了しているか */
  isComplete(route) {
    return route.stages.length > 0 && route.stages.every(s => s.done);
  },

  /* ---------- 選考ルート(1社に複数持てる) ---------- */

  routesOf(companyId) { return this.data.routes.filter(r => r.companyId === companyId); },
  route(id) { return this.data.routes.find(r => r.id === id); },

  /** テンプレートから新しいルートを作る */
  addRoute(companyId, name, templateId) {
    const tpl = this.data.stageTemplates.find(t => t.id === templateId);
    const stages = (tpl ? tpl.stages : ['エントリー']).map(n => ({ id: U.uid(), name: n, date: '', done: false }));
    const r = { id: U.uid(), companyId, name: name || (tpl ? tpl.name : '選考'), result: '進行中', stages };
    this.data.routes.push(r);
    this.save();
    return r;
  },

  updateRoute(r) {
    const i = this.data.routes.findIndex(x => x.id === r.id);
    if (i >= 0) this.data.routes[i] = r;
    this.save();
  },

  deleteRoute(id) {
    this.data.routes = this.data.routes.filter(r => r.id !== id);
    this.save();
  },

  /** 次に取り組むステージの番号(すべて完了なら -1) */
  currentIndex(route) {
    return route.stages.findIndex(s => !s.done);
  },

  progress(route) {
    if (!route.stages.length) return 0;
    return route.stages.filter(s => s.done).length / route.stages.length;
  },

  /**
   * ステージをクリックしたときの進捗更新
   * そのステージまでを完了にする。すでに「最後の完了ステージ」なら1つ戻す。
   */
  setProgress(routeId, index) {
    const r = this.route(routeId);
    if (!r) return;
    const lastDone = r.stages.reduce((acc, s, i) => (s.done ? i : acc), -1);
    const upto = lastDone === index ? index - 1 : index;
    r.stages.forEach((s, i) => { s.done = i <= upto; });
    this.save();
  },

  /* ---------- タスク ---------- */

  tasksOf(companyId) { return this.data.tasks.filter(t => t.companyId === companyId); },
  task(id) { return this.data.tasks.find(t => t.id === id); },

  upsertTask(t) {
    const list = this.data.tasks;
    const i = list.findIndex(x => x.id === t.id);
    if (i >= 0) list[i] = { ...list[i], ...t };
    else list.push({ id: U.uid(), createdAt: new Date().toISOString(), done: false, ...t });
    this.save();
  },

  toggleTask(id) {
    const t = this.task(id);
    if (t) { t.done = !t.done; this.save(); }
  },

  deleteTask(id) {
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    this.save();
  },

  /* ---------- メール(Gmail連携) ---------- */

  mail(id) { return this.data.mails.find(m => m.id === id); },

  /** 企業のメール(新しい順) */
  mailsOf(companyId) {
    return this.data.mails.filter(m => m.companyId === companyId).sort((a, b) => b.date.localeCompare(a.date));
  },

  /** 未確認のメール数(companyId を渡すとその企業だけ) */
  uncheckedMailCount(companyId) {
    return this.data.mails.filter(m => !m.checked && (!companyId || m.companyId === companyId)).length;
  },

  /** そのメールから登録したタスク */
  taskOfMail(mailId) { return this.data.tasks.find(t => t.mailId === mailId); },

  /** 新しく取得したメールを追加(取得済みのIDは無視) */
  addMails(list) {
    const known = new Set(this.data.mails.map(m => m.id));
    const fresh = list.filter(m => !known.has(m.id));
    this.data.mails.push(...fresh);
    return fresh.length;
  },

  setMailChecked(id, checked) {
    const m = this.mail(id);
    if (m) { m.checked = checked; this.save(); }
  },

  /** 複数の企業に一致したメールの企業を決める */
  setMailCompany(id, companyId) {
    const m = this.mail(id);
    if (m) { m.companyId = companyId; this.save(); }
  },

  /** 期限切れ + 締切間近の未完了タスク数(サイドバーのバッジ用) */
  alertCount() {
    return this.data.tasks.filter(t => ['overdue', 'soon'].includes(U.urgency(t))).length;
  },

  /* ---------- JSON バックアップ ---------- */

  backupFileName() {
    return `shukatsu-backup-${U.ymd(new Date()).replace(/-/g, '')}.json`;
  },

  async exportJSON() {
    const text = JSON.stringify(this.data, null, 2);
    const name = this.backupFileName();

    // Chrome / Edge: 保存先を選べる
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        this.markBackedUp();
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false; // キャンセル
        console.warn('showSaveFilePicker が使えないためダウンロード方式に切り替えます', e);
      }
    }

    // その他のブラウザ: ダウンロード
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.markBackedUp();
    return true;
  },

  markBackedUp() {
    this.data.meta.lastBackupAt = new Date().toISOString();
    this.save();
  },

  /** JSON テキストを読み込んで、現在のデータを置き換える */
  importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.companies)) throw new Error('就活スケジュール帳のバックアップファイルではありません');
    this.data = this.normalize(d);
    this.save();
  },

  /** すべてのデータを削除(この端末とクラウドの両方) */
  resetAll() {
    this.data = this.defaults();
    this.writeLocal();
    if (typeof Sync !== 'undefined') Sync.deleteCloud();
    if (typeof App !== 'undefined') App.afterChange();
  }
};
