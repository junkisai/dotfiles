#!/usr/bin/env python3
"""PR に届いた未処理のレビューを、返信に必要な情報ごと全文で取り出す。

待受（watch_review.sh）は通知のために既読を進めるが、こちらは反映済みかどうかを
別の台帳で数える。通知を見てから実際に直すまでの間に会話が切れても取りこぼさない。
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SKIP = ("<!-- claude-note -->", "<!-- claude-reply -->")


def gh_json(*args):
    p = subprocess.run(["gh", *args], capture_output=True)
    if p.returncode != 0:
        sys.exit(f"gh {' '.join(args)} が失敗しました:\n{p.stderr.decode()}")
    return json.loads(p.stdout or b"[]")


def mine(body):
    return any(m in (body or "") for m in SKIP)


def bot(user):
    return user.get("type") == "Bot" or user.get("login", "").endswith("[bot]")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--pr", required=True)
    ap.add_argument("--state", required=True, help="反映済みを記録する台帳")
    ap.add_argument("--mark", action="store_true", help="出力したものを反映済みにする")
    ap.add_argument("--include-bots", action="store_true", help="bot の投稿も拾う")
    a = ap.parse_args()
    bots = a.include_bots

    ledger = Path(a.state)
    done = set(ledger.read_text().split()) if ledger.exists() else set()
    base = f"repos/{a.repo}"
    items = []

    for c in gh_json("api", f"{base}/pulls/{a.pr}/comments", "--paginate"):
        key = f"rc:{c['id']}"
        if key in done or mine(c.get("body")) or (bots is False and bot(c["user"])):
            continue
        items.append({
            "key": key, "kind": "review_comment", "author": c["user"]["login"],
            "path": c["path"], "line": c.get("line") or c.get("original_line"),
            "side": c.get("side"), "in_reply_to": c.get("in_reply_to_id"),
            "diff_hunk": c.get("diff_hunk", ""), "body": c.get("body", ""),
        })

    for c in gh_json("api", f"{base}/issues/{a.pr}/comments", "--paginate"):
        key = f"ic:{c['id']}"
        if key in done or mine(c.get("body")) or (bots is False and bot(c["user"])):
            continue
        items.append({"key": key, "kind": "issue_comment",
                      "author": c["user"]["login"], "body": c.get("body", "")})

    for r in gh_json("api", f"{base}/pulls/{a.pr}/reviews", "--paginate"):
        key = f"rv:{r['id']}"
        if key in done or r.get("state") == "PENDING" or mine(r.get("body")) or (bots is False and bot(r["user"])):
            continue
        if not (r.get("body") or "").strip() and r.get("state") == "COMMENTED":
            done.add(key)  # 本文なしの COMMENTED は行コメントの入れ物。読むものが無い
            continue
        items.append({"key": key, "kind": "review", "author": r["user"]["login"],
                      "state": r.get("state"), "body": r.get("body", "")})

    print(json.dumps({"repo": a.repo, "pr": int(a.pr), "items": items},
                     ensure_ascii=False, indent=2))

    if a.mark:
        ledger.parent.mkdir(parents=True, exist_ok=True)
        ledger.write_text("\n".join(sorted(done | {i["key"] for i in items})) + "\n")


main()
