import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Cold open — the emotional problem the product solves. Three lines reveal in
 * sequence, the last one lands with weight, then the whole thing dims and
 * hands off to the brand intro (the "answer"). Sets stakes before features.
 */

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const LINES = [
  { text: "Every client is a relationship.", strong: false },
  { text: "Too much to remember.", strong: true },
  { text: "Too many pages to flip through.", strong: true },
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const exit = interpolate(
    frame,
    [durationInFrames - 16, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1220",
        fontFamily: "Inter, sans-serif",
        alignItems: "center",
        justifyContent: "center",
        opacity: exit,
      }}
    >
      {/* faint vignette for mood */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 45%, rgba(30,41,59,0.5) 0%, rgba(11,18,32,0) 55%)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        {LINES.map((line, i) => {
          const start = 8 + i * 30;
          const opacity = interpolate(
            frame,
            [start, start + 22],
            [0, line.strong ? 1 : 0.62],
            { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const y = interpolate(frame, [start, start + 22], [22, 0], {
            easing: EASE,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={line.text}
              style={{
                opacity,
                transform: `translateY(${y}px)`,
                color: "white",
                fontSize: line.strong ? 72 : 44,
                fontWeight: line.strong ? 800 : 400,
                letterSpacing: line.strong ? -1.5 : 0,
                textAlign: "center",
                maxWidth: 1400,
                lineHeight: 1.15,
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
