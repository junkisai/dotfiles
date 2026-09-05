#!/usr/bin/env bash
# ウィンドウ領域だけを録画する。recorder.js が attach モードで内部的に使うのと同じ形。
# 手で撮りたいとき（ネイティブダイアログなど Playwright に写らないもの）にも使える。
#
#   capture-window.sh <x> <y> <w> <h> <出力パス>
#
# 停止は Ctrl-C か、別プロセスから SIGINT を送る。
# 画面全体ではなく領域を指定するのは、デスクトップの他アプリや通知を写さないため。
set -euo pipefail

if [ $# -lt 5 ]; then
  echo "usage: $0 <x> <y> <w> <h> <output.mov>" >&2
  exit 1
fi

X=$1; Y=$2; W=$3; H=$4; OUT=$5

# 許可がないと screencapture は無言で失敗するのではなく、
# 権限ダイアログを出して待つ。呼び出し側でそれを検知できるよう、
# 開始できたかどうかを出力サイズで判断する。
screencapture -v -x -R"${X},${Y},${W},${H}" "$OUT"
