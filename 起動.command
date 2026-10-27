#!/bin/bash
# 就活スケジュール帳 起動用ファイル(Mac)
# ダブルクリックするとローカルサーバーを起動し、ブラウザでアプリを開きます。
# 使い終わったら、このターミナルのウィンドウを閉じるとサーバーが止まります。

# このファイルが置いてあるフォルダ(= アプリのフォルダ)に移動
cd "$(dirname "$0")" || exit 1

# ポート番号は変えないこと(保存データとGoogleのログイン設定がこのアドレスにひもづくため)
PORT=5500
URL="http://localhost:${PORT}/index.html"

# すでにポートが使われているか確認
PID=$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1)
if [ -n "$PID" ]; then
  # このフォルダを配信しているサーバーなら、ブラウザで開くだけ
  EXPECTED=$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.getcwd()))')
  SERVED=$(curl -s -D - -o /dev/null "http://127.0.0.1:${PORT}/index.html" | grep -i '^X-App-Dir:' | cut -d' ' -f2- | tr -d '\r')
  if [ "$SERVED" = "$EXPECTED" ]; then
    echo "すでに起動しています。ブラウザで開きます: ${URL}"
    open "${URL}"
    exit 0
  fi

  # 別のフォルダ(古いバージョンなど)のサーバーが動いている
  CMD=$(ps -p "$PID" -o command= 2>/dev/null)
  if [[ "$CMD" == *"server.py"* || "$CMD" == *"http.server"* ]]; then
    echo "別のフォルダの就活スケジュール帳が起動していたため、停止して起動し直します。"
    kill "$PID"
    sleep 1
  else
    # 他のアプリ(VS CodeのLive Serverなど)がポートを使っている場合は止めない
    echo "ポート ${PORT} を別のアプリが使用しています:"
    echo "  ${CMD}"
    echo "そのアプリを終了してから、もう一度起動してください。"
    read -n 1 -s -r -p "何かキーを押すと閉じます..."
    exit 1
  fi
fi

echo "就活スケジュール帳を起動しています..."
echo "アドレス: ${URL}"
echo "終了するときは、このウィンドウを閉じてください。"
echo ""

# サーバーが立ち上がるのを少し待ってからブラウザを開く
(sleep 1; open "${URL}") &

python3 server.py ${PORT}
