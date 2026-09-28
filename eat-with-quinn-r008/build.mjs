// Builds the self-contained HTML player and syncs the renderer into the Remotion project.
import fs from 'fs';
const draw = fs.readFileSync(new URL('./src/draw.js', import.meta.url), 'utf8');
const tpl = fs.readFileSync(new URL('./src/player.html', import.meta.url), 'utf8');
fs.writeFileSync(new URL('./eat-with-quinn-r008.html', import.meta.url), tpl.replace('/*__DRAW__*/', () => draw));
fs.writeFileSync(new URL('./remotion/src/draw.js', import.meta.url), draw);
console.log('built eat-with-quinn-r008.html and remotion/src/draw.js');
