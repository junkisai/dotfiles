#!/usr/bin/env python3
"""whisper の自動文字起こしから、無音区間で発生する相槌・感嘆のハルシネーションを圧縮する。

whisper は無音や低音量の区間で「うんうんうん…」「！！！」のような相槌・感嘆を
延々と幻聴することがある（特に会議終了後も録音が続いているケース）。
そのままだと生文字起こしが数千〜数万文字のノイズで埋まり読めなくなるため、
明らかにノイズな行と、行内の過剰な反復を圧縮する。実音声の発話は壊さない。

Usage:
    clean_transcript.py <input.txt> <output.txt>
"""
import re
import sys

# 相槌・感嘆・句読点・空白だけで構成される行＝ノイズ行とみなす
NOISE_RE = re.compile(r"^[うんはいへぇぇーそっ！!？\?、。\.\s]*$")
MARKER = "（…相槌・無音…）"


def collapse_inplace(s: str) -> str:
    # 2〜15字の塊が4回以上連続で反復→1回に（「正しでさあ、」×N 等の幻聴）
    s = re.sub(r"(.{2,15}?)\1{3,}", r"\1", s)
    # 「うん」「ん」の長い連続を圧縮（短い相槌は残す）
    s = re.sub(r"(うん){4,}", "うんうん", s)
    s = re.sub(r"(ん){6,}", "ん", s)
    return s


def clean(lines):
    out, run = [], 0
    collapsed = 0
    for ln in lines:
        if NOISE_RE.match(ln.strip()):
            collapsed += 1
            run += 1
            continue
        if run:
            out.append(MARKER)
            run = 0
        out.append(collapse_inplace(ln))
    if run:
        out.append(MARKER)

    # 連続するマーカー・空行を1つに畳む
    final = []
    for l in out:
        if l == MARKER and final and final[-1] == MARKER:
            continue
        if l.strip() == "" and final and final[-1].strip() == "":
            continue
        final.append(l)
    return final, collapsed


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    path_in, path_out = sys.argv[1], sys.argv[2]
    lines = open(path_in, encoding="utf-8").read().split("\n")
    final, collapsed = clean(lines)
    open(path_out, "w", encoding="utf-8").write("\n".join(final).strip() + "\n")
    print(f"collapsed noise lines: {collapsed}")
    print(f"in: {len(lines)} lines  ->  out: {len(final)} lines")


if __name__ == "__main__":
    main()
