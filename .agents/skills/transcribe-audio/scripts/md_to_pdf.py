#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文字起こし Markdown から「要約版 PDF」を生成する。

なぜ要約版か:
  生文字起こしは数千発話・数十ページに及び、印刷・共有・一覧には不向き。
  一方で frontmatter＋要約＋ネクストアクションだけなら数ページで俯瞰できる。
  そこで PDF では「## 生文字起こし」以降を丸ごと落とし、要約までを載せる。
  （全文は Markdown 側に残っているので情報は失われない。）

なぜ python-markdown ＋ ヘッドレス Chrome か:
  pandoc/wkhtmltopdf/LaTeX が無い環境でも、macOS なら標準で Chrome があり、
  日本語フォント（ヒラギノ等）をそのまま使って綺麗に印刷できる。
  python-markdown は pip で入る軽量依存。この2つで完結させている。

Usage:
  md_to_pdf.py <input.md> [output.pdf] [--section-marker "## 生文字起こし"]
    input.md   : 入力 Markdown（frontmatter 付きでよい）
    output.pdf : 省略時は入力と同じ場所・同じ名前の .pdf
"""
import sys
import os
import re
import html
import shutil
import tempfile
import subprocess

DEFAULT_MARKER = "## 生文字起こし"

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
]

CSS = """
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
body {
  font-family: "Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  color: #1a1a1a; line-height: 1.7; font-size: 10.5pt; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 { font-size: 18pt; border-bottom: 3px solid #2b6cb0; padding-bottom: .3em; margin: 0 0 .6em; color: #1a365d; }
h2 { font-size: 14pt; margin: 1.4em 0 .5em; padding-left: .5em; border-left: 5px solid #2b6cb0; color: #1a365d; }
h3 { font-size: 12pt; margin: 1.1em 0 .4em; color: #2c5282; }
ul, ol { margin: .3em 0 .8em; padding-left: 1.4em; }
li { margin: .2em 0; }
strong { color: #1a365d; }
blockquote {
  background: #f0f6ff; border-left: 4px solid #90cdf4; margin: .8em 0;
  padding: .6em .9em; border-radius: 4px; font-size: 9.8pt; color: #2a4365;
}
table.meta { border-collapse: collapse; margin: .4em 0 1.2em; font-size: 9.8pt; width: 100%; }
table.meta th, table.meta td { border: 1px solid #cbd5e0; padding: .35em .7em; text-align: left; vertical-align: top; }
table.meta th { background: #edf2f7; width: 7em; white-space: nowrap; color: #2d3748; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.2em 0; }
"""

META_LABEL = {
    "title": "タイトル", "type": "種別", "audio": "音声", "duration": "長さ",
    "source": "文字起こし", "recorded": "録音日", "participants": "参加者",
}
META_ORDER = ["type", "recorded", "duration", "audio", "source", "participants"]


def parse_args(argv):
    marker = DEFAULT_MARKER
    positional = []
    i = 0
    while i < len(argv):
        if argv[i] == "--section-marker":
            marker = argv[i + 1]
            i += 2
        else:
            positional.append(argv[i])
            i += 1
    if not positional:
        sys.exit("Usage: md_to_pdf.py <input.md> [output.pdf] [--section-marker \"## 生文字起こし\"]")
    src = positional[0]
    out = positional[1] if len(positional) > 1 else os.path.splitext(src)[0] + ".pdf"
    return src, out, marker


def split_frontmatter(text):
    meta, key = {}, None
    body = text
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if m:
        fm, body = m.group(1), m.group(2)
        for line in fm.splitlines():
            if re.match(r"^\s*-\s+", line):          # リスト項目（participants 等）
                meta.setdefault(key, [])
                meta[key].append(re.sub(r"^\s*-\s+", "", line).strip())
            elif ":" in line:
                k, v = line.split(":", 1)
                key = k.strip()
                v = v.strip()
                meta[key] = v if v else []
    return meta, body


def meta_table(meta):
    rows = []
    for k in META_ORDER:
        if k not in meta:
            continue
        v = meta[k]
        if isinstance(v, list):
            v = "、".join(v)
        rows.append(f"<tr><th>{html.escape(META_LABEL.get(k, k))}</th>"
                    f"<td>{html.escape(str(v))}</td></tr>")
    return "<table class='meta'>" + "".join(rows) + "</table>" if rows else ""


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
        p = shutil.which(name)
        if p:
            return p
    return None


def main():
    src, out, marker = parse_args(sys.argv[1:])

    try:
        import markdown
    except ImportError:
        sys.exit("ERROR: python-markdown が必要です。インストール: pip install markdown")

    chrome = find_chrome()
    if not chrome:
        sys.exit("ERROR: Chrome/Chromium/Edge が見つかりません。いずれかをインストールしてください。")

    with open(src, encoding="utf-8") as f:
        text = f.read()

    meta, body = split_frontmatter(text)

    # 要約版にするため「生文字起こし」セクション以降を落とす
    dropped = False
    if marker in body:
        body = body.split(marker, 1)[0]
        dropped = True

    body_html = markdown.markdown(
        body, extensions=["extra", "nl2br", "sane_lists"], output_format="html5"
    )
    title = html.escape(meta.get("title", os.path.basename(src)))
    doc = (f"<!DOCTYPE html><html lang='ja'><head><meta charset='utf-8'>"
           f"<title>{title}</title><style>{CSS}</style></head><body>"
           f"<h1>{title}</h1>{meta_table(meta)}{body_html}</body></html>")

    # 一時 HTML → Chrome ヘッドレスで PDF 印刷
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as tf:
        tf.write(doc)
        html_path = tf.name
    try:
        cmd = [
            chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw", "--virtual-time-budget=10000",
            f"--print-to-pdf={out}", f"file://{html_path}",
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if not os.path.exists(out):
            sys.exit(f"ERROR: PDF 生成に失敗しました。\n{r.stderr}")
    finally:
        os.unlink(html_path)

    size = os.path.getsize(out)
    note = "（生文字起こしセクションを除外した要約版）" if dropped else "（除外対象セクションなし・全体を出力）"
    print(f"PDF 出力: {out} ({size:,} bytes) {note}")


if __name__ == "__main__":
    main()
