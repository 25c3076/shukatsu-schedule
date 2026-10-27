/* 共通の小さな関数 */
const U = {
  /** 一意なIDを作る */
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  /** HTMLに埋め込む文字列をエスケープ(入力値は必ずこれを通す) */
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  /** "2026-10-20" または "2026-10-20T18:00" を Date に。日付のみは 23:59 扱い */
  parse(s) {
    if (!s) return null;
    const d = new Date(s.length === 10 ? s + 'T23:59' : s);
    return isNaN(d) ? null : d;
  },

  /** 今日から何日後か(日付単位) */
  daysLeft(s) {
    const d = U.parse(s);
    if (!d) return null;
    const t = new Date();
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((a - b) / 86400000);
  },

  /** 10/20(火) 18:00 の形式で表示 */
  fmt(s) {
    const d = U.parse(s);
    if (!d) return '—';
    const w = '日月火水木金土'[d.getDay()];
    let r = `${d.getMonth() + 1}/${d.getDate()}(${w})`;
    if (s.length > 10) r += ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return r;
  },

  /** Date → "YYYY-MM-DD" */
  ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /** 今日から n 日後の "YYYY-MM-DD"(time を渡すと "YYYY-MM-DDTHH:mm") */
  dayFromNow(n, time) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return U.ymd(d) + (time ? 'T' + time : '');
  },

  /**
   * タスクの緊急度
   * overdue: 期限切れ / soon: 設定日数以内 / week: 7日以内 / later: それ以降 / none: 期限なし / done: 完了
   */
  urgency(task) {
    if (task.done) return 'done';
    const d = U.parse(task.deadline);
    if (!d) return 'none';
    if (d < new Date()) return 'overdue';
    const n = U.daysLeft(task.deadline);
    if (n <= Store.data.settings.dueSoonDays) return 'soon';
    if (n <= 7) return 'week';
    return 'later';
  },

  /** 「あと3日」「今日まで」「2日超過」などのラベル */
  leftLabel(s) {
    const d = U.parse(s);
    if (!d) return '期限なし';
    const n = U.daysLeft(s);
    if (d < new Date()) return n === 0 ? '本日・期限切れ' : `${-n}日超過`;
    if (n === 0) return '今日まで';
    if (n === 1) return '明日まで';
    return `あと${n}日`;
  },

  /** 経過時間の表示("3日前" など) */
  ago(iso) {
    if (!iso) return null;
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'たった今';
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    return `${Math.floor(diff / 86400)}日前`;
  },

  stars(n) {
    n = Number(n) || 0;
    return '<span class="stars" title="志望度 ' + n + '">' + '★'.repeat(n) + '<span class="stars-off">' + '★'.repeat(5 - n) + '</span></span>';
  },

  /** "a.co.jp, b.jp" → ["a.co.jp","b.jp"] */
  splitList(s) {
    return String(s || '').split(/[,、\n]/).map(x => x.trim()).filter(Boolean);
  },

  /**
   * 文章中のURL(http/https)をクリックできるリンクにする
   * 先にエスケープしてからリンクにするので、HTMLとして解釈されることはない
   */
  linkify(text) {
    return U.esc(text).replace(/https?:\/\/[\x21-\x7e]+/g, m => {
      // 末尾の句読点やかっこはURLに含めない
      const tail = (m.match(/[.,:!?)\]}]+$/) || [''])[0];
      const url = tail ? m.slice(0, -tail.length) : m;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`;
    });
  },

  /** 外部リンクを安全に作る(http/https のみ) */
  link(url, label) {
    if (!/^https?:\/\//i.test(url || '')) return '';
    return `<a href="${U.esc(url)}" target="_blank" rel="noopener noreferrer" class="ext-link">${U.esc(label)} ↗</a>`;
  }
};
