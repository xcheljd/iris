import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";

type Props = {
  src: string;
  /** Frames to skip into the capture — see STORY_CUTS in Story.tsx. */
  trimBefore: number;
  /**
   * Ken Burns end scale. Only scene 8 uses it: everywhere else the camera is
   * locked, because the product is the thing that moves.
   */
  zoomScale?: number;
  zoomTo?: string;
  /**
   * Frames over which the push completes. Defaults to the whole scene; set it
   * shorter so the camera settles and the scene can end on real stillness.
   */
  zoomFrames?: number;
  children?: React.ReactNode;
};

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Full-bleed player for a captured clip. Deliberately not the inset,
 * drop-shadowed card the `Demo` composition uses: this cut wants the viewer
 * inside the product, and 1:1 pixels keep the table text readable.
 */
export const Shot: React.FC<Props> = ({
  src,
  trimBefore,
  zoomScale = 1,
  zoomTo = "center center",
  zoomFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const zoom =
    zoomScale === 1
      ? 1
      : interpolate(frame, [0, zoomFrames ?? durationInFrames], [1, zoomScale], {
          easing: EASE,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      <AbsoluteFill
        style={{
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: zoomTo,
        }}
      >
        <Video
          src={staticFile(src)}
          trimBefore={trimBefore}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      {children}
    </AbsoluteFill>
  );
};
