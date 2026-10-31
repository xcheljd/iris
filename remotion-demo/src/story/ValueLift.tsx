import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

type Props = {
  from: number;
  duration: number;
  /** Value counted up to, in sync with the app's own state change. */
  to: number;
  /** Value counted from. */
  start: number;
  format: (n: number) => string;
  /** Optional struck-through prior value shown above the count. */
  strike?: string;
  /** Small caps label under the number. */
  label?: string;
  /** Anchor — the block is laid out relative to the frame, not the DOM. */
  x: number;
  y: number;
  align?: "left" | "right" | "center";
  size?: number;
  color?: string;
  /** When set, the type crossfades color as the count runs (45 amber → 100 red). */
  colorTo?: string;
  strikeColor?: string;
};

const mixHex = (a: string, b: string, t: number) => {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(ar, br)},${c(ag, bg)},${c(ab, bb)})`;
};

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Pulls a number out of the UI into keynote type. Used twice, both times
 * mirroring a value the app is showing at that exact frame — $4,150 → $3,735
 * on the promo row, and 45 → 100 as the heat badge recomputes. It is a
 * magnifier, never a claim the screen isn't already making.
 */
export const ValueLift: React.FC<Props> = ({
  from,
  duration,
  to,
  start,
  format,
  strike,
  label,
  x,
  y,
  align = "right",
  size = 150,
  color = "#0f172a",
  colorTo,
  strikeColor = "#94a3b8",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;

  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.7 } });
  const exit = spring({
    frame: local - (duration - 16),
    fps,
    config: { damping: 200, mass: 0.7 },
  });
  const opacity = enter * (1 - exit);
  if (opacity <= 0.001) return null;

  // The count runs slightly behind the entrance so the type lands first and
  // the number then moves — one thing at a time, even inside one overlay.
  const t = interpolate(local, [8, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const value = start + (to - start) * EASE(t);
  const rise = interpolate(enter, [0, 1], [26, 0]);
  const tint = colorTo ? mixHex(color, colorTo, EASE(t)) : color;

  const justify =
    align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          left: align === "center" ? 0 : align === "right" ? undefined : x,
          width: align === "center" ? 1920 : undefined,
          right: align === "right" ? 1920 - x : undefined,
          top: y,
          display: "flex",
          flexDirection: "column",
          alignItems: justify,
          transform: `translateY(${rise}px)`,
          fontFamily: "Inter, sans-serif",
          textAlign: align,
        }}
      >
        {strike ? (
          <div
            style={{
              fontSize: size * 0.42,
              fontWeight: 500,
              color: strikeColor,
              letterSpacing: -1,
              textDecoration: "line-through",
              textDecorationThickness: 3,
              lineHeight: 1.1,
            }}
          >
            {strike}
          </div>
        ) : null}
        <div
          style={{
            fontSize: size,
            fontWeight: 800,
            color: tint,
            letterSpacing: -size * 0.045,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {format(value)}
        </div>
        {label ? (
          <div
            style={{
              marginTop: 10,
              fontSize: size * 0.15,
              fontWeight: 600,
              color: strikeColor,
              letterSpacing: size * 0.05,
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
