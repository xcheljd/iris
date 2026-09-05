import { Composition } from "remotion";
import { Demo, DEMO_DURATION_FRAMES, FPS, HEIGHT, WIDTH } from "./Demo";
import { Story, STORY_DURATION_FRAMES } from "./Story";

export const Root = () => {
  return (
    <>
      <Composition
        id="Demo"
        component={Demo}
        durationInFrames={DEMO_DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Story"
        component={Story}
        durationInFrames={STORY_DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
