import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type Link = {
  /** Row centre-line y in the captured 1920x1080 frame. */
  y: number;
  x1: number;
  x2: number;
};

type Props = {
  links: Link[];
  from: number;
  duration: number;
  /** Frames between each successive link starting to draw. */
  stagger?: number;
};

const GOLD = "#dbb45c";

/**
 * Animated SVG links from a promo row's model number across to its matched-
 * client count. Scene 6 only: this is the one mechanic a still frame cannot
 * explain — that the sheet is being read against the book, not just displayed —
 * and repeating the device anywhere else turns it cartoonish.
 */
export const Connector: React.FC<Props> = ({ links, from, duration, stagger = 9 }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local > duration) return null;

  const DRAW = 22;
  const RETRACT = 18;

  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ display: "block" }}>
        {links.map((l, i) => {
          const t = local - i * stagger;
          // Draw on from the model cell, hold, then retract from the same end.
          const drawn = interpolate(t, [0, DRAW], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const gone = interpolate(
            t,
            [duration - i * stagger - RETRACT, duration - i * stagger],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const visible = drawn - gone;
          if (visible <= 0.001) return null;

          const d = `M ${l.x1} ${l.y} Q ${(l.x1 + l.x2) / 2} ${l.y - 42} ${l.x2} ${l.y}`;

          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={GOLD}
                strokeWidth={2.5}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - visible}
                opacity={0.9}
                style={{ filter: `drop-shadow(0 0 6px rgba(219,180,92,0.55))` }}
              />
              {/* Landing dot pops once the line reaches the client count. */}
              <circle
                cx={l.x2}
                cy={l.y}
                r={interpolate(t, [DRAW - 4, DRAW + 6], [0, 5.5], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }) * (1 - gone)}
                fill={GOLD}
                opacity={0.95}
              />
              <circle cx={l.x1} cy={l.y} r={3.5 * visible} fill={GOLD} opacity={0.8} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
