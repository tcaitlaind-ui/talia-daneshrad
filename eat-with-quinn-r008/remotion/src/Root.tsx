import { Composition } from 'remotion';
import { RecipeVideo } from './RecipeVideo';
// @ts-ignore plain JS renderer shared with the HTML player
import { W, H, FPS, TOTAL } from './draw.js';

export const RemotionRoot = () => (
  <Composition
    id="EatWithQuinnR008"
    component={RecipeVideo}
    width={W}
    height={H}
    fps={FPS}
    durationInFrames={TOTAL}
    defaultProps={{ captions: true }}
  />
);
