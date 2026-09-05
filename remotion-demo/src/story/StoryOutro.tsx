import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const GOLD_A = "#dbb45c";
const GOLD_B = "#b8862d";

/**
 * Scene 16. Keeps v1's outro cadence — the one thing worth keeping from it —
 * and adds the sub-line the deployment story actually turns on.
 */
export const StoryOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const word = spring({ frame: frame - 8, fps, config: { damping: 18 } });
  const rule = spring({ frame: frame - 26, fps, config: { damping: 20 } });
  const sub = spring({ frame: frame - 40, fps, config: { damping: 20 } });
  const tag = spring({ frame: frame - 92, fps, config: { damping: 20 } });

  const glow = interpolate(frame, [0, durationInFrames], [0.25, 0.55]);
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 24, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" },
  );

  const lift = (s: number) => ({
    opacity: interpolate(s, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px)`,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1220",
        fontFamily: "Inter, sans-serif",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1300,
          height: 1300,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(219,180,92,${glow * 0.26}) 0%, rgba(11,18,32,0) 60%)`,
          filter: "blur(50px)",
        }}
      />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            ...lift(word),
            fontSize: 140,
            fontWeight: 800,
            color: "white",
            letterSpacing: -5,
            lineHeight: 1,
          }}
        >
          Iris
        </div>
        <div
          style={{
            opacity: interpolate(rule, [0, 1], [0, 1]),
            width: interpolate(rule, [0, 1], [0, 150]),
            height: 4,
            borderRadius: 2,
            margin: "30px auto 0",
            background: `linear-gradient(90deg, ${GOLD_A}, ${GOLD_B})`,
            boxShadow: "0 2px 14px rgba(219,180,92,0.45)",
          }}
        />
        <div
          style={{
            ...lift(sub),
            marginTop: 34,
            fontSize: 30,
            fontWeight: 500,
            color: "#94a3b8",
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          Self-hosted · SQLite · One process
        </div>
        <div
          style={{
            ...lift(tag),
            marginTop: 46,
            fontSize: 40,
            fontWeight: 400,
            color: "#cbd5e1",
            letterSpacing: 0.4,
          }}
        >
          Every thread, remembered.
        </div>
      </div>
    </AbsoluteFill>
  );
};
