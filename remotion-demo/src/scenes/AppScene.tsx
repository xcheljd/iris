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
import { Spotlight } from "../story/Spotlight";

/**
 * A dim-mask window onto one element of the capture, in the capture's own
 * 1920×1080 pixel space — measured off extracted frames, never guessed.
 * `tIn`/`tOut` are scene-relative frames; keep them inside a stretch where the
 * page underneath is held still (see probe-stillness.mjs).
 */
export type Focus = {
  x: number;
  y: number;
  w: number;
  h: number;
  tIn: number;
  tOut: number;
  pad?: number;
};

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
  /** Optional second VO line, played after the first ends (frames computed by caller). */
  vo2?: string;
  /** Frames after scene start to begin vo2. */
  vo2From?: number;
  /** Spotlight windows over named elements of the capture. */
  focus?: Focus[];
  /**
   * Extra overlays (Connector, ValueLift) drawn in the capture's coordinate
   * space, i.e. they ride the Ken Burns push along with the pixels they mark.
   */
  children?: React.ReactNode;
};

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const GOLD = "#dbb45c";
/** transform-origin keywords, as the fraction of the axis they stand for. */
const KEYWORD: Record<string, number> = {
  left: 0,
  top: 0,
  center: 0.5,
  right: 1,
  bottom: 1,
};
/** The inset frame is 1680×945 of the 1920×1080 capture. */
export const CLIP_SCALE = 1680 / 1920;

export const AppScene: React.FC<Props> = ({
  src,
  trimBefore = 0,
  caption,
  sub,
  zoomTo = "center center",
  zoomScale = 1.05,
  vo,
  vo2,
  vo2From,
  focus,
  children,
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

  // Resolve the Ken Burns origin ("50% 0%" | "center center") to a pixel offset
  // in the frame rect, exactly as CSS transform-origin resolves it against the
  // border box, so the zoom counter-translation below can undo it.
  const originParts = zoomTo.split(/\s+/);
  const frac = (v: string, total: number) =>
    (KEYWORD[v] ?? parseFloat(v) / 100) * total;
  const Px = frac(originParts[0], 1680);
  // A one-value transform-origin resolves its second component to center.
  const Py = frac(originParts[1] ?? "center", 945);
  // Scale-about-point moves the frame center C to P + z*(C-P); counter-translate
  // by (1-z)*(C-P) so the window stays centered while the push still heads
  // toward the chosen focal origin.
  const Cx = 840, Cy = 472.5;
  const ctrX = (1 - zoom) * (Cx - Px);
  const ctrY = (1 - zoom) * (Cy - Py);

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#0b1220", fontFamily: "Inter, sans-serif" }}
    >
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "relative",
            width: 1680,
            height: 945,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow:
              "0 30px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
            transform: `translate(${ctrX}px, ${ctrY}px) scale(${zoom})`,
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
          {/*
            Guidance layer, in the capture's own 1920×1080 space. 1680/1920 ===
            945/1080 === CLIP_SCALE, so this maps capture pixels 1:1 and then
            inherits the Ken Burns transform above — an overlay can never drift
            off the element it points at, however far the camera has pushed.
          */}
          {focus?.length || children ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 1920,
                height: 1080,
                transform: `scale(${CLIP_SCALE})`,
                transformOrigin: "top left",
              }}
            >
              {focus?.map((f) => (
                <Spotlight
                  key={`${f.tIn}-${f.x}-${f.y}`}
                  rect={{ x: f.x, y: f.y, w: f.w, h: f.h }}
                  from={f.tIn}
                  duration={f.tOut - f.tIn}
                  pad={f.pad}
                />
              ))}
              {children}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>

      {/* Scene-local voiceover */}
      {vo ? (
        <Sequence from={10}>
          <Audio src={staticFile(`vo/${vo}`)} />
        </Sequence>
      ) : null}
      {vo2 ? (
        <Sequence from={vo2From ?? 10}>
          <Audio src={staticFile(`vo/${vo2}`)} />
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
