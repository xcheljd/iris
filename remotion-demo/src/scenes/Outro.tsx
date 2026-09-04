import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const lineA = spring({ frame, fps, config: { damping: 18 } });
  const lineB = spring({ frame: frame - 18, fps, config: { damping: 18 } });
  const lineC = spring({ frame: frame - 38, fps, config: { damping: 20 } });

  const opA = interpolate(lineA, [0, 1], [0, 1]);
  const opB = interpolate(lineB, [0, 1], [0, 1]);
  const opC = interpolate(lineC, [0, 1], [0, 1]);

  const yA = interpolate(lineA, [0, 1], [20, 0]);
  const yB = interpolate(lineB, [0, 1], [20, 0]);
  const yC = interpolate(lineC, [0, 1], [20, 0]);

  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  const glow = interpolate(frame, [0, durationInFrames], [0.3, 0.6]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1220",
        opacity: fadeOut,
        fontFamily: "Inter, sans-serif",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(99,102,241,${glow * 0.3}) 0%, rgba(11,18,32,0) 60%)`,
          filter: "blur(50px)",
        }}
      />
      <div
        style={{
          textAlign: "center",
        }}
      >
        <div
          style={{
            opacity: opA,
            transform: `translateY(${yA}px)`,
            fontSize: 56,
            fontWeight: 300,
            color: "#94a3b8",
            letterSpacing: 0.5,
          }}
        >
          Built with care.
        </div>
        <div
          style={{
            opacity: opB,
            transform: `translateY(${yB}px)`,
            marginTop: 24,
            fontSize: 128,
            fontWeight: 800,
            color: "white",
            letterSpacing: -3,
            lineHeight: 1,
          }}
        >
          Iris
        </div>
        <div
          style={{
            opacity: opC,
            transform: `translateY(${yC}px)`,
            marginTop: 32,
            fontSize: 28,
            fontWeight: 400,
            color: "#64748b",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          for the people who do the work
        </div>
      </div>
    </AbsoluteFill>
  );
};
