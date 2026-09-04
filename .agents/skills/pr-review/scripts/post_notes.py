#!/usr/bin/env python3
"""実装意図を draft PR の該当行に、まとめて 1 レビューとして投稿する。

notes.json はコメントの位置をコード片で指す。GitHub の API が要求するのは行番号なので、
PR の diff を引いてコード片から行番号を解く。行を特定できなかったコメントは捨てずに
レビュー本文の末尾へ回す。
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# 自分が書いたコメントを待受側が読み飛ばすための印。GitHub の画面には出ない。
MARKER = "<!-- claude-note -->"

# 投稿は依頼者と同じアカウント名で表示される。誰の発言かは本文の見出しで示す。
HEADER = "**🤖 Claude**"
KIND_LABEL = {"intent": "💡 実装意図", "applied": "✅ 反映", "answered": "💬 回答", "declined": "⏭️ 見送り"}


def gh(*args, stdin=None):
    p = subprocess.run(["gh", *args], capture_output=True,
                       input=stdin.encode() if stdin else None)
    if p.returncode != 0:
        sys.exit(f"gh {' '.join(args)} が失敗しました:\n{p.stderr.decode()}")
    return p.stdout.decode()


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def parse_diff(raw):
    """PR の diff から、コメントを付けられる行を path ごとに (side, line, text) で拾う。"""
    files, path, old, new = {}, None, 0, 0
    for line in raw.split("\n"):
        if line.startswith("diff --git"):
            path = None
        elif line.startswith("+++ "):
            p = line[4:].strip()
            path = None if p == "/dev/null" else re.sub(r"^b/", "", p)
            if path:
                files.setdefault(path, [])
        elif line.startswith("--- "):
            continue
        elif m := re.match(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", line):
            old, new = int(m.group(1)), int(m.group(2))
        elif path and line:
            tag, text = line[0], line[1:]
            if tag == "+":
                files[path].append(("RIGHT", new, text)); new += 1
            elif tag == "-":
                files[path].append(("LEFT", old, text)); old += 1
            elif tag == " ":
                files[path].append(("RIGHT", new, text)); old += 1; new += 1
    return files


def locate(rows, code):
    """コード片が連続して現れる箇所を探し、(side, start_line, end_line) を返す。"""
    want = [norm(l) for l in code.split("\n") if norm(l)]
    if not want:
        return None, "code が空"
    for side in ("RIGHT", "LEFT"):
        cand = [r for r in rows if r[0] == side]
        hits = []
        for i in range(len(cand) - len(want) + 1):
            window = cand[i:i + len(want)]
            # hunk をまたいだ飛び番地での誤一致を避けるため、行番号の連番も条件にする。
            if (all(norm(w[2]) == want[j] for j, w in enumerate(window))
                    and window[-1][1] - window[0][1] == len(want) - 1):
                hits.append((side, window[0][1], window[-1][1]))
        if hits:
            lines = "・".join(str(h[1]) for h in hits)
            return hits[0], (f"同じコードが {len(hits)} 箇所（{lines} 行目）にあり先頭に付けた" if len(hits) > 1 else None)
    return None, "diff の中に見つからない"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--notes", required=True)
    ap.add_argument("--pr")
    ap.add_argument("--repo")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    notes = json.loads(Path(a.notes).read_text())
    repo = a.repo or json.loads(gh("repo", "view", "--json", "nameWithOwner"))["nameWithOwner"]
    pr = a.pr or notes.get("pr") or json.loads(gh("pr", "view", "--json", "number"))["number"]

    files = parse_diff(gh("pr", "diff", str(pr)))

    comments, orphans = [], []
    for c in notes.get("comments", []):
        rows = files.get(c["file"])
        if rows is None:
            orphans.append((c, f"`{c['file']}` は PR の差分に無い"))
            continue
        pos, warn = locate(rows, c.get("code", ""))
        if pos is None:
            orphans.append((c, warn))
            continue
        side, start, end = pos
        body = f'{HEADER}　{KIND_LABEL.get(c.get("kind", "intent"), "")}\n\n{c["comment"]}'
        if reply := c.get("reply"):
            body += f"\n\n{reply}"
        item = {"path": c["file"], "line": end, "side": side, "body": body + "\n\n" + MARKER}
        if end != start:
            item |= {"start_line": start, "start_side": side}
        comments.append(item)
        if warn:
            print(f"⚠️  「{c['comment'][:30]}…」: {warn}", file=sys.stderr)

    body = notes.get("summary", "")
    if orphans:
        body += "\n\n---\n\n**行に置けなかったコメント**\n"
        for c, why in orphans:
            body += f"\n- `{c['file']}`（{why}）\n  {c['comment']}\n"
    payload = {"event": "COMMENT", "body": f"{HEADER}\n\n{body}\n\n{MARKER}", "comments": comments}

    if a.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"\n→ 行を解決: {len(comments)} 件 / 本文送り: {len(orphans)} 件", file=sys.stderr)
        return

    gh("api", f"repos/{repo}/pulls/{pr}/reviews", "--method", "POST",
       "--input", "-", stdin=json.dumps(payload))
    print(f"PR #{pr} に投稿しました（行コメント {len(comments)} 件 / 本文送り {len(orphans)} 件）")


main()
