import React from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { LightLeak } from "@remotion/light-leaks";
import { loadFont } from "@remotion/google-fonts/Inter";
import { Shot } from "./story/Shot";
import { Spotlight } from "./story/Spotlight";
import { ValueLift } from "./story/ValueLift";
import { Connector } from "./story/Connector";
import { NotebookScene } from "./story/NotebookScene";
import { Wordmark } from "./story/Wordmark";
import { StoryOutro } from "./story/StoryOutro";

loadFont();

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// ─────────────────────────────────────────────────────────────────────────────
// "The Line in the Notebook" — one client relationship, start to finish.
//
// On July 6th Lisa Chen said she'd be back for the Solaris. The cut follows
// that one promise until it is a $3,735 sale. Every surface appears because the
// story just raised the question it answers, so the viewer asks for each screen
// before it arrives. Nothing is presented as a feature.
//
// Editing rules, enforced below:
//   · only one thing moves at a time — camera, or UI, or overlay, never two
//   · Ken Burns only on the two static held frames (scenes 8 and 14)
//   · every app scene runs ≥5s and ends on ≥0.8s of stillness
//   · no per-scene captions; on-screen text is the notebook line, the wordmark,
//     the two lifted values and the outro sub-line
//   · 18f crossfades inside an act, hard cuts between acts, one light leak
// ─────────────────────────────────────────────────────────────────────────────

const T = 18; // in-act crossfade
const LEAK = 30;

// Scene lengths in frames. Each value is the concept's scene duration plus 18
// frames where the scene leads into a crossfade, so the *visible* time matches
// the storyboard once TransitionSeries subtracts the overlaps.
const D = {
  notebook: 438, // scenes 1+2 — one continuous take, no cut on the hero line
  poi: 198, // 3  — dossier, POI spotlight
  wordmark: 90, // 4  — "Iris.", then silence
  sheet: 228, // 5  — promo list, cursor travels
  reads: 228, // 6  — connectors: sheet read against the book
  price: 258, // 7  — SOLARIS row, $4,150 → $3,735
  lisa: 180, // 8  — matched clients, her name
  due: 198, // 9  — follow-up due today
  dossier: 288, // 10 — three clauses, three focus rects
  logged: 150, // 11 — one line, logged
  sale: 480, // 12+13 — purchase and the live heat recompute
  floor: 198, // 14 — the whole book, hot first
  managers: 228, // 15 — analytics, then the shift ends
  outro: 240, // 16
};

// 9 crossfades × 18f overlap. The light leak is an additive overlay and does
// not shorten the timeline.
const SEQ_TOTAL = Object.values(D).reduce((a, b) => a + b, 0);
export const STORY_DURATION_FRAMES = SEQ_TOTAL - T * 9; // 3240 = 108.0s

// Frame offsets into each capture. Derived from public/story/marks.json — the
// wall-clock beats the Playwright rig timestamped while shooting — so the cut
// lands on the frame the app actually changed rather than near it.
const CUT = {
  poi: 60, // dossier.mp4, static Interests hold
  dossier: 222, // dossier.mp4, 90f before the Outreach tab switch
  sheet: 15, // promos.mp4, cursor travel starts at scene-frame 30
  reads: 200, // promos.mp4, locked hold
  price: 260, // promos.mp4, locked hold
  lisa: 565, // promos.mp4, first frame of the matched table
  due: 30, // followups.mp4
  logged: 120, // log-email.mp4, dialog filled; Save lands at scene-frame 43
  sale: 54, // log-purchase.mp4, Save at scene-frame 210, badge flips at 220
  floor: 40, // clients.mp4, scroll runs scene-frames 35-135
  managers: 100, // analytics.mp4, theme flip at scene-frame 80
};

// Heat badge measured red at capture frame 274; with CUT.sale = 54 that is
// scene-frame 220. The 45 → 100 lift is pinned to it.
const FLIP = 220;

const xfade = () => (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: T })}
  />
);

/** Scene-local voiceover from public/vo/story/. */
const Vo: React.FC<{ file: string; at: number }> = ({ file, at }) => (
  <Sequence from={at}>
    <Audio src={staticFile(`vo/story/${file}.mp3`)} />
  </Sequence>
);

// ── Music ───────────────────────────────────────────────────────────────────
// Three states: sparse → pulse → resolve, with the bed cut to nothing under the
// sale. Absolute frame positions, matching the sequence starts computed from D.
const ACT2_IN = 690; // scene 5 — the pulse enters on the sheet
const SALE_IN = 2130; // scene 12 — "She came in Thursday", bed drops out
// The pad swells back ~2.5s after the bed cuts, so it is already breathing when
// the badge flips at frame 2350. Holding the silence any longer stops reading as
// a held breath and starts reading as a dropout.
const PAD_IN = 2250;
const ACT5_IN = 2610; // scene 14 — full warm resolve

