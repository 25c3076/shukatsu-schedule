# 就活スケジュール帳(プロトタイプ)

複数企業のエントリー状況・選考進捗・提出期限を一元管理するアプリ。
HTML / CSS / JavaScript のみ。`起動.command`(PC)か、公開したURLから開き、Googleアカウントでログインして使う。データはFirebaseで同期され、PCとスマホで同じ内容を使える(仕様: `docs/sync-spec.md`)。`index.html` を直接開く使い方はできない(ログインが動かないため)。

## 使い方
1. `index.html` をダブルクリック(またはブラウザにドラッグ)
2. 初回は「サンプルデータで試す」か「空の状態から始める」を選ぶ
3. データは自動でブラウザ(localStorage)に保存される
4. 「設定・バックアップ」→「JSONに保存」でバックアップ。別PCや別ブラウザへは「JSONから読み込み」で移行

## 起動方法(Mac・ローカルサーバー)
Gmail連携(Googleのログイン)は `file://` で開いたページでは動かないため、ローカルサーバーで起動する。

1. フォルダ内の `起動.command` をダブルクリック
2. ターミナルが開いてサーバーが起動し、ブラウザで `http://localhost:5500/index.html` が開く
3. 使い終わったらターミナルのウィンドウを閉じる(サーバーが止まる)

- サーバーは `server.py`(キャッシュを無効にしてあるので、ファイルを更新したら再読み込みで反映される)
- 別のフォルダ(古いバージョンなど)のサーバーが動いていたら、自動で止めて起動し直す

- **ポート番号(5500)とアドレス(`localhost`)は変えない。** 保存データはアドレスごとに別になり、Googleのログイン設定にもこのアドレスを登録するため
- 初回に「"起動.command"は開いていません」と出たら、「完了」を押してから「システム設定」→「プライバシーとセキュリティ」→「このまま開く」で許可する(またはターミナルで `xattr -dr com.apple.quarantine ` + フォルダをドラッグ → Enter)
- 「アクセス権がありません」と出たら、ターミナルで `chmod +x ` と入力してから `起動.command` をターミナルにドラッグし、Enter
- `file://` で使っていたころのデータは自動では引き継がれない。古い開き方で「JSONに保存」→ 新しい開き方で「JSONから読み込み」

## アプリとしてインストール
公開したURL(https)で開くと、アプリとしてインストールできる(ホーム画面・Dockにアイコンが付き、ブラウザの枠なしで開く)。
- PC(Chrome): アドレスバー右端のインストールアイコン、または「︙」→「キャスト、保存、共有」→「インストール」
- Android(Chrome): 「︙」→「ホーム画面に追加」→「インストール」
- iPhone(Safari): 共有ボタン →「ホーム画面に追加」

関係するファイル: `manifest.json`(アプリ名・色・アイコンの指定)、`sw.js`(インストールに必要な最小限のサービスワーカー。キャッシュはしないので、更新はすぐ反映される)、`icons/`(アイコン画像)

## 画面
| 画面 | URL | 内容 |
|---|---|---|
| ダッシュボード | `#dashboard` | 件数サマリー、締切が近いタスク、今後の選考予定、選考段階の分布、選考中の企業 |
| 企業一覧 | `#companies` | 検索・状態での絞り込み・並べ替え |
| 企業詳細 | `#company/<id>` | 選考ルート(ステージをクリックで進捗更新)、タスク、企業情報 |
| メール | `#mail` | Gmail連携で取得した企業からのメール。右上のアイコンから開く(詳細は `docs/gmail-spec.md`) |
| カレンダー | `#calendar` | 右上のアイコンから開く。月表示。タスクの締切と選考ステージの日時を表示。日付クリックでその日の一覧、予定クリックで編集/企業詳細へ |
| タスク・締切 | `#tasks` | 期限切れ / N日以内 / 7日以内 / それ以降 で色分け |
| 設定 | `#settings` | サイドバー左下の「設定」から開く。バックアップ、Gmail連携、締切間近の日数、ステージのテンプレート編集 |

