import React from "react";
import { Composition } from "remotion";
import { Video, VIDEO_DURATION, VIDEO_FPS, VIDEO_SIZE } from "./Video";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Check"
    component={Video}
    durationInFrames={VIDEO_DURATION}
    fps={VIDEO_FPS}
    width={VIDEO_SIZE.width}
    height={VIDEO_SIZE.height}
  />
);