const ramp = (f: number, pts: number[], vals: number[]) =>
  interpolate(f, pts, vals, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const Story: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#05060a" }}>
      {/* Act I — solo piano, no rhythm. An empty store after closing. */}
      <Sequence from={0} durationInFrames={ACT2_IN + 60}>
        <Audio
          src={staticFile("audio/story/almost-bliss.mp3")}
          volume={(f) => ramp(f, [0, 70, 620, ACT2_IN + 60], [0, 0.26, 0.26, 0])}
        />
      </Sequence>

      {/* Acts II–III — warm pulse, entering on the promo sheet, building a
          little, then cut dead on "She came in Thursday". */}
      <Sequence from={ACT2_IN} durationInFrames={SALE_IN - ACT2_IN}>
        <Audio
          src={staticFile("audio/story/fluidscape.mp3")}
          volume={(f) =>
            ramp(
              f,
              [0, 70, 900, SALE_IN - ACT2_IN - 14, SALE_IN - ACT2_IN],
              [0, 0.20, 0.28, 0.28, 0],
            )
          }
        />
      </Sequence>

      {/* Scene 13 — one sustained pad under the recompute, barely there. */}
      <Sequence from={PAD_IN} durationInFrames={ACT5_IN - PAD_IN + 20}>
        <Audio
          src={staticFile("audio/story/almost-bliss.mp3")}
          trimBefore={1800}
          volume={(f) =>
            ramp(f, [0, 60, ACT5_IN - PAD_IN - 30, ACT5_IN - PAD_IN + 20], [0, 0.15, 0.15, 0])
          }
        />
      </Sequence>

      {/* Act V — full warm resolve, tail decaying past the last frame. */}
      <Sequence from={ACT5_IN} durationInFrames={STORY_DURATION_FRAMES - ACT5_IN}>
        <Audio
          src={staticFile("audio/story/fluidscape.mp3")}
          trimBefore={2400}
          volume={(f) =>
            ramp(
              f,
              [0, 70, 480, STORY_DURATION_FRAMES - ACT5_IN],
              [0, 0.30, 0.30, 0.06],
            )
          }
        />
      </Sequence>

      <TransitionSeries>
        {/* ═══ ACT I — THE PROMISE ═══ */}

        {/* 1+2 · One take: the line types itself, then a hundred more crowd in
            behind it and the page dissolves. No product on screen yet. */}
        <TransitionSeries.Sequence durationInFrames={D.notebook}>
          <NotebookScene crowdFrom={240} dissolveFrom={380} />
          <Vo file="01-promise" at={20} />
          <Vo file="02-job" at={250} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 3 · The same sentence, now structured. The reveal is the mask
            lifting off her product-of-interest row, not a camera move. */}
        <TransitionSeries.Sequence durationInFrames={D.poi}>
          <Shot src="story/dossier.mp4" trimBefore={CUT.poi}>
            <Spotlight rect={{ x: 580, y: 448, w: 1300, h: 44 }} from={10} duration={150} />
          </Shot>
          <Vo file="03-spreadsheet" at={15} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 4 · One word, then silence. Buy the pause. */}
        <TransitionSeries.Sequence durationInFrames={D.wordmark}>
          <Wordmark />
          <Vo file="04-iris" at={12} />
        </TransitionSeries.Sequence>

        {/* ═══ ACT II — THE SHEET (hard cut: page turn) ═══ */}

        {/* 5 · Ten models, one page, no context. The cursor drifting toward
            Matched Clients is the only motion. */}
        <TransitionSeries.Sequence durationInFrames={D.sheet}>
          <Shot src="story/promos.mp4" trimBefore={CUT.sheet} />
          <Vo file="05-sheet" at={12} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 6 · The one mechanic a screenshot cannot explain: the sheet being
            read across into the book. Camera locked, overlay moves. */}
        <TransitionSeries.Sequence durationInFrames={D.reads}>
          <Shot src="story/promos.mp4" trimBefore={CUT.reads}>
            <Connector
              from={30}
              duration={165}
              links={[
                { y: 501, x1: 415, x2: 1782 },
                { y: 540, x1: 415, x2: 1782 },
                { y: 579, x1: 415, x2: 1782 },
              ]}
            />
          </Shot>
          <Vo file="06-reads" at={10} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 7 · Real seed numbers, lifted into keynote type over the dimmed
            table. The "7 clients" badge is on the row itself. */}
        <TransitionSeries.Sequence durationInFrames={D.price}>
          <Shot src="story/promos.mp4" trimBefore={CUT.price}>
            <Spotlight rect={{ x: 296, y: 558, w: 1588, h: 42 }} from={8} duration={235} />
            <ValueLift
              from={45}
              duration={190}
              start={4150}
              to={3735}
              format={(n) => `$${Math.round(n).toLocaleString("en-US")}`}
              strike="$4,150"
              label="Solaris · 7 clients waiting"
              x={960}
              y={694}
              align="center"
              size={130}
              color="#ffffff"
              strikeColor="#94a3b8"
            />
          </Shot>
          <Vo file="07-price" at={10} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 8 · The Act I payoff — a name the viewer already knows, in a
            database. Ken Burns settles early so the beat ends still. */}
        <TransitionSeries.Sequence durationInFrames={D.lisa}>
          <Shot
            src="story/promos.mp4"
            trimBefore={CUT.lisa}
            zoomScale={1.04}
            zoomTo="18% 26%"
            zoomFrames={130}
          />
          <Vo file="08-promise-july" at={25} />
        </TransitionSeries.Sequence>

        {/* ═══ ACT III — THE CALL (hard cut) ═══ */}

        {/* 9 · Due today, and nobody had to remember it. */}
        <TransitionSeries.Sequence durationInFrames={D.due}>
          <Shot src="story/followups.mp4" trimBefore={CUT.due} />
          <Vo file="09-due" at={15} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 10 · Three clauses, three focus rects, one tab switch — and they
            take turns, so only ever one thing is moving. The email-only tag is
            the most persuasive four seconds in the piece. */}
        <TransitionSeries.Sequence durationInFrames={D.dossier}>
          <Shot src="story/dossier.mp4" trimBefore={CUT.dossier}>
            {/* (a) what she wanted */}
            <Spotlight rect={{ x: 580, y: 448, w: 1300, h: 44 }} from={40} duration={46} />
            {/* (b) what we said — the tab switch lands at frame 90, alone */}
            <Spotlight rect={{ x: 585, y: 466, w: 1290, h: 132 }} from={105} duration={58} />
            {/* (c) and that she's email-only */}
            <Spotlight rect={{ x: 276, y: 548, w: 247, h: 96 }} from={168} duration={76} />
          </Shot>
          <Vo file="10-dossier" at={10} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 11 · Deliberately the shortest line in the video: this is what using
            Iris costs. */}
        <TransitionSeries.Sequence durationInFrames={D.logged}>
          <Shot src="story/log-email.mp4" trimBefore={CUT.logged} />
          <Vo file="11-logged" at={62} />
        </TransitionSeries.Sequence>

        {/* ═══ ACT IV — THE SALE (hard cut; music drops out) ═══ */}

        {/* 12+13 · One unbroken take. Purchased / IX1010-01X, save, the page
            revalidates, and the heat badge recomputes Warm 45 → Hot 100 on its
            own. Server-computed, captured live, not bridged in post — which is
            why 12 and 13 are a single sequence with no cut between them. */}
        <TransitionSeries.Sequence durationInFrames={D.sale}>
          <Shot src="story/log-purchase.mp4" trimBefore={CUT.sale}>
            <ValueLift
              from={FLIP}
              duration={175}
              start={45}
              to={100}
              format={(n) => String(Math.round(n))}
              label="Heat"
              // Bottom of the left rail: the only region of this page that is
              // reliably empty after the purchase row lands, and directly under
              // the WARM/HOT pill it is mirroring.
              x={296}
              y={848}
              align="left"
              size={116}
              color="#d97706"
              colorTo="#dc2626"
              strikeColor="#94a3b8"
            />
          </Shot>
          <Vo file="12-thursday" at={15} />
          <Vo file="13-hot" at={235} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={LEAK}>
          <LightLeak seed={4} />
        </TransitionSeries.Overlay>

        {/* ═══ ACT V — THE FLOOR ═══ */}

        {/* 14 · Scale by repeating the thing we just taught. Lisa is now top of
            the book at Hot 100 — the same record, earned on camera. Real
            scroll, so no Ken Burns on top of it. */}
        <TransitionSeries.Sequence durationInFrames={D.floor}>
          <Shot src="story/clients.mp4" trimBefore={CUT.floor} />
          <Vo file="14-floor" at={12} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 15 · The manager's view, then the shift ends and the theme goes
            dark — motivated, so the flip reads as time passing. */}
        <TransitionSeries.Sequence durationInFrames={D.managers}>
          <Shot src="story/analytics.mp4" trimBefore={CUT.managers} />
          <Vo file="15-managers" at={8} />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* 16 · Close. */}
        <TransitionSeries.Sequence durationInFrames={D.outro}>
          <StoryOutro />
          <Vo file="16a-selfhosted" at={20} />
          <Vo file="16b-outro" at={125} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
