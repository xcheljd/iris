import { AbsoluteFill, interpolate, staticFile, Sequence } from "remotion";
import { Audio, Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { LightLeak } from "@remotion/light-leaks";
import { loadFont } from "@remotion/google-fonts/Inter";
import { ProblemScene } from "./scenes/ProblemScene";
import { Title } from "./scenes/Title";
import { AppScene, type Focus } from "./scenes/AppScene";
import { Capabilities } from "./scenes/Capabilities";
import { Outro } from "./scenes/Outro";
import { Connector } from "./story/Connector";
import { ValueLift } from "./story/ValueLift";

loadFont();

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// In-house tool for luxury watch retail. Arc: the associate's
// reality (cold open) → brand → daily selling tools → sales intelligence
// → team management → power user → why it holds together → close.
//
// Voiceover: Kokoro TTS af_bella @1.12x (public/vo/*.mp3). Each scene's
// duration = VO read + breathing room; the VO mp3 starts ~10 frames after
// the scene opens (let the visual land first), via <Vo> below.
//
// Durations in frames @30fps, timed to the VO reads.
const D = {
  problem: 219, // VO 6.31s — cold open, stakes
  title: 116, // VO 2.38s — brand intro
  login: 147, // VO 2.40s + dwell
  dashboard: 210, // VO 4.49s + slow scroll
  clients: 300, // VO 4.42s — theme-flip moment + dwell on Lisa
  detail: 269, // VO 6.48s + full-dossier scroll
  followups: 151, // VO 2.52s + dwell
  promos: 215, // VO 4.68s — MSRP/Sale now populated
  promoMatches: 189, // VO 3.79s + sort dwell
  collections: 218, // VO 4.78s + scroll
  catalog: 239, // VO 5.47s — clean 15-row catalog
  smartLists: 191, // VO 3.86s + dwell
  prospects: 246, // VO 5.71s + scroll
  analytics: 248, // VO 5.78s + two tabs
  settings: 240, // VO 5.50s + employees tab
  commandPalette: 168, // VO 3.10s + results dwell
  capabilities: 157, // VO 3.82s — value centerpiece
  outro: 221, // VO 5.57s — close
};

// ─── Guidance layer (v6) ───
//
// Rects are in each capture's own 1920×1080 pixel space, measured off extracted
// frames with probe-rect.mjs — never estimated. Windows sit inside stretches
// where the page underneath is verified still (probe-diff.mjs), and start at
// least ~30% into the scene, by which point the eased Ken Burns has settled to
// under half a pixel per frame: one thing moves at a time.
//
// Two spotlights were deliberately dropped rather than faked:
//   · client detail — the capture never leaves the Profile tab inside this
//     scene's window, so there is no products-of-interest entry or timeline row
//     on screen to point at. The tab rail, which names both, gets the mask.
//   · catalog — every MSRP cell in that capture reads "—". A mask over an empty
//     column would sell the opposite of the line it illustrates.
const FOCUS: Record<string, Focus[]> = {
  // Held from f0 to the end; page fits the viewport, so nothing scrolls.
  dashboard: [
    { x: 281, y: 241, w: 1069, h: 396, tIn: 96, tOut: 150 }, // Overdue follow-ups
    { x: 281, y: 650, w: 1070, h: 185, tIn: 152, tOut: 198 }, // Hot leads
  ],
  // f130–f190 is the "Lisa" filtered dwell; f212–f272 the restored full list.
  clients: [
    { x: 280, y: 80, w: 449, h: 37, tIn: 130, tOut: 190 }, // search box
    { x: 1016, y: 186, w: 84, h: 24, tIn: 212, tOut: 272 }, // "Hot 85" heat badge
  ],
  detail: [
    { x: 931, y: 234, w: 958, h: 35, tIn: 168, tOut: 244 }, // Profile…Timeline…Notes rail
  ],
  // The page nudges down 13px at ~f145; each window stays on one side of it.
  promos: [
    { x: 946, y: 462, w: 400, h: 542, tIn: 66, tOut: 140 }, // MSRP / Disc. / Sale Price
    { x: 1371, y: 186, w: 522, h: 110, tIn: 150, tOut: 208 }, // Total Client Savings
  ],
  // Sorted by MSRP at ~f174, which reorders every row — stay clear of it.
  promoMatches: [
    { x: 1755, y: 228, w: 93, h: 614, tIn: 52, tOut: 104 }, // Match column
  ],
  // Overview tab only: the capture switches to Heat Distribution at ~f81.
  analytics: [
    { x: 304, y: 792, w: 1572, h: 46, tIn: 32, tOut: 78 }, // Conversion Rate 33%
  ],
};

// Three matched rows, pill → client name. The one mechanic a still frame can't
// explain: the Match column is a claim *about* the name at the far left.
const MATCH_LINKS = [
  { y: 281, x1: 1752, x2: 424 }, // James Chen — collection
  { y: 437, x1: 1752, x2: 424 }, // Susan Davis — collection
  { y: 593, x1: 1752, x2: 424 }, // Joseph Jones — model
];

const T = 18; // 0.6s cross-fade — VO-paced rhythm
const LEAK = 30; // light-leak overlay length

const SEQ_TOTAL =
  D.problem +
  D.title +
  D.login +
  D.dashboard +
  D.clients +
  D.detail +
  D.followups +
  D.promos +
  D.collections +
  D.settings +
  D.analytics +
  D.prospects +
  D.promoMatches +
  D.catalog +
  D.smartLists +
  D.commandPalette +
  D.capabilities +
  D.outro;

// 14 cross-fades subtract T each; the 3 light-leak overlays are additive
// (hard cut underneath) and do NOT shorten the timeline.
const NUM_TRANSITIONS = 14;
export const DEMO_DURATION_FRAMES = SEQ_TOTAL - T * NUM_TRANSITIONS;

const xfade = () => (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: T })}
  />
);

