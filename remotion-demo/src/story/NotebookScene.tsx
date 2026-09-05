import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";

type Props = {
  /** Frame the twelve competing lines begin fading up behind the hero line. */
  crowdFrom: number;
  /** Frame everything, hero line included, begins dissolving. */
  dissolveFrom: number;
};

const MONO = '"DejaVu Sans Mono", "SF Mono", Menlo, Consolas, monospace';
const HERO = "7/6 — Lisa Chen — Solaris — coming back in the fall";

// The other promises in the notebook. Never legible for long enough to read —
// they are texture, not content — but they are real-shaped so the frame doesn't
// look like lorem ipsum if anyone freezes it.
const CROWD = [
  "6/28 — call back re: sizing",
  "7/1 — Margaret, deposit taken",
  "7/2 — check Wayfinder stock",
  "6/19 — anniversary, send note",
  "7/9 — Daniel, wants the steel bracelet",
  "6/30 — no answer, try Tues",
  "7/11 — Susan — repeat buyer — birthday Aug",
  "7/3 — quote sent, chasing",
  "6/24 — trade-in appraisal promised",
  "7/8 — hold the Cambridge until Friday",
  "7/12 — left voicemail, second time",
  "6/21 — asked for photos of the Octa",
];

/**
 * Scenes 1-2, and the only frames in the piece with no product in them.
 *
 * A single handwritten-style line types itself on black; then twelve more crowd
 * in behind it and the whole page dissolves. The problem statement is the
 * image — nobody has to say "spreadsheets are bad", and the viewer meets a
 * person before they meet software.
 */
export const NotebookScene: React.FC<Props> = ({ crowdFrom, dissolveFrom }) => {
  const frame = useCurrentFrame();

  // Type the hero line out at ~18 chars/sec, starting after a beat of black.
  const typed = Math.floor(
    interpolate(frame, [14, 14 + HERO.length * 1.65], [0, HERO.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const done = typed >= HERO.length;
  const caretOn = !done || Math.floor((frame - 14) / 15) % 2 === 0;

  const dissolve = interpolate(frame, [dissolveFrom, dissolveFrom + 46], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#05060a" }}>
      {/* The twelve other promises, illegible and overlapping. */}
      {CROWD.map((line, i) => {
        const delay = crowdFrom + i * 4;
        const up = interpolate(frame, [delay, delay + 26], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={line}
            style={{
              position: "absolute",
              left: 150 + random(`x${i}`) * 620,
              top: 150 + random(`y${i}`) * 800,
              fontFamily: MONO,
              fontSize: 40 + random(`s${i}`) * 16,
              color: "#e2e8f0",
              opacity: up * 0.15 * dissolve,
              transform: `rotate(${(random(`r${i}`) - 0.5) * 2.4}deg)`,
              whiteSpace: "nowrap",
            }}
          >
            {line}
          </div>
        );
      })}

      {/* The one that matters. Off-centre, like a real page. */}
      <div
        style={{
          position: "absolute",
          left: 232,
          top: 470,
          fontFamily: MONO,
          fontSize: 52,
          color: "#f8fafc",
          opacity: dissolve,
          letterSpacing: 0.5,
          whiteSpace: "nowrap",
        }}
      >
        {HERO.slice(0, typed)}
        <span style={{ opacity: caretOn ? 1 : 0, color: "#dbb45c" }}>▌</span>
      </div>
    </AbsoluteFill>
  );
};
