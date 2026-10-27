/*
 * サービスワーカー(アプリとしてインストールできるようにするための最小限のもの)
 * ファイルを端末に保存(キャッシュ)はしない。常にネットから最新を読み込むので、
 * GitHubを更新したら、次に開いたときにそのまま反映される。
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  // ページを開くときだけ扱い、オフラインならお知らせを表示する(それ以外はブラウザに任せる)
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<body style="font-family:sans-serif;padding:40px 20px;text-align:center;color:#334">' +
    '<h2>オフラインです</h2><p>インターネットに接続してから、もう一度開いてください。</p></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
