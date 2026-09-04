import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Cinematic CCRM intro: the gold "C" watch-ring draws itself on, the watch
 * hands wind into their 10:10 rest pose, the center pin pops, then the
 * wordmark and tagline rise in. Brand geometry mirrors components/iris-icon.
 */

const CX = 256;
const CY = 256;
const R = 200;
const SW = 44;
const cos45 = 0.70711;
const START_X = CX + R * cos45;
const START_Y = CY - R * cos45;
const END_X = CX + R * cos45;
const END_Y = CY + R * cos45;

// Hand rest poses (10:10): minute at 2 o'clock (30deg), hour at 10 (150deg).
const toRad = (d: number) => (d * Math.PI) / 180;
const MIN_LEN = 120;
const HOUR_LEN = 80;
const MIN_X2 = +(CX + MIN_LEN * Math.cos(toRad(30))).toFixed(2);
const MIN_Y2 = +(CY - MIN_LEN * Math.sin(toRad(30))).toFixed(2);
const HOUR_X2 = +(CX + HOUR_LEN * Math.cos(toRad(150))).toFixed(2);
const HOUR_Y2 = +(CY - HOUR_LEN * Math.sin(toRad(150))).toFixed(2);

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // 1. C-ring draws on (stroke-dashoffset 1 → 0 via pathLength="1").
  const ringDraw = interpolate(frame, [4, 40], [1, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 2. Watch hands wind: spin ~1.75 turns then settle (shared progress, the
  // hands keep their 140deg offset so they land exactly at 10:10).
  const wind = interpolate(frame, [8, 52], [-630, 0], {
    easing: Easing.bezier(0.22, 1, 0.36, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 3. Center pin pops in.
  const pin = interpolate(frame, [44, 56], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 4. Wordmark + tagline rise in.
  const wordOpacity = interpolate(frame, [52, 74], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const wordY = interpolate(frame, [52, 74], [44, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagOpacity = interpolate(frame, [68, 92], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagY = interpolate(frame, [68, 92], [20, 0], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Gold glow breathes up as the mark forms, then holds.
  const glow = interpolate(frame, [0, 50], [0, 0.55], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Whole-scene gentle settle (slight scale-down as it locks in).
  const markScale = interpolate(frame, [0, 56], [1.08, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Scene-level fade-out is handled by Demo's TransitionSeries; keep a tiny
  // safety fade so a hard cut never flashes.
  const exit = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
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
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(219,180,92,${glow * 0.4}) 0%, rgba(11,18,32,0) 62%)`,
          filter: "blur(40px)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `scale(${markScale})`,
        }}
      >
        <svg
          viewBox="0 0 512 512"
          width={300}
          height={300}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="iris-intro-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#dbb45c" />
              <stop offset="100%" stopColor="#b8862d" />
            </linearGradient>
          </defs>

          {/* C-ring traces itself on */}
          <path
            d={`M ${START_X.toFixed(2)} ${START_Y.toFixed(2)} A ${R} ${R} 0 1 0 ${END_X.toFixed(2)} ${END_Y.toFixed(2)}`}
            stroke="url(#iris-intro-g)"
            strokeWidth={SW}
            strokeLinecap="round"
            fill="none"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={ringDraw}
          />

          {/* Watch hands wind into the 10:10 pose */}
          <g style={{ transformBox: "fill-box" }}>
            <line
              x1={CX}
              y1={CY}
              x2={MIN_X2}
              y2={MIN_Y2}
              stroke="url(#iris-intro-g)"
              strokeWidth={9}
              strokeLinecap="round"
              style={{
                transform: `rotate(${wind}deg)`,
                transformOrigin: `${CX}px ${CY}px`,
              }}
            />
            <line
              x1={CX}
              y1={CY}
              x2={HOUR_X2}
              y2={HOUR_Y2}
              stroke="url(#iris-intro-g)"
              strokeWidth={7}
              strokeLinecap="round"
              style={{
                transform: `rotate(${wind}deg)`,
                transformOrigin: `${CX}px ${CY}px`,
              }}
            />
          </g>

          {/* Center pin pops */}
          <circle
            cx={CX}
            cy={CY}
            r={12 * pin}
            fill="url(#iris-intro-g)"
          />
          <circle cx={CX} cy={CY} r={5 * pin} fill="#0b1220" />
        </svg>

        <div
          style={{
            opacity: wordOpacity,
            transform: `translateY(${wordY}px)`,
            marginTop: 18,
            fontSize: 132,
            fontWeight: 800,
            letterSpacing: -5,
            color: "white",
            lineHeight: 1,
          }}
        >
          Iris
        </div>
        <div
          style={{
            opacity: tagOpacity,
            transform: `translateY(${tagY}px)`,
            marginTop: 22,
            fontSize: 34,
            fontWeight: 400,
            color: "#94a3b8",
            letterSpacing: 0.5,
          }}
        >
          Your clients. Cared for.
        </div>
      </div>
    </AbsoluteFill>
  );
};
