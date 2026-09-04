#!/usr/bin/env bash
#
# 音声ファイルを分割しながら mlx-whisper で文字起こしする、再開可能なパイプライン。
#
# なぜ分割＆再開可能にするか:
#   - 長尺音声を 1 ジョブで回すと、ツールのタイムアウトや（環境によっては）
#     バックグラウンドジョブの kill で全部やり直しになる。
#   - チャンクごとに結果を即保存し、再実行で「未処理チャンクだけ」やり直すことで、
#     途中で死んでも進捗が無駄にならない。フォアグラウンドでも安全に流せる。
#
# Usage:
#   transcribe.sh <audio> [work_dir] [chunk_min] [model]
#     audio      : 入力音声（m4a/mp3/wav 等）。安定した場所のパスを渡すこと
#     work_dir   : 作業ディレクトリ（既定: <audio名>-transcribe）
#     chunk_min  : 1チャンクの分数（既定: 30）
#     model      : mlx-whisper モデル（既定: mlx-community/whisper-large-v3-turbo）
#
# 出力:
#   <work_dir>/full.txt   生の結合結果
#   <work_dir>/clean.txt  ハルシネーション圧縮後（これを本文に使う）
#
set -euo pipefail

AUDIO="${1:?音声ファイルのパスを指定してください}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$(basename "$AUDIO")"
WORK="${2:-${BASE%.*}-transcribe}"
CHUNK_MIN="${3:-30}"
MODEL="${4:-mlx-community/whisper-large-v3-turbo}"

# --- 依存チェック ---
command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg が必要です（brew install ffmpeg）"; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe が必要です"; exit 1; }
if ! command -v mlx_whisper >/dev/null 2>&1; then
  echo "ERROR: mlx_whisper が見つかりません。インストール: pip install mlx-whisper"
  echo "（Apple Silicon 前提。CPU の openai-whisper は遅く、MPS は NaN で壊れるため非推奨）"
  exit 1
fi
[ -f "$AUDIO" ] || { echo "ERROR: 音声ファイルが見つかりません: $AUDIO"; exit 1; }

mkdir -p "$WORK"

# --- 安定コピー（共有一時フォルダ等で元が消えても進められるように） ---
SRC="$WORK/source.${BASE##*.}"
if [ ! -f "$SRC" ]; then
  cp "$AUDIO" "$SRC"
fi

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
CHUNK_SEC=$(( CHUNK_MIN * 60 ))
N=$(awk -v d="$DUR" -v c="$CHUNK_SEC" 'BEGIN{ n=int(d/c); if (d>n*c) n++; print n }')
printf "総時間: %.1f 分 / %d チャンク（各 %d 分）\n" "$(awk -v d="$DUR" 'BEGIN{print d/60}')" "$N" "$CHUNK_MIN"

# --- チャンクごとに文字起こし（再開可能） ---
for i in $(seq 1 "$N"); do
  TXT="$WORK/part$(printf '%02d' "$i").txt"
  if [ -s "$TXT" ]; then
    echo "[$i/$N] 済み: $(basename "$TXT")（スキップ）"
    continue
  fi
  SS=$(( (i - 1) * CHUNK_SEC ))
  WAV="$WORK/part$(printf '%02d' "$i").wav"
  echo "[$i/$N] 抽出+文字起こし中..."
  ffmpeg -v error -y -ss "$SS" -t "$CHUNK_SEC" -i "$SRC" -ac 1 -ar 16000 "$WAV"
  mlx_whisper "$WAV" --model "$MODEL" --language ja \
    --output-dir "$WORK" --output-name "part$(printf '%02d' "$i")" \
    --output-format txt --verbose False
  rm -f "$WAV"
done

# --- 結合 → 圧縮 ---
cat "$WORK"/part*.txt > "$WORK/full.txt"
python3 "$SCRIPT_DIR/clean_transcript.py" "$WORK/full.txt" "$WORK/clean.txt"

echo ""
echo "完了:"
echo "  生結合 : $WORK/full.txt  ($(wc -m < "$WORK/full.txt" | tr -d ' ') 文字)"
echo "  整形後 : $WORK/clean.txt ($(wc -m < "$WORK/clean.txt" | tr -d ' ') 文字)  ← 本文にはこちらを使う"
