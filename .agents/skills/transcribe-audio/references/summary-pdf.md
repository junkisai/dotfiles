# 要約 PDF

Markdown と同じ場所・名前の PDF を作る。全文は Markdown に残す。

```bash
python3 <skill-dir>/scripts/md_to_pdf.py <input.md> [output.pdf]
```

python-markdown と Chrome / Chromium / Edge が必要。スクリプトは `## 生文字起こし` 以降を除外するため、この見出しを変えない。実行時に除外が行われたことと、生成 PDF の日本語・改ページ・本文の範囲を確認する。

依存がなく PDF を作れない場合も Markdown は保存し、PDF が未作成であることを伝える。ページ数が必要なら PDF パーサで確認し、Spotlight のキャッシュ値だけを使わない。
