import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const W = 1440;
export const H = 810;

export const SANS = '"Hiragino Sans", "Noto Sans JP", -apple-system, sans-serif';
export const MONO = '"JetBrains Mono", "SFMono-Regular", Menlo, monospace';

export const INK = "#f2f5f0";
export const MUTED = "#b6bfb1";
export const GROUND = "#12150f";
export const ACCENT = "#9cc492";

export type Tone = "ok" | "warn" | "bad";
export const TONE: Record<Tone, string> = { ok: "#6fbf73", warn: "#e0b14e", bad: "#e4685a" };

export type Rect = { x: number; y: number; w: number; h: number };

/** 操作中に一度だけ出るタイトル帯 */
export const LowerThird: React.FC<{ title: string; sub: string; tone: Tone }> = ({ title, sub, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const out = interpolate(frame, [78, 96], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 48,
        opacity: inS * out,
        transform: `translateY(${interpolate(inS, [0, 1], [40, 0])}px)`,
        background: "rgba(12,16,10,0.93)",
        borderLeft: `4px solid ${TONE[tone]}`,
        padding: "20px 30px",
        maxWidth: 940,
      }}
    >
      <div style={{ fontFamily: SANS, color: INK, fontSize: 32, fontWeight: 700 }}>{title}</div>
      <div style={{ fontFamily: SANS, color: "#a9b2a4", fontSize: 20, marginTop: 8 }}>{sub}</div>
    </div>
  );
};

export const Motion: React.FC<{
  clip: string;
  from: number;
  to: number;
  rate: number;
  lower?: { title: string; sub: string; tone: Tone };
}> = ({ clip, from, to, rate, lower }) => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <OffthreadVideo src={staticFile(clip)} startFrom={from} endAt={to} playbackRate={rate} />
    {lower ? <LowerThird {...lower} /> : null}
  </AbsoluteFill>
);

/** 静止して拡大し、注釈をつける */
export const Hold: React.FC<{
  still: string;
  focus: Rect;
  zoom: number;
  tone: Tone;
  eyebrow: string;
  heading: string;
  lines?: string[];
  code?: string;
  /** 注目領域が画面上部にあり、カードと重なる場合に下へ寄せる */
  cardBottom?: boolean;
}> = ({ still, focus, zoom, tone, eyebrow, heading, lines = [], code, cardBottom }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  const TX = W / 2;
  const TY = H * 0.64;

  const z = spring({ frame, fps, config: { damping: 200, mass: 0.9 }, durationInFrames: 26 });
  const scale = interpolate(z, [0, 1], [1, zoom]);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const tx = clamp(interpolate(z, [0, 1], [0, TX - zoom * cx]), W - scale * W, 0);
  const ty = clamp(interpolate(z, [0, 1], [0, TY - zoom * cy]), H - scale * H, 0);
  const dim = interpolate(frame, [6, 26], [0, 0.66], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ring = interpolate(frame, [12, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const card = spring({ frame: frame - 22, fps, config: { damping: 200 }, durationInFrames: 20 });

  const shade: React.CSSProperties = { position: "absolute", background: "#0b0f08", opacity: dim };
  const pad = 8;

  return (
    <AbsoluteFill style={{ background: "#0b0f08", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: W,
          height: H,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }}
      >
        <Img src={staticFile(still)} style={{ width: W, height: H }} />
        <div style={{ ...shade, left: -W, top: -H, width: W * 3, height: H + focus.y - pad }} />
        <div style={{ ...shade, left: -W, top: focus.y + focus.h + pad, width: W * 3, height: H * 3 }} />
        <div style={{ ...shade, left: -W, top: focus.y - pad, width: W + focus.x - pad, height: focus.h + pad * 2 }} />
        <div
          style={{ ...shade, left: focus.x + focus.w + pad, top: focus.y - pad, width: W * 3, height: focus.h + pad * 2 }}
        />
        <div
          style={{
            position: "absolute",
            left: focus.x - pad,
            top: focus.y - pad,
            width: focus.w + pad * 2,
            height: focus.h + pad * 2,
            border: `${3 / scale}px solid ${TONE[tone]}`,
            borderRadius: 3,
            opacity: ring,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 60,
          ...(cardBottom ? { bottom: 56 } : { top: 56 }),
          width: 790,
          opacity: card,
          transform: `translateY(${interpolate(card, [0, 1], [24, 0])}px)`,
          background: "rgba(10,14,8,0.95)",
          borderTop: `4px solid ${TONE[tone]}`,
          padding: "26px 32px 28px",
        }}
      >
        <div style={{ fontFamily: SANS, color: TONE[tone], fontSize: 15, letterSpacing: ".12em", marginBottom: 10 }}>
          {eyebrow}
        </div>
        <div style={{ fontFamily: SANS, color: INK, fontSize: 31, fontWeight: 700, lineHeight: 1.4 }}>{heading}</div>
        {lines.map((l) => (
          <div key={l} style={{ fontFamily: SANS, color: MUTED, fontSize: 19, lineHeight: 1.7, marginTop: 10 }}>
            {l}
          </div>
        ))}
        {code ? (
          <div
            style={{
              fontFamily: MONO,
              color: ACCENT,
              fontSize: 16,
              marginTop: 18,
              paddingLeft: 14,
              borderLeft: "2px solid #3c4a37",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}
          >
            {code}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const Card: React.FC<{
  eyebrow: string;
  heading: string;
  lines?: string[];
  code?: string;
  rows?: readonly (readonly [string, string])[];
}> = ({ eyebrow, heading, lines = [], code, rows }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const out = interpolate(frame, [durationInFrames - 16, durationInFrames - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: GROUND, justifyContent: "center", padding: "0 110px", opacity: inS * out }}>
      <div style={{ transform: `translateY(${interpolate(inS, [0, 1], [18, 0])}px)` }}>
        <div style={{ fontFamily: MONO, color: ACCENT, fontSize: 18, letterSpacing: ".14em", marginBottom: 22 }}>
          {eyebrow}
        </div>
        <div style={{ fontFamily: SANS, color: INK, fontSize: 46, fontWeight: 700, lineHeight: 1.35, maxWidth: 1130 }}>
          {heading}
        </div>
        {lines.map((l) => (
          <div
            key={l}
            style={{ fontFamily: SANS, color: MUTED, fontSize: 23, lineHeight: 1.8, marginTop: 14, maxWidth: 1080 }}
          >
            {l}
          </div>
        ))}
        {code ? (
          <div
            style={{
              fontFamily: MONO,
              color: ACCENT,
              fontSize: 18,
              marginTop: 26,
              paddingLeft: 18,
              borderLeft: "2px solid #3c4a37",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
            }}
          >
            {code}
          </div>
        ) : null}
        {rows ? (
          <div style={{ marginTop: 26 }}>
            {rows.map(([a, b], i) => {
              const s = spring({ frame: frame - 14 - i * 8, fps, config: { damping: 200 }, durationInFrames: 18 });
              return (
                <div
                  key={a}
                  style={{
                    display: "flex",
                    gap: 28,
                    alignItems: "baseline",
                    padding: "15px 0",
                    borderTop: "1px solid #2a3126",
                    opacity: s,
                    transform: `translateX(${interpolate(s, [0, 1], [-14, 0])}px)`,
                  }}
                >
                  <div style={{ fontFamily: MONO, color: ACCENT, fontSize: 19, width: 300 }}>{a}</div>
                  <div style={{ fontFamily: SANS, color: INK, fontSize: 23 }}>{b}</div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
