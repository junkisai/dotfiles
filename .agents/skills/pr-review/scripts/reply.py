#!/usr/bin/env python3
"""指摘への回答を、それぞれのスレッドに返信する。必要なら解決済みにする。

スレッドの解決だけは REST に無く GraphQL の resolveReviewThread を使う。
"""

import argparse
import json
import subprocess
import sys

MARKER = "<!-- claude-reply -->"
HEADER = "**🤖 Claude**"
BADGE = {"applied": "✅ 反映しました", "answered": "💬 回答します", "declined": "⏭️ 見送りました"}

THREADS_Q = """
query($owner:String!,$name:String!,$pr:Int!){
  repository(owner:$owner,name:$name){ pullRequest(number:$pr){
    reviewThreads(first:100){ nodes{ id isResolved comments(first:50){ nodes{ databaseId } } } } } } }
"""
RESOLVE_M = "mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } } }"


def gh(*args, stdin=None):
    p = subprocess.run(["gh", *args], capture_output=True,
                       input=stdin.encode() if stdin else None)
    if p.returncode != 0:
        print(f"⚠️  gh {' '.join(args[:3])} が失敗:\n{p.stderr.decode()}", file=sys.stderr)
        return None
    return p.stdout.decode()


def thread_of(repo, pr, comment_id):
    owner, name = repo.split("/")
    out = gh("api", "graphql", "-f", f"query={THREADS_Q}", "-F", f"owner={owner}",
             "-F", f"name={name}", "-F", f"pr={pr}")
    if not out:
        return None
    for t in json.loads(out)["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]:
        if any(c["databaseId"] == comment_id for c in t["comments"]["nodes"]):
            return None if t["isResolved"] else t["id"]
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--pr", required=True)
    ap.add_argument("--resolve", action="store_true", help="返信したスレッドを解決済みにする")
    ap.add_argument("--input", default="-", help="返信の JSON 配列（既定は標準入力）")
    a = ap.parse_args()

    raw = sys.stdin.read() if a.input == "-" else open(a.input).read()
    base = f"repos/{a.repo}"

    for r in json.loads(raw):
        body = f"{HEADER}　{BADGE.get(r.get('status'), '')}\n\n{r['body']}\n\n{MARKER}"
        cid = int(str(r["key"]).split(":")[1]) if "key" in r else int(r["id"])
        if str(r.get("kind", r.get("key", ""))).startswith(("rc", "review_comment")):
            ok = gh("api", f"{base}/pulls/{a.pr}/comments/{cid}/replies",
                    "--method", "POST", "-f", f"body={body}")
            if ok and a.resolve and (tid := thread_of(a.repo, a.pr, cid)):
                gh("api", "graphql", "-f", f"query={RESOLVE_M}", "-F", f"id={tid}")
        else:
            gh("api", f"{base}/issues/{a.pr}/comments", "--method", "POST",
               "-f", f"body={body}")
        print(f"→ {r.get('key', cid)} に返信しました")


main()
