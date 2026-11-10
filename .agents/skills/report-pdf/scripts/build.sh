#!/usr/bin/env bash
# 資料の HTML を Chrome で A4 の PDF にし、全ページを確かめ用の PNG にする。
# 使い方: build.sh <資料>.html [<出力>.pdf]
#
# - HTML の中の <img src="相対パス"> は base64 で埋め込んでから PDF にする。
#   出力の PDF と同じ名前の .html（渡す HTML）にも、埋め込んだものを書く。
# - ページごとに本文がどこまで下にあるかを出し、下半分が空いたページ（塊や行が次のページへ送られたなど）を知らせる。
set -euo pipefail

if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  echo "使い方: build.sh <資料>.html [<出力>.pdf]" >&2
  exit 2
fi

html="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
out="${2:-${html%.html}.pdf}"
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

[ -x "$chrome" ] || { echo "Google Chrome が見つからない: ${chrome}（CHROME で場所を指定できる）" >&2; exit 1; }
for cmd in pdfinfo pdftoppm pdftotext python3; do
  command -v "$cmd" >/dev/null || { echo "$cmd が無い（pdfinfo・pdftoppm・pdftotext は brew install poppler）" >&2; exit 1; }
done

# 開いている Chrome とプロファイルを取り合わないよう、使い捨てのプロファイルで動かす
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
profile="$work/profile"
inlined="$work/report.html"

# 相対パス・file の画像を data URI にした HTML を作る。埋め込んだ枚数を出す
images="$(python3 - "$html" "$inlined" <<'PY'
import base64, mimetypes, pathlib, re, sys, urllib.parse

src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(sys.argv[2])
text = src.read_text(encoding="utf-8")
count = 0

def inline(m):
    global count
    url = m.group(2)
    if re.match(r"(data|https?):", url, re.I):
        return m.group(0)
    path = urllib.parse.unquote(url[len("file://"):] if url.startswith("file://") else url)
    file = (src.parent / path).resolve()
    if not file.is_file():
        print(f"画像が見つからない: {url}", file=sys.stderr)
        return m.group(0)
    mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    count += 1
    data = base64.b64encode(file.read_bytes()).decode()
    return f'{m.group(1)}data:{mime};base64,{data}{m.group(3)}'

text = re.sub(r'(<img\b[^>]*?\bsrc=")([^"]+)(")', inline, text)
dst.write_text(text, encoding="utf-8")
print(count)
PY
)"

# 日本語や空白を含むパスでも開けるよう、file:// の URL に変換する
url="$(python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).as_uri())' "$inlined")"

mkdir -p "$(dirname "$out")"
rm -f "$out"
"$chrome" --headless=new --disable-gpu --no-pdf-header-footer \
  --user-data-dir="$profile" --print-to-pdf="$out" "$url" >/dev/null 2>&1 || true
[ -s "$out" ] || { echo "PDF ができなかった: $out" >&2; exit 1; }

# 渡す HTML（出力の PDF と同じ名前）。元の HTML と同じ場所なら上書きしない
deliver="${out%.pdf}.html"
if [ "$deliver" != "$html" ]; then
  cp "$inlined" "$deliver"
elif [ "$images" -gt 0 ]; then
  echo "注意: 元の HTML が画像をパスで参照している。渡す HTML に画像を埋め込むには、出力の PDF を別の場所にする" >&2
fi

pages="$(pdfinfo "$out" | awk '/^Pages:/ {print $2}')"
tmp_root="${TMPDIR:-/tmp}"
pages_dir="$(mktemp -d "${tmp_root%/}/report-pdf-pages.XXXXXX")"
pdftoppm -r 70 -png "$out" "$pages_dir/page"

echo "pdf: $out"
[ "$deliver" != "$html" ] && echo "html: ${deliver}（画像 ${images} 枚を埋め込み）"
echo "pages: $pages"
echo "page_images: $pages_dir"

# ページごとに、本文の文字がページのどこまで下にあるか（%）を出す。本文の範囲は、資料の @page の上下の余白の内側。
# 最後のページ以外で 55% に届かないページは、下半分が空いている。章の終わりなら問題ないが、
# 表や画像の塊が次のページへ送られた、1〜2 行だけが送られた、のどちらかであることが多い。
python3 - "$out" "$pages" "$html" <<'PY'
import re, subprocess, sys

pdf, pages, html = sys.argv[1], int(sys.argv[2]), sys.argv[3]
MM = 72 / 25.4


def mm(value):
    """'20mm' や '0' を mm の数にする。mm 以外の単位なら None"""
    m = re.fullmatch(r"([\d.]+)(mm)?", value.strip())
    if not m or (m.group(2) is None and float(m.group(1)) != 0):
        return None
    return float(m.group(1))


def page_margins(path):
    """資料の @page の上下の余白（mm）。読めなければ None"""
    css = open(path, encoding="utf-8").read()
    # @page の中の、入れ子の @top-right などより前に書いた宣言を読む。@page :first などは見ない
    block = re.search(r"@page\s*\{([^@}]*)", css)
    if not block:
        return None
    decls = block.group(1)
    top = bottom = None
    short = re.search(r"(?<![-\w])margin\s*:\s*([^;]+)", decls)
    if short:
        values = [mm(v) for v in short.group(1).split()]
        if None in values or not 1 <= len(values) <= 4:
            return None
        top = values[0]
        bottom = values[2] if len(values) >= 3 else values[0]
    for side in ("top", "bottom"):
        one = re.search(rf"margin-{side}\s*:\s*([^;]+)", decls)
        if one:
            value = mm(one.group(1))
            if value is None:
                return None
            if side == "top":
                top = value
            else:
                bottom = value
    if top is None or bottom is None:
        return None
    return top, bottom


margins = page_margins(html)
if margins is None:
    margins = (20, 18)
    print("注意: @page の上下の余白を mm で読めなかったので、上 20mm・下 18mm とみなして fill を出す")
TOP, BOTTOM = margins[0] * MM, margins[1] * MM
fills = []
for i in range(1, pages + 1):
    xml = subprocess.run(
        ["pdftotext", "-bbox-layout", "-f", str(i), "-l", str(i), pdf, "-"],
        capture_output=True, text=True, check=True,
    ).stdout
    height = float(re.search(r'<page width="[\d.]+" height="([\d.]+)"', xml).group(1))
    # 余白に出る書名とページ番号は数えない
    bottoms = [float(y) for y in re.findall(r'<word [^>]*yMax="([\d.]+)"', xml)
               if TOP <= float(y) <= height - BOTTOM]
    body = height - TOP - BOTTOM
    fills.append(round(100 * (max(bottoms) - TOP) / body) if bottoms else 0)
print("fill: " + " ".join(f"{i}:{f}%" for i, f in enumerate(fills, 1)))
for i, f in enumerate(fills[:-1], 1):
    if f < 55:
        print(f"確かめる: {i} ページ目は本文が上から {f}% で終わる。章の終わりでなければ、次のページへ送られた塊か行がある")
PY
