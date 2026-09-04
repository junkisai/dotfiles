#!/usr/bin/env bash
# usage: generate.sh <prompt-file> <output.png>
#
# プロンプトはファイル渡しにしている。グラレコのプロンプトは日本語の引用符・
# 鉤括弧・改行を大量に含み、コマンドラインに直書きするとエスケープ事故が起きるため。
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: generate.sh <prompt-file> <output.png>" >&2
  exit 2
fi

PROMPT_FILE="$1"
OUT="$2"
# 目標は「16:9」だけ。解像度は生成側が返したものを保つ。
# かつては 1280x720 に揃えていたが、生成側は 1672x941 のような一回り大きい絵を返してくるので、
# 揃えると自分で解像度を捨てることになり、小さい文字から潰れていた。
MIN_W=1280

if [ ! -f "$PROMPT_FILE" ]; then
  echo "プロンプトファイルが見つからない: $PROMPT_FILE" >&2
  exit 1
fi
# 後で保存先ディレクトリへ cd するので、相対パスのまま持ち回ると読めなくなる
PROMPT_FILE="$(cd "$(dirname "$PROMPT_FILE")" && pwd)/$(basename "$PROMPT_FILE")"

OUT_DIR="$(cd "$(dirname "$OUT")" 2>/dev/null && pwd)" || {
  echo "保存先ディレクトリが見つからない: $(dirname "$OUT")" >&2
  exit 1
}
OUT_ABS="$OUT_DIR/$(basename "$OUT")"
LOG="$(mktemp -t grareco-codex)"

# 認証は先に見る。codex のトークンは自動更新されるが refresh token ごと切れることがあり、
# 気づかずに走らせると画像生成の1〜2分を待たされた末に失敗する。確認は一瞬で済む。
if ! codex login status > /dev/null 2>&1; then
  echo "codex にログインできていない。" >&2
  echo "ターミナルで次を実行してから、もう一度このスクリプトを叩く:" >&2
  echo "  codex login" >&2
  exit 3
fi

# codex は cwd を書き込み可能なワークスペースとして扱う。保存先の外で走らせると
# サンドボックスに阻まれて画像を置けないので、保存先ディレクトリに移動してから叩く。
cd "$OUT_DIR"

FULL_PROMPT="$(printf '$imagegen\n%s\n\n生成した画像は %s に保存してください。\n' \
  "$(cat "$PROMPT_FILE")" "$OUT_ABS")"

# 事前チェックを通っても、実行中に認証・利用枠で弾かれることがある。ログの文面から
# それを見分けて、ユーザーに何をしてもらえばよいかまで出す。
report_failure() {
  echo "$1 ログ: $LOG" >&2
  if grep -qiE 'not logged in|unauthorized|401|authentication|re-?authenticate|invalid_grant|token.*expired' "$LOG"; then
    echo "認証で弾かれている。ターミナルで 'codex login' を実行してから再試行する。" >&2
    tail -30 "$LOG" >&2
    exit 3
  fi
  if grep -qiE 'rate limit|quota|usage limit|too many requests|429' "$LOG"; then
    echo "利用枠の上限に当たっている。時間をおいて再試行する。" >&2
    tail -30 "$LOG" >&2
    exit 4
  fi
  tail -30 "$LOG" >&2
  exit 1
}

if ! codex exec --sandbox workspace-write --skip-git-repo-check \
  "$FULL_PROMPT" < /dev/null > "$LOG" 2>&1; then
  report_failure "codex の実行が失敗した。"
fi

if [ ! -f "$OUT_ABS" ]; then
  report_failure "画像が生成されなかった。"
fi


# 生成側がアルファ付き（RGBA）で返してくることがある。紙の白い部分が透明で抜けていると、
# 濃色の背景に貼ったときだけ文字が読めなくなり、こちらの目視では気づけない。白を敷いて潰す。
if python3 - "$OUT_ABS" <<'PYEOF' 2>/dev/null
import sys
from PIL import Image
path = sys.argv[1]
im = Image.open(path)
if im.mode in ("RGBA", "LA", "P"):
    im = im.convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[-1])
    bg.save(path)
    print("flattened")
PYEOF
then
  :
else
  echo "警告: 背景の白塗り処理をスキップした（python3 の PIL が見つからない）。" >&2
  echo "      透過が残っている可能性がある。Pillow を入れると解消する: pip3 install Pillow" >&2
fi

# 生成側は指定した比のキャンバスに、指定と違う比の絵を描いて収めてくることがある。
# 1920x1080 と頼んで 1606x1050 の絵が中央に置かれ、左右に 150px ずつ白帯が残る、という具合。
# 帯は情報を持たないうえ、貼ったときに絵そのものが小さく見えるので、外周の白を削る。
# 拡縮はしない ―― 縮小すれば小さい文字から読めなくなり、拡大してもボケが増えるだけ。
python3 - "$OUT_ABS" <<'PYEOF' 2>/dev/null || true
import sys
from PIL import Image, ImageChops

path = sys.argv[1]
im = Image.open(path).convert("RGB")
w, h = im.size
diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
# しきい値 8。紙の質感程度のわずかな濁りは余白として扱う。
bbox = diff.point(lambda v: 255 if v > 8 else 0).getbbox()
if bbox:
    MARGIN = 12  # 枠線が切り口に触れないぶんだけ残す
    l = max(0, bbox[0] - MARGIN)
    t = max(0, bbox[1] - MARGIN)
    r = min(w, bbox[2] + MARGIN)
    b = min(h, bbox[3] + MARGIN)
    if (r - l) < w * 0.99 or (b - t) < h * 0.99:
        im.crop((l, t, r, b)).save(path)
        print(f"余白を切り落とした（{w}x{h} → {r-l}x{b-t}）。")
PYEOF

W="$(sips -g pixelWidth "$OUT_ABS" | awk '/pixelWidth/{print $2}')"
H="$(sips -g pixelHeight "$OUT_ABS" | awk '/pixelHeight/{print $2}')"

# 生成側がまれに小さい絵を返す。拡大しても読めるようにはならないので、作り直しを促す。
if [ "$W" -lt "$MIN_W" ]; then
  echo "警告: 幅が ${W}px しかない（目安は 1280px 以上）。文字が読みにくいなら撃ち直す。" >&2
fi

# 16:9 から大きく外れたときだけ知らせる。余白を削った後の比は生成側の描き方しだいで
# 3:2 寄りになることがある。無理に 16:9 へ切ると内容が欠けるので、比そのものは変えない。
RATIO=$(( W * 100 / H ))
if [ "$RATIO" -lt 150 ] || [ "$RATIO" -gt 200 ]; then
  echo "注意: 縦横比が ${W}x${H} と 16:9 から離れている。貼り先の都合が合わなければ撃ち直す。" >&2
fi

echo "$OUT_ABS"
sips -g pixelWidth -g pixelHeight "$OUT_ABS" 2>/dev/null | tail -2
echo "codex log: $LOG"
