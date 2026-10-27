"""
就活スケジュール帳 用のローカルサーバー(起動.command から呼び出される)

python3 -m http.server とほぼ同じだが、次の2点を追加している。
- キャッシュを無効にする: ファイルを更新したら、再読み込みですぐ反映されるように
- どのフォルダを配信しているかをヘッダーで知らせる: 起動.command が
  「別のフォルダ(古いバージョン)のサーバーが動いていないか」を確認するため
"""
import http.server
import os
import sys
import urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
APP_DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-App-Dir', urllib.parse.quote(APP_DIR))
        super().end_headers()

    def log_message(self, format, *args):
        pass  # アクセスのたびにログを出さない


if __name__ == '__main__':
    # 自分のPCからだけアクセスできるようにする(同じWi-Fiの他の人からは見えない)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'配信中のフォルダ: {APP_DIR}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
