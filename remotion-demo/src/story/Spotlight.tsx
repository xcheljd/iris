import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  rect: Rect;
  /** Frame (scene-relative) the mask starts opening. */
  from: number;
  /** How long the mask stays up, including its in/out springs. */
  duration: number;
  /** Scrim opacity over everything outside the hole. */
  dim?: number;
  pad?: number;
  radius?: number;
};

const GOLD = "#dbb45c";

/**
 * Dim-mask focus rect — the attention mechanism for this cut, in place of a
 * zoom. Keeps the underlying capture at 1:1 pixels (small table text stays
 * legible, which a Ken Burns push destroys) and costs one composited layer.
 *
 * Chain several with staggered `from` values to walk a viewer through clauses
 * of a single sentence, as scene 10 does.
 */
export const Spotlight: React.FC<Props> = ({
  rect,
  from,
  duration,
  dim = 0.75,
  pad = 10,
  radius = 10,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;

  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.6 } });
  const exit = spring({
    frame: local - (duration - 12),
    fps,
    config: { damping: 200, mass: 0.6 },
  });
  const opacity = enter * (1 - exit);
  if (opacity <= 0.001) return null;

  // The hole overshoots slightly on the way in, so the eye is pulled to it
  // rather than the mask simply appearing.
  const grow = interpolate(enter, [0, 1], [18, 0]);
  const x = rect.x - pad - grow;
  const y = rect.y - pad - grow;
  const w = rect.w + pad * 2 + grow * 2;
  const h = rect.h + pad * 2 + grow * 2;
  const id = `sl-${from}-${Math.round(rect.x)}-${Math.round(rect.y)}`;

  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width={1920} height={1080} style={{ display: "block" }}>
        <defs>
          <mask id={id}>
            <rect width={1920} height={1080} fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={radius} fill="black" />
          </mask>
        </defs>
        <rect
          width={1920}
          height={1080}
          fill={`rgba(6,8,13,${dim})`}
          mask={`url(#${id})`}
        />
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={radius}
          fill="none"
          stroke={GOLD}
          strokeWidth={2}
          opacity={0.85}
        />
      </svg>
    </AbsoluteFill>
  );
};