// Gold light-leak sweep over the big narrative pivots.
const leak = (seed: number) => (
  <TransitionSeries.Overlay durationInFrames={LEAK}>
    <LightLeak seed={seed} />
  </TransitionSeries.Overlay>
);

// Scene-local voiceover is embedded per AppScene (vo prop). Narrative scenes
// (Problem, Title, Capabilities, Outro) can take VO the same way later.

export const Demo: React.FC = () => {
  const audioVolume = (f: number) =>
    interpolate(
      f,
      [0, 30, DEMO_DURATION_FRAMES - 50, DEMO_DURATION_FRAMES],
      [0, 0.30, 0.30, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1220" }}>
      {/* "Deliberate Thought" by Kevin MacLeod (incompetech.com) — CC BY 4.0 */}
      <Audio src={staticFile("audio/deliberate-thought.mp3")} volume={audioVolume} />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={D.problem}>
          <ProblemScene />
          <Sequence from={12}>
            <Audio src={staticFile("vo/00-problem.mp3")} />
          </Sequence>
        </TransitionSeries.Sequence>
        {leak(0)}

        <TransitionSeries.Sequence durationInFrames={D.title}>
          <Title />
          <Sequence from={14}>
            <Audio src={staticFile("vo/01-title.mp3")} />
          </Sequence>
        </TransitionSeries.Sequence>
        {xfade()}

        {/* ─── Daily selling tools ─── */}

        <TransitionSeries.Sequence durationInFrames={D.login}>
          <AppScene
            src="clips/01-login.webm"
            trimBefore={30}
            caption="It starts when you log in"
            zoomTo="center center"
            zoomScale={1.05}
            vo="02-login.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.dashboard}>
          <AppScene
            src="clips/02-dashboard.webm"
            trimBefore={50}
            caption="The floor, at a glance"
            zoomTo="50% 0%"
            zoomScale={1.06}
            vo="03-dashboard.mp3"
            focus={FOCUS.dashboard}
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.clients}>
          <AppScene
            src="clips/03-clients-search.webm"
            trimBefore={30}
            caption="All your active clients, one place"
            zoomTo="0% 0%"
            zoomScale={1.05}
            vo="04-clients.mp3"
            vo2="04b-clients-search.mp3"
            vo2From={95}
            focus={FOCUS.clients}
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.detail}>
          <AppScene
            src="clips/04-client-detail.webm"
            trimBefore={40}
            caption="The whole relationship, one place"
            zoomTo="center center"
            zoomScale={1.07}
            vo="05-detail.mp3"
            focus={FOCUS.detail}
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.followups}>
          <AppScene
            src="clips/05-followups.webm"
            trimBefore={50}
            caption="Never drop the thread"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="06-followups.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* ─── Sales intelligence ─── */}

        <TransitionSeries.Sequence durationInFrames={D.promos}>
          <AppScene
            src="clips/07-promos.webm"
            trimBefore={50}
            caption="This week's promos, matched"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="07-promos.mp3"
            focus={FOCUS.promos}
          >
            {/*
              The one lift in the tour. It magnifies a figure the page is
              showing at that exact frame — the green $3,520 the second mask is
              sitting on — and lands in the scrim just below it.
            */}
            <ValueLift
              from={154}
              duration={56}
              start={0}
              to={3520}
              format={(n) => `$${Math.round(n).toLocaleString("en-US")}`}
              x={1893}
              y={336}
              size={124}
              color="#00c657"
            />
          </AppScene>
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.promoMatches}>
          <AppScene
            src="clips/11-promo-matches.webm"
            trimBefore={30}
            caption="Every promo, every match"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="08-matches.mp3"
            focus={FOCUS.promoMatches}
          >
            <Connector links={MATCH_LINKS} from={108} duration={62} stagger={9} />
          </AppScene>
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.collections}>
          <AppScene
            src="clips/08-collections.webm"
            trimBefore={50}
            caption="Know what's in demand"
            zoomTo="0% 0%"
            zoomScale={1.06}
            vo="09-collections.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.catalog}>
          <AppScene
            src="clips/12-catalog.webm"
            trimBefore={60}
            caption="The full model catalog"
            zoomTo="0% 0%"
            zoomScale={1.06}
            vo="10-catalog.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.smartLists}>
          <AppScene
            src="clips/13-smart-lists.webm"
            trimBefore={50}
            caption="Smart lists, saved filters"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="11-smartlists.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* ─── Pipeline ─── */}

        <TransitionSeries.Sequence durationInFrames={D.prospects}>
          <AppScene
            src="clips/10-prospects.webm"
            trimBefore={50}
            caption="Prospects ready for outreach"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="12-prospects.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        {/* ─── Manager view ─── */}

        <TransitionSeries.Sequence durationInFrames={D.analytics}>
          <AppScene
            src="clips/09-analytics.webm"
            trimBefore={70}
            caption="See the whole floor's effort"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="13-analytics.mp3"
            focus={FOCUS.analytics}
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.settings}>
          <AppScene
            src="clips/06-settings.webm"
            trimBefore={60}
            caption="Run your team"
            zoomTo="center center"
            zoomScale={1.06}
            vo="14-settings.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.commandPalette}>
          <AppScene
            src="clips/14-command-palette.webm"
            trimBefore={110}
            caption="Find anything, from anywhere"
            zoomTo="center center"
            zoomScale={1.05}
            vo="15-palette.mp3"
          />
        </TransitionSeries.Sequence>
        {leak(3)}

        <TransitionSeries.Sequence durationInFrames={D.capabilities}>
          <Capabilities />
          <Sequence from={12}>
            <Audio src={staticFile("vo/16-capabilities.mp3")} />
          </Sequence>
        </TransitionSeries.Sequence>
        {leak(6)}

        <TransitionSeries.Sequence durationInFrames={D.outro}>
          <Outro />
          <Sequence from={14}>
            <Audio src={staticFile("vo/17-outro.mp3")} />
          </Sequence>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
