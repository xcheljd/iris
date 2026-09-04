import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Capability centerpiece — sells what Iris *does* with motion graphics, not
 * KPI numbers (the demo DB is seed data, so no figures are presented as real).
 * Three pillars animate in: heat-scoring ring, outreach-log cascade, the
 * follow-up bell. Brand palette: gold #dbb45c on navy #0b1220.
 */

const GOLD = "#dbb45c";
const GOLD_DEEP = "#b8862d";
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const useReveal = (frame: number, start: number, len = 22) => {
  const o = interpolate(frame, [start, start + len], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [start, start + len], [34, 0], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity: o, transform: `translateY(${y}px)` };
};

/* ── Pillar 1: heat-scoring ring sweeps to ~78% ── */
const HeatRing: React.FC<{ frame: number; from: number }> = ({ frame, from }) => {
  const sweep = interpolate(frame, [from, from + 40], [0, 0.78], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const r = 86;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={220} height={220} viewBox="0 0 220 220">
      <circle cx={110} cy={110} r={r} stroke="#1e293b" strokeWidth={16} fill="none" />
      <circle
        cx={110}
        cy={110}
        r={r}
        stroke="url(#cap-grad)"
        strokeWidth={16}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - sweep)}
        transform="rotate(-90 110 110)"
      />
      <defs>
        <linearGradient id="cap-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={GOLD} />
          <stop offset="100%" stopColor={GOLD_DEEP} />
        </linearGradient>
      </defs>
      {/* flame glyph */}
      <path
        d="M110 70 C122 88 132 96 132 116 a22 22 0 1 1 -44 0 c0 -12 8 -18 12 -26 c4 8 10 8 10 16 c6 -4 6 -14 -10 -36 Z"
        fill={GOLD}
        opacity={interpolate(frame, [from + 8, from + 26], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
    </svg>
  );
};

/* ── Pillar 2: outreach log entries cascade in with checks ── */
const OutreachLog: React.FC<{ frame: number; from: number }> = ({ frame, from }) => {
  const rows = ["Call", "Text", "Visit", "Email"];
  return (
    <div style={{ width: 200, display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((label, i) => {
        const s = from + i * 9;
        const op = interpolate(frame, [s, s + 16], [0, 1], {
          easing: EASE,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const x = interpolate(frame, [s, s + 16], [-26, 0], {
          easing: EASE,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={label}
            style={{
              opacity: op,
              transform: `translateX(${x}px)`,
              display: "flex",
              alignItems: "center",
              gap: 11,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(219,180,92,0.18)",
              borderRadius: 9,
              padding: "9px 14px",
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24">
              <circle cx={12} cy={12} r={11} fill={GOLD} />
              <path
                d="M7 12.5 L10.5 16 L17 8.5"
                stroke="#0b1220"
                strokeWidth={2.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ color: "#e2e8f0", fontSize: 21, fontWeight: 500 }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/* ── Pillar 3: follow-up bell with pulse + check ── */
const FollowBell: React.FC<{ frame: number; from: number }> = ({ frame, from }) => {
  const pulse = (frame - from) % 40;
  const pulseScale = interpolate(pulse, [0, 40], [0.7, 1.6], {
    extrapolateRight: "clamp",
  });
  const pulseOp = interpolate(pulse, [0, 40], [0.5, 0], {
    extrapolateRight: "clamp",
  });
  const bellIn = interpolate(frame, [from, from + 20], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const swing = Math.sin((frame - from) / 6) * interpolate(
    frame,
    [from + 20, from + 60],
    [0, 7],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <svg width={220} height={220} viewBox="0 0 220 220">
      {frame > from && (
        <circle
          cx={110}
          cy={104}
          r={56 * pulseScale}
          fill="none"
          stroke={GOLD}
          strokeWidth={3}
          opacity={pulseOp}
        />
      )}
      <g
        transform={`rotate(${swing} 110 60)`}
        opacity={bellIn}
        style={{ transformOrigin: "110px 60px" }}
      >
        <path
          d="M110 56 C84 56 78 78 78 104 c0 22 -10 28 -10 36 h84 c0 -8 -10 -14 -10 -36 c0 -26 -6 -48 -32 -48 Z"
          fill="url(#cap-grad)"
        />
        <circle cx={110} cy={150} r={9} fill={GOLD} />
      </g>
      <g
        opacity={interpolate(frame, [from + 30, from + 46], [0, 1], {
          easing: EASE,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      >
        <circle cx={150} cy={150} r={20} fill={GOLD} />
        <path
          d="M142 150 L148 156 L159 144"
          stroke="#0b1220"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

const PILLARS = [
  {
    title: "Heat-scored",
    sub: "Every client, continuously ranked",
    Visual: HeatRing,
  },
  {
    title: "Every touch logged",
    sub: "Calls, texts, visits — on the record",
    Visual: OutreachLog,
  },
  {
    title: "Never slips",
    sub: "The right nudge, at the right time",
    Visual: FollowBell,
  },
];

export const Capabilities: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const kicker = useReveal(frame, 4, 16);
  const headline = useReveal(frame, 12, 22);
  const glow = interpolate(frame, [0, 40], [0, 0.5], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
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
          width: 1500,
          height: 1100,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(219,180,92,${glow * 0.32}) 0%, rgba(11,18,32,0) 60%)`,
          filter: "blur(60px)",
        }}
      />

      <div
        style={{
          ...kicker,
          color: GOLD,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 6,
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        How the floor runs
      </div>
      <div
        style={{
          ...headline,
          color: "white",
          fontSize: 78,
          fontWeight: 800,
          letterSpacing: -2,
          marginBottom: 76,
          textAlign: "center",
        }}
      >
        Nothing slips through the cracks.
      </div>

      <div style={{ display: "flex", gap: 110, alignItems: "flex-start" }}>
        {PILLARS.map(({ title, sub, Visual }, i) => {
          const base = 36 + i * 16;
          const label = useReveal(frame, base + 30, 20);
          return (
            <div
              key={title}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 300,
              }}
            >
              <div
                style={{
                  height: 230,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Visual frame={frame} from={base} />
              </div>
              <div
                style={{
                  ...label,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 34,
                  fontWeight: 700,
                  marginTop: 24,
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </div>
              <div
                style={{
                  ...label,
                  color: "#94a3b8",
                  fontSize: 21,
                  fontWeight: 400,
                  marginTop: 10,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {sub}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
