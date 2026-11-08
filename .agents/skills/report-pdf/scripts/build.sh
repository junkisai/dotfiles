#!/usr/bin/env bash
# 資料の HTML を Chrome で A4 の PDF にし、全ページを確かめ用の PNG にする。
# 使い方: build.sh <資料>.html [<出力>.pdf]
set -euo pipefail

if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  echo "使い方: build.sh <資料>.html [<出力>.pdf]" >&2
  exit 2
fi

html="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
out="${2:-${html%.html}.pdf}"
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

[ -x "$chrome" ] || { echo "Google Chrome が見つからない: $chrome（CHROME で場所を指定できる）" >&2; exit 1; }
for cmd in pdfinfo pdftoppm python3; do
  command -v "$cmd" >/dev/null || { echo "$cmd が無い（pdfinfo・pdftoppm は brew install poppler）" >&2; exit 1; }
done

# 開いている Chrome とプロファイルを取り合わないよう、使い捨てのプロファイルで動かす
profile="$(mktemp -d)"
trap 'rm -rf "$profile"' EXIT

# 日本語や空白を含むパスでも開けるよう、file:// の URL に変換する
url="$(python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).as_uri())' "$html")"

mkdir -p "$(dirname "$out")"
rm -f "$out"
"$chrome" --headless=new --disable-gpu --no-pdf-header-footer \
  --user-data-dir="$profile" --print-to-pdf="$out" "$url" >/dev/null 2>&1 || true
[ -s "$out" ] || { echo "PDF ができなかった: $out" >&2; exit 1; }

pages="$(pdfinfo "$out" | awk '/^Pages:/ {print $2}')"
tmp_root="${TMPDIR:-/tmp}"
pages_dir="$(mktemp -d "${tmp_root%/}/report-pdf-pages.XXXXXX")"
pdftoppm -r 70 -png "$out" "$pages_dir/page"

echo "pdf: $out"
echo "pages: $pages"
echo "page_images: $pages_dir"
