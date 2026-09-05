import React from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Card, GROUND, Hold, Motion, Rect, Tone } from "./parts";
import { STORY, DEFAULTS } from "./story";
import beats from "./beats.json";

type Beat = {
  name: string;
  frame: number;
  still: string;
  focus: Rect | null;
  label: string;
  masks?: Rect[];
};

const BEATS = beats.beats as Beat[];
const FPS = beats.fps as number;
const byName = (n: string) => BEATS.find((b) => b.name === n);

/** 早送り区間に、実データを隠す矩形を重ねる */
const Masked: React.FC<{ masks?: Rect[]; children: React.ReactNode }> = ({ masks, children }) => (
  <AbsoluteFill>
    {children}
    {(masks ?? []).map((m, i) => (
      <div
        key={i}
        style={{ position: "absolute", left: m.x, top: m.y, width: m.w, height: m.h, background: "#111111" }}
      />
    ))}
  </AbsoluteFill>
);

/**
 * story.ts に書いた場面を、beats.json のフレーム位置から尺に落とす。
 *
 * 早送り区間は「前の beat から今の beat まで」を自動で切り出す。
 * 書き手は見出しと拡大対象だけ決めればよく、フレーム番号を触らなくて済む。
 */
export const Video: React.FC = () => {
  const blocks: React.ReactNode[] = [];
  let at = 0;
  let cursor = 0; // 素材のどこまで使ったか

  const push = (dur: number, node: React.ReactNode, key: string) => {
    blocks.push(
      <Sequence key={key} from={at} durationInFrames={dur} name={key}>
        {node}
      </Sequence>
    );
    at += dur;
  };

  if (STORY.title) {
    push(DEFAULTS.cardFrames, <Card {...STORY.title} />, "title");
  }

  STORY.scenes.forEach((scene, i) => {
    const beat = byName(scene.beat);
    if (!beat) {
      console.warn(`story.ts の scene "${scene.beat}" が beats.json に見つかりません`);
      return;
    }

    // 前の beat から今の beat までを早送りで流す
    const rate = scene.rate ?? DEFAULTS.rate;
    const srcFrames = Math.max(0, beat.frame - cursor);
    if (srcFrames > 0 && beats.clip) {
      push(
        Math.max(1, Math.floor(srcFrames / rate)),
        <Masked masks={beat.masks}>
          <Motion
            clip={beats.clip as string}
            from={cursor}
            to={beat.frame}
            rate={rate}
            lower={scene.lower}
          />
        </Masked>,
        `motion-${i}-${scene.beat}`
      );
    }
    cursor = beat.frame;

    // 見せどころで止めて拡大する
    push(
      scene.holdFrames ?? DEFAULTS.holdFrames,
      <Hold
        still={beat.still}
        focus={scene.focus ?? beat.focus ?? { x: 0, y: 0, w: beats.size.width, h: beats.size.height }}
        zoom={scene.zoom ?? DEFAULTS.zoom}
        tone={scene.tone ?? "ok"}
        eyebrow={scene.eyebrow ?? beat.label}
        heading={scene.heading}
        lines={scene.lines}
        code={scene.code}
        cardBottom={scene.cardBottom}
      />,
      `hold-${i}-${scene.beat}`
    );
  });

  if (STORY.closing) {
    push(DEFAULTS.cardFrames, <Card {...STORY.closing} />, "closing");
  }

  return <AbsoluteFill style={{ background: GROUND }}>{blocks}</AbsoluteFill>;
};

export const VIDEO_FPS = FPS;
export const VIDEO_SIZE = beats.size as { width: number; height: number };
export const VIDEO_DURATION = (() => {
  let total = STORY.title ? DEFAULTS.cardFrames : 0;
  let cursor = 0;
  STORY.scenes.forEach((s) => {
    const b = byName(s.beat);
    if (!b) return;
    const src = Math.max(0, b.frame - cursor);
    if (src > 0 && beats.clip) total += Math.max(1, Math.floor(src / (s.rate ?? DEFAULTS.rate)));
    cursor = b.frame;
    total += s.holdFrames ?? DEFAULTS.holdFrames;
  });
  if (STORY.closing) total += DEFAULTS.cardFrames;
  return Math.max(1, total);
})();

// staticFile を Motion/Hold の中で使うため、public に置いた素材名をそのまま渡している
export const _staticFile = staticFile;
