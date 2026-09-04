import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";
import { Audio, Video } from "@remotion/media";

type Props = {
  src: string;
  trimBefore?: number;
  caption: string;
  sub?: string;
  /** Ken Burns focal origin — vary per scene so the tour doesn't feel uniform. */
  zoomTo?: string;
  /** End scale of the slow push-in (default 1.05). */
  zoomScale?: number;
  /** Voiceover mp3 in public/vo/ — starts 10 frames into the scene. */
  vo?: string;
};

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const GOLD = "#dbb45c";

export const AppScene: React.FC<Props> = ({
  src,
  trimBefore = 0,
  caption,
  sub,
  zoomTo = "center center",
  zoomScale = 1.05,
  vo,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Caption — spring in, hold, fade. Scene-level fade handled by TransitionSeries.
  const capSpring = spring({ frame: frame - 6, fps, config: { damping: 16 } });
  const capY = interpolate(capSpring, [0, 1], [24, 0]);
  const capOpacityIn = interpolate(capSpring, [0, 1], [0, 1]);
  const capOpacityOut = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames - 4],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const capOpacity = Math.min(capOpacityIn, capOpacityOut);

  // Gold accent bar wipes in under the caption — small "C" polish detail.
  const accentW = interpolate(frame, [10, 34], [0, 132], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Eased Ken Burns push toward a per-scene focal point.
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, zoomScale], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#0b1220", fontFamily: "Inter, sans-serif" }}
    >
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 1680,
            height: 945,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow:
              "0 30px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
            transform: `scale(${zoom})`,
            transformOrigin: zoomTo,
            background: "#000",
          }}
        >
          <Video
            src={staticFile(src)}
            trimBefore={trimBefore}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </AbsoluteFill>

      {/* Scene-local voiceover */}
      {vo ? (
        <Sequence from={10}>
          <Audio src={staticFile(`vo/${vo}`)} />
        </Sequence>
      ) : null}

      {/* Bottom-left narrative caption with gold accent */}
      {caption ? (
      <div
        style={{
          position: "absolute",
          left: 96,
          bottom: 96,
          opacity: capOpacity,
          transform: `translateY(${capY}px)`,
          maxWidth: 1000,
        }}
      >
        <div
          style={{
            width: accentW,
            height: 5,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${GOLD}, #b8862d)`,
            marginBottom: 22,
            boxShadow: "0 2px 14px rgba(219,180,92,0.45)",
          }}
        />
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "white",
            letterSpacing: -1.5,
            lineHeight: 1.05,
            textShadow: "0 4px 24px rgba(0,0,0,0.65)",
          }}
        >
          {caption}
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 30,
            fontWeight: 400,
            color: "#cbd5e1",
            letterSpacing: 0.2,
            textShadow: "0 2px 12px rgba(0,0,0,0.65)",
          }}
        >
          {sub}
        </div>
      </div>
      ) : null}
    </AbsoluteFill>
  );
};
