#!/usr/bin/env python3
"""docs/setup.md の手順4が実際に配置されているかを確かめる。読み取りのみ。"""

import glob
import os
import re
import shlex
import subprocess
import sys

# install の -m/-o/-g は値を取るので、次のトークンごと読み飛ばす
OPTS_WITH_VALUE = {"-m", "-o", "-g"}


def setup_block(text):
    """「## 4.」節の最初のコードブロックを行のリストで返す"""
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("## 4."))
    body = lines[start:]
    opened = next(i for i, l in enumerate(body) if l.startswith("```"))
    closed = next(i for i, l in enumerate(body[opened + 1:], opened + 1) if l.startswith("```"))
    return body[opened + 1:closed]


def destinations(block, repo):
    """cp / install の宛先を、実際に置かれるファイル単位まで開いて返す

    戻り値は (宛先, コピー元がリポジトリにあるか) の組。
    """
    found = []
    for raw in block:
        for part in re.split(r"&&|\|\|", raw):
            try:
                tokens = shlex.split(part, comments=True)
            except ValueError:
                continue
            if tokens and tokens[0] == "sudo":
                tokens = tokens[1:]
            if not tokens or tokens[0] not in ("cp", "install"):
                continue

            args, rest = [], iter(tokens[1:])
            for token in rest:
                if token.startswith("-"):
                    if token in OPTS_WITH_VALUE:
                        next(rest, None)
                    continue
                args.append(token)
            if len(args) < 2:
                continue

            srcs, dest = args[:-1], os.path.expanduser(args[-1])
            expanded = []
            for src in srcs:
                hits = sorted(glob.glob(os.path.join(repo, src)))
                if hits:
                    expanded.extend((h, True) for h in hits)
                else:
                    expanded.append((src, False))

            # 末尾が / か、コピー元が複数なら宛先はディレクトリ
            as_dir = args[-1].endswith("/") or len(expanded) > 1
            for src, in_repo in expanded:
                target = os.path.join(dest, os.path.basename(src)) if as_dir else dest
                found.append((target, in_repo))
    return list(dict.fromkeys(found))


def main():
    script = os.path.realpath(__file__)
    repo = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(
        os.path.join(os.path.dirname(script), "..", "..", "..", "..")
    )
    setup = os.path.join(repo, "docs/setup.md")
    if not os.path.isfile(setup):
        sys.exit(f"見つからない: {setup}")

    dests = destinations(setup_block(open(setup).read()), repo)
    if not dests:
        sys.exit("手順4から配置先を読み取れなかった。docs/setup.md の書式を確認する")

    print("# 手順4の配置状況")
    print(f"リポジトリ: {repo}\n")

    missing = [d for d, in_repo in dests if in_repo and not os.path.exists(d)]
    broken = [d for d, in_repo in dests if not in_repo]
    for dest, in_repo in dests:
        short = dest.replace(os.path.expanduser("~"), "~", 1)
        if not in_repo:
            print(f"  ? {short}（コピー元がリポジトリに無い）")
        else:
            print(f"  {'✓' if os.path.exists(dest) else '✗'} {short}")

    # sudoers は置いただけでは効かない。所有者や権限が合わないと sudo が黙って無視する
    sudoers = [d for d, _ in dests if d.startswith("/etc/sudoers.d/") and os.path.exists(d)]
    if sudoers:
        rules = subprocess.run(
            ["sudo", "-n", "-l"], capture_output=True, text=True
        ).stdout
        if "NOPASSWD" not in rules:
            print("\n  ! /etc/sudoers.d/ に置かれているが sudo に読まれていない")
            print("    所有者と権限を確認する: sudo ls -l /etc/sudoers.d/")

    if broken:
        print(f"\ndocs/setup.md の手順4が、リポジトリに無いファイルを {len(broken)} 件参照している。")
    if missing:
        print(f"\n未配置が {len(missing)} 件ある。docs/setup.md の手順4を上から実行する。")
    if missing or broken:
        sys.exit(1)
    print("\n手順4は済んでいる。")


if __name__ == "__main__":
    main()
