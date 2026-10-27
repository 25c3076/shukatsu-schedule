/* お試し用のサンプルデータ(日付は今日を基準に自動で作る) */
const Sample = {
  build() {
    const d = Store.defaults();
    const D = U.dayFromNow;

    const mk = (name, industry, aspiration, extra = {}) => {
      const c = {
        id: U.uid(), name, industry, aspiration,
        url: '', mypageUrl: '', jobTypes: [], features: '', idealCandidate: '', memo: '', mailDomains: [],
        createdAt: new Date().toISOString(), ...extra
      };
      d.companies.push(c);
      return c;
    };
    // stagesDone: 完了済みの数 / dates: {ステージ番号: 日付}
    const route = (c, tplId, name, stagesDone, dates = {}, result = '進行中') => {
      const tpl = d.stageTemplates.find(t => t.id === tplId);
      d.routes.push({
        id: U.uid(), companyId: c.id, name, result,
        stages: tpl.stages.map((n, i) => ({ id: U.uid(), name: n, date: dates[i] || '', done: i < stagesDone }))
      });
    };
    const task = (c, title, deadline, priority, done = false) => {
      d.tasks.push({ id: U.uid(), companyId: c ? c.id : '', title, deadline, priority, done, memo: '', createdAt: new Date().toISOString() });
    };

    const a = mk('青葉システムズ', 'IT・ソフトウェア', 5, {
      jobTypes: ['エンジニア', 'データサイエンティスト'],
      features: '自社開発のSaaSが中心。若手の裁量が大きく、技術発表の文化がある。',
      idealCandidate: '自走できる人、チームで学び合える人。',
      mailDomains: ['aoba-sys.example.jp']
    });
    route(a, 'tpl-main', '本選考', 4, { 3: D(-6), 4: D(2, '23:59'), 5: D(9, '14:00') });
    task(a, 'Webテスト受検', D(2, '23:59'), '高');
    task(a, '1次面接の逆質問を準備', D(8), '中');

    const b = mk('みなと商事', '総合商社', 4, { jobTypes: ['総合職'], features: '海外売上比率が高い。', idealCandidate: '粘り強く周囲を巻き込める人。' });
    route(b, 'tpl-intern', '冬インターン', 2, { 2: D(1, '12:00') });
    task(b, '冬インターンES提出', D(1, '12:00'), '高');

    const c = mk('ひかり銀行', '金融', 3, { jobTypes: ['オープンコース'] });
    route(c, 'tpl-main', '本選考', 2, { 2: D(5, '19:00') });
    task(c, '会社説明会に参加(オンライン)', D(5, '19:00'), '中');

    const e = mk('杉野食品', '食品メーカー', 4, { jobTypes: ['商品企画', '営業'] });
    route(e, 'tpl-intern', '夏インターン', 6, { 5: D(-40) }, '進行中');
    d.routes[d.routes.length - 1].result = '辞退';
    route(e, 'tpl-main', '本選考', 3, { 3: D(-1, '23:59') });
    task(e, '本選考ES提出', D(-1, '23:59'), '高');

    const f = mk('北斗電機', '電機メーカー', 3);
    route(f, 'tpl-main', '本選考', 6, { 5: D(-10), 6: D(3, '10:00') });
    task(f, '2次面接(本社)', D(3, '10:00'), '高');
    task(f, '1次面接のお礼・振り返りメモ', D(-9), '低', true);

    const g = mk('つばさ広告', '広告', 2);
    route(g, 'tpl-short', '本選考', 2, { 1: D(-14) }, '不合格');

    const h = mk('ミライ製薬', '医薬品', 4, { features: '研究開発費の比率が高い。' });
    route(h, 'tpl-main', '本選考', 8, { 7: D(-3) }, '内定');
    task(h, '内定承諾の回答期限', D(12), '高');

    mk('わかば出版', '出版', 3, { memo: '採用ページの更新待ち。秋頃にインターン情報が出るらしい。' });
    task(null, '自己分析シートを完成させる', D(6), '中');
    task(null, '証明写真を撮る', D(10), '低');

    return d;
  }
};