## Gmail連携の使い方
1. Google Cloudでクライアントを作成(承認済みのJavaScript生成元は `http://localhost:5500`)
2. `起動.command` からアプリを開き、「設定」→「Gmail連携」にクライアントIDを貼り付けて保存
3. 「Gmailに接続」を押してログイン(「このアプリはGoogleで確認されていません」と出たら「続行」)
4. 企業情報の「メールの送信元」にドメインを登録すると、その企業のメールを見つけやすくなる

- 接続は約1時間で切れる。アプリを開いたときと切れたときは、上部の「接続」「再接続」ボタンを1回押す
- 開いている間は5分おきに新着を確認する

## ファイル構成
```
index.html        画面の骨組み。script の読み込み順が重要
css/style.css     見た目(先頭の :root が色などの設定。ダークモード対応)
js/utils.js       U.xxx   日付計算・エスケープなどの共通関数
js/store.js       Store   データの読み書き・localStorage保存・JSONバックアップ
js/ui.js          UI.xxx  モーダル・トースト・バッジ・ステッパーなどの部品
js/sample.js      Sample  サンプルデータ
js/dashboard.js   Dashboard 画面
js/companies.js   Companies 企業一覧・詳細・編集フォーム・ステージ編集
js/tasks.js       Tasks   タスク画面・タスクフォーム
js/calendar.js    Calendar カレンダー画面(既存データから表示するだけで、独自のデータは持たない)
js/firebase-config.js  Firebaseの接続設定(公開してよい値)
js/sync.js        Sync    ログイン・クラウドとの同期(Firebase)/ AuthScreen ログイン画面
docs/sync-spec.md        データ同期の仕様書
js/gmail.js       Gmail   Gmail連携(Googleへの接続、新着の検索、企業との照合)
js/mail.js        Mail    メール画面・メールの行・企業詳細のメールカード
docs/gmail-spec.md       Gmail連携の仕様書(何を作り、何を作らないか、その理由)
js/settings.js    Settings 設定画面
manifest.json     アプリとしてインストールするための設定
sw.js             サービスワーカー(キャッシュはしない)
icons/            アプリのアイコン
server.py         ローカルサーバー(起動.command から使う)
js/app.js         App     画面の切り替え(hash ルーティング)・起動処理。最後に読み込む
```

### file:// で動かすための決まりごと
- `<script type="module">` や `import / export` は **使わない**(Chrome で読み込めない)
- 各ファイルはグローバル変数(`Store`, `UI` など)を1つ定義する形にする
- 新しいファイルを足したら `index.html` の `app.js` より前に `<script src>` を追加する
- `fetch()` でローカルファイルは読めない。ファイルの読み込みは `<input type="file">` を使う

## データ構造(localStorage の `shukatsu-schedule-data` に JSON で保存)
```js
{
  version: 1,
  settings: { dueSoonDays: 3 },
  meta: { updatedAt, lastBackupAt },
  stageTemplates: [{ id, name, stages: ["プレエントリー", "説明会", ...] }],
  companies: [{ id, name, industry, aspiration(1-5), url, mypageUrl,
                jobTypes: [], features, idealCandidate, memo,
                mailDomains: [],  // Gmail連携で送信元を照合するドメイン
                createdAt }],
  routes:    [{ id, companyId, name: "本選考", result: "進行中|内定|不合格|辞退",
                stages: [{ id, name, date, done }] }],
  tasks:     [{ id, companyId, title, deadline: "2026-10-20T23:59" または "2026-10-20",
                priority: "高|中|低", done, memo, createdAt }]
}
```
- 1社に選考ルートを複数持てる(夏インターン・本選考など)
- 「現在の段階」= そのルートで最初の未完了ステージ
- 項目を追加するときは `Store.defaults()` と `Store.normalize()` に足すと、古いバックアップも読み込める
- 保存済みデータを一度だけ書き換えたいときは `Store.migrate()` に処理を追加する(実行済みの名前を `meta.migrations` に記録)

### データ更新の流れ
画面 → `Store.upsertXxx()` などを呼ぶ → `Store.save()` が localStorage に保存 → `App.afterChange()` が今の画面を描き直す。
画面側で保存処理や再描画を書く必要はない。

## 今後の拡張アイデア
- 締切の時刻が近づいたらブラウザ通知(Notification API)
- タスクのテンプレート(「ES提出」を選ぶと関連タスクを一括作成 など)
