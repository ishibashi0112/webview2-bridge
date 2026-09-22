#!/bin/sh
# WinForms ホスト exe の代役(Mac / Linux でのテスト用)。
# WebView2 が読むのと同じ環境変数を解釈して Chromium をヘッドレスで起動する:
#   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS  --remote-debugging-port=NNNN
#   WEBVIEW2_USER_DATA_FOLDER              プロファイルの置き場
#   WEBVIEW2_BRIDGE_DEV_URL                最初に開く URL
exec "$FAKE_HOST_CHROME" --headless=new --no-sandbox --disable-gpu --no-first-run \
  $WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS \
  --user-data-dir="$WEBVIEW2_USER_DATA_FOLDER" \
  "$WEBVIEW2_BRIDGE_DEV_URL"
