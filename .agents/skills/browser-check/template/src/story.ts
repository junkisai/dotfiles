import { Rect, Tone } from "./parts";

/**
 * ここだけ書けばよい。
 *
 * beat の名前は収録スクリプトの mark() と揃える。フレーム番号は beats.json から
 * 自動で拾うので触らなくてよい。早送り区間は「前の beat から今の beat まで」が
 * そのまま使われる。
 */

export type Scene = {
  /** mark() で付けた名前 */
  beat: string;
  /** 停止したときの見出し。ここが一番読まれる */
  heading: string;
  /** 補足。1〜2行まで。多いと読み切れない */
  lines?: string[];
  /** コードやサーバ応答など、そのまま見せたいもの */
  code?: string;
  /** 小見出し。省略すると mark() の label が入る */
  eyebrow?: string;
  /** ok = 正常 / warn = 注意 / bad = 不具合 */
  tone?: Tone;
  /** 拡大倍率。省略時は既定値 */
  zoom?: number;
  /** 拡大範囲を上書きしたいとき。省略時は mark() で解決した focus */
  focus?: Rect;
  /** 注目領域が画面上端にあるとき true。注釈カードが重なるのを避ける */
  cardBottom?: boolean;
  /** 早送り速度の上書き */
  rate?: number;
  /** 停止時間の上書き（フレーム数） */
  holdFrames?: number;
  /** 早送り中に一度だけ出すタイトル帯 */
  lower?: { title: string; sub: string; tone: Tone };
};

export type Story = {
  title?: { eyebrow: string; heading: string; lines?: string[]; code?: string };
  scenes: Scene[];
  closing?: {
    eyebrow: string;
    heading: string;
    lines?: string[];
    code?: string;
    rows?: readonly (readonly [string, string])[];
  };
};

/** 既定値。個別の場面で上書きできる */
export const DEFAULTS = {
  rate: 2.2,
  holdFrames: 180, // 6秒
  zoom: 2.2,
  cardFrames: 115,
};

export const STORY: Story = {
  title: {
    eyebrow: "browser-check",
    heading: "ここに確認の主題を書く",
    lines: ["何を確かめたのかを1行で"],
  },
  scenes: [
    {
      beat: "example",
      heading: "観測できた事実を書く",
      lines: ["なぜそれが重要かを1行で"],
      tone: "ok",
    },
  ],
  closing: {
    eyebrow: "確認結果",
    heading: "期待どおり動作している",
    rows: [
      ["観測1", "結果"],
      ["観測2", "結果"],
    ],
  },
};
