import { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
// @ts-ignore plain JS renderer shared with the HTML player
import { drawFrame, W, H } from './draw.js';

export const RecipeVideo: React.FC<{ captions: boolean }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawFrame(ctx, frame, { captions });
  }, [frame, captions]);
  return (
    <AbsoluteFill>
      <canvas ref={ref} width={W} height={H} style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
};
