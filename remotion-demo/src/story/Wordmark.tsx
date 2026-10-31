import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const GOLD_A = "#dbb45c";
const GOLD_B = "#b8862d";

/**
 * Scene 4 — three seconds, one word, then two seconds of nothing. The pause is
 * the point: it is the only place in the cut where the viewer is asked to stop
 * and let the first act land before the sheet arrives.
 */
export const Wordmark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 18 } });
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const y = interpolate(s, [0, 1], [18, 0]);
  const glow = interpolate(frame, [0, 40], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1220",
        fontFamily: "Inter, sans-serif",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(219,180,92,${glow * 0.32}) 0%, rgba(11,18,32,0) 62%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          opacity,
          transform: `translateY(${y}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 148,
            fontWeight: 800,
            letterSpacing: -6,
            color: "white",
            lineHeight: 1,
          }}
        >
          Iris
        </div>
        <div
          style={{
            marginTop: 26,
            width: 128,
            height: 4,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${GOLD_A}, ${GOLD_B})`,
            boxShadow: "0 2px 14px rgba(219,180,92,0.45)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
