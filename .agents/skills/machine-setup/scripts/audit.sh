#!/usr/bin/env bash
# 現行マシンの実態と Brewfile / docs/setup.md の差分を出す。読み取りのみ。
set -uo pipefail

# シンボリックリンク経由で呼ばれてもリポジトリを見失わないよう、実体パスから遡る
SCRIPT="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$0")"
REPO="${1:-$(cd "$(dirname "$SCRIPT")/../../../.." && pwd)}"
BREWFILE="$REPO/Brewfile"
SETUP="$REPO/docs/setup.md"

for f in "$BREWFILE" "$SETUP"; do
  [ -f "$f" ] || { echo "見つからない: $f" >&2; exit 1; }
done

section() { printf '\n## %s\n' "$1"; }
none()    { echo "  （なし）"; }

# tap 付きの名前は末尾だけを見る（supabase/tap/supabase → supabase）
declared_brew=$(grep -E '^brew "' "$BREWFILE" | sed 's/^brew "//; s/".*//; s|.*/||' | sort -u)
declared_cask=$(grep -E '^cask "' "$BREWFILE" | sed 's/^cask "//; s/".*//' | sort -u)

installed_brew=$(brew list --formula 2>/dev/null | sort -u)
installed_cask=$(brew list --cask 2>/dev/null | sort -u)
requested=$(brew leaves --installed-on-request 2>/dev/null | sed 's|.*/||' | sort -u)
orphans=$(brew leaves --installed-as-dependency 2>/dev/null | sed 's|.*/||' | sort -u)

echo "# machine-setup audit"
echo "リポジトリ: $REPO"
echo "実行日時: $(date '+%Y-%m-%d %H:%M')"

section "1. Brewfile にあるが未インストール"
{
  comm -23 <(echo "$declared_brew") <(echo "$installed_brew") | sed 's/^/  brew  /'
  comm -23 <(echo "$declared_cask") <(echo "$installed_cask") | sed 's/^/  cask  /'
} | grep . || none

section "2. 明示的に入れたが Brewfile に無い formula"
echo "   （brew install で自分で入れたのに未記載のもの）"
comm -23 <(echo "$requested") <(echo "$declared_brew") | sed 's/^/  /' | grep . || none

section "3. インストール済みだが Brewfile に無い cask"
comm -23 <(echo "$installed_cask") <(echo "$declared_cask") | sed 's/^/  /' | grep . || none

section "4. 孤児候補 formula"
echo "   （依存として入ったが、いまは何からも参照されていない。Brewfile 宣言済みは除く）"
comm -23 <(echo "$orphans") <(echo "$declared_brew") | sed 's/^/  /' | grep . || none

section "5. /Applications にあって、どこにも記載が無いアプリ"
echo "   （表記ゆれを吸収して突き合わせるが、最後は目視で確かめる）"
BREWFILE="$BREWFILE" SETUP="$SETUP" python3 <<'PY'
import os, re, subprocess
from pathlib import Path

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

text = Path(os.environ["BREWFILE"]).read_text() + Path(os.environ["SETUP"]).read_text()
# アプリ名になりうるトークンだけを集める。正規化した全文への部分一致だと、
# 短い名前（Arc など）が無関係な単語に埋もれて「記載あり」と誤判定される
tokens = {norm(t) for t in re.findall(r'^cask "([^"]+)"', text, re.M)}
tokens |= {norm(t) for t in re.findall(r'\*\*([^*]+)\*\*', text)}
tokens |= {norm(re.split(r'\s+[—…]', t)[0]) for t in re.findall(r'^- \[ \] (.+)$', text, re.M)}
tokens.discard("")

def covered(n):
    if n in tokens:
        return True
    # Docker ↔ docker-desktop、zoom.us ↔ zoom のような前方一致を拾う
    return any(len(t) >= 4 and len(n) >= 4 and (n.startswith(t) or t.startswith(n))
               for t in tokens)

def bundle_id(app):
    plist = f"/Applications/{app}/Contents/Info.plist"
    try:
        return subprocess.run(["defaults", "read", plist, "CFBundleIdentifier"],
                              capture_output=True, text=True, timeout=5).stdout.strip() or "-"
    except Exception:
        return "-"

rows = []
for app in sorted(os.listdir("/Applications")):
    if not app.endswith(".app") or app.startswith("."):
        continue
    base = app[:-4]
    if covered(norm(base)):
        continue
    bid = bundle_id(app)
    if bid.startswith("com.apple."):   # macOS 標準アプリは管理対象外
        continue
    rows.append((base, bid))

if rows:
    for base, bid in rows:
        print(f"  {base:<34} {bid}")
else:
    print("  （なし）")
PY

section "6. App Store 経由のアプリ"
echo "   （cask ではなく docs/setup.md の App Store 一覧に置くもの）"
found=0
for app in /Applications/*.app; do
  if [ -e "$app/Contents/_MASReceipt" ]; then
    echo "  $(basename "$app" .app)"
    found=1
  fi
done
[ "$found" -eq 1 ] || none

section "7. brew の外から入っている CLI"
echo "   （docs/setup.md の「brew の外から入る CLI」と突き合わせる）"
for d in "$HOME/.local/bin" "$HOME/Library/pnpm"; do
  [ -d "$d" ] || continue
  echo "  $d:"
  ls "$d" 2>/dev/null | sed 's/^/    /'
done
command -v pipx >/dev/null && { echo "  pipx:"; pipx list --short 2>/dev/null | sed 's/^/    /'; }

echo
echo "---"
echo "この差分をもとに、要る / 要らないを1件ずつ確認してから Brewfile と docs/setup.md を更新する。"
