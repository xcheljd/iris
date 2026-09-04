import { AbsoluteFill, interpolate, staticFile, Sequence } from "remotion";
import { Audio, Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { LightLeak } from "@remotion/light-leaks";
import { loadFont } from "@remotion/google-fonts/Inter";
import { ProblemScene } from "./scenes/ProblemScene";
import { Title } from "./scenes/Title";
import { AppScene } from "./scenes/AppScene";
import { Capabilities } from "./scenes/Capabilities";
import { Outro } from "./scenes/Outro";

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
  problem: 216, // VO 6.31s — cold open, stakes
  title: 116, // VO 2.38s — brand intro
  login: 96, // VO 2.40s
  dashboard: 159, // VO 4.49s
  clients: 156, // VO 4.42s — theme-flip moment happens visually inside this scene
  detail: 218, // VO 6.48s
  followups: 100, // VO 2.52s
  promos: 164, // VO 4.68s
  promoMatches: 138, // VO 3.79s
  collections: 167, // VO 4.78s
  catalog: 188, // VO 5.47s
  smartLists: 140, // VO 3.86s
  prospects: 195, // VO 5.71s
  analytics: 198, // VO 5.78s
  settings: 189, // VO 5.50s
  commandPalette: 117, // VO 3.10s
  capabilities: 150, // VO 3.82s — value centerpiece
  outro: 215, // VO 5.57s — close
};

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
            caption="It starts when you clock in"
            zoomTo="center center"
            zoomScale={1.05}
            vo="02-login.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.dashboard}>
          <AppScene
            src="clips/02-dashboard.webm"
            trimBefore={40}
            caption="The floor, at a glance"
            zoomTo="50% 0%"
            zoomScale={1.06}
            vo="03-dashboard.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.clients}>
          <AppScene
            src="clips/03-clients-search.webm"
            trimBefore={60}
            caption="Find anyone. Instantly."
            zoomTo="0% 0%"
            zoomScale={1.05}
            vo="04-clients.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.detail}>
          <AppScene
            src="clips/04-client-detail.webm"
            trimBefore={30}
            caption="The whole relationship, one place"
            zoomTo="center center"
            zoomScale={1.07}
            vo="05-detail.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.followups}>
          <AppScene
            src="clips/05-followups.webm"
            trimBefore={40}
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
            trimBefore={40}
            caption="This week's promos, matched"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="07-promos.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.promoMatches}>
          <AppScene
            src="clips/11-promo-matches.webm"
            trimBefore={24}
            caption="Every promo, every match"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="08-matches.mp3"
          />
        </TransitionSeries.Sequence>
        {xfade()}

        <TransitionSeries.Sequence durationInFrames={D.collections}>
          <AppScene
            src="clips/08-collections.webm"
            trimBefore={40}
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
            trimBefore={50}
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
            trimBefore={40}
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
            trimBefore={40}
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
            trimBefore={60}
            caption="See the whole floor's effort"
            zoomTo="50% 0%"
            zoomScale={1.05}
            vo="13-analytics.mp3"
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
            trimBefore={90}
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
