# Eat With Quinn, R008 (frame by frame)

1080 x 1920, 30 fps, 487 frames (16.23 s), hard loop. 19 shots, hard cuts only, on the exact frames in the brief.

## Files
- `eat-with-quinn-r008.html`: self-contained player (canvas + JS, no libraries). Open it in Chrome.
- `src/draw.js`: the renderer. `drawFrame(ctx, frame, { captions })` is a pure function of the frame number.
- `src/player.html`: player template. Run `node build.mjs` after editing `src/` to rebuild the HTML and sync Remotion.
- `remotion/`: Remotion composition `EatWithQuinnR008` using the same renderer.

## Player controls
Play/pause, frame scrubber, frame counter (frame, seconds, shot, set), step buttons, Captions toggle,
Safe zones overlay (top 250 px, bottom 400 px), Save PNG of the current frame, Export WebM.
Keys: Space, Left/Right (1 frame), Shift+Left/Right (10 frames), Home.

Export WebM records in real time. For a guaranteed frame-exact MP4, render with Remotion:

```
cd remotion
npm install
npm run render          # out/eat-with-quinn-r008.mp4, captions burned in
npm run render:clean    # same video without captions (for your own VO and text)
npm run studio          # preview and scrub in Remotion Studio
```
