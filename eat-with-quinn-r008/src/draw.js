// Eat With Quinn, R008. Frame-accurate renderer.
// drawFrame(ctx, frame, opts) is a pure function of the frame number, so scrubbing,
// stepping, exporting and Remotion rendering all produce identical pixels.

export const W = 1080, H = 1920, FPS = 30, TOTAL = 487;

export const SHOTS = [
  ['S01', 0, 13, 'A'], ['S02', 14, 31, 'A'], ['S03', 32, 51, 'A'], ['S04', 52, 66, 'A'],
  ['S05', 67, 89, 'A'], ['S06', 90, 101, 'A'], ['S07', 102, 117, 'A'], ['S08', 118, 142, 'A'],
  ['S09', 143, 165, 'A'], ['S10', 166, 184, 'A'], ['S11', 185, 198, 'A'], ['S12', 199, 220, 'B'],
  ['S13', 221, 283, 'B'], ['S14', 284, 299, 'C'], ['S15', 300, 310, 'C'], ['S16', 311, 333, 'C'],
  ['S17', 334, 412, 'C'], ['S18', 413, 451, 'D'], ['S19', 452, 486, 'D'],
].map(([id, a, b, set]) => ({ id, a, b, set }));

export const CAPTIONS = [
  [0.00, 1.73, 'If you spoon some Greek yogurt into a bowl'],
  [1.73, 4.20, 'with a banana, sesame seeds and honey,'],
  [4.30, 7.88, 'it makes a creamy, nutty breakfast bowl in two minutes.'],
  [8.30, 9.88, 'You can jar it the night before'],
  [9.88, 11.92, 'and grab it on your way out,'],
  [12.12, 15.08, "so you're not scrambling for breakfast when mornings get busy."],
  [15.28, 15.82, 'So good.'],
].map(([s, e, text]) => ({ s, e, text }));

export const shotAt = f => SHOTS.find(s => f >= s.a && f <= s.b) || SHOTS[0];
export const captionAt = f => {
  const t = f / FPS;
  return CAPTIONS.find(c => t >= c.s - 1e-9 && t < c.e - 1e-9) || null;
};

/* ---------- math ---------- */
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (f, a, b) => clamp((f - a) / (b - a));
const easeIn = t => t * t * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = t => t * t * (3 - 2 * t);
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => (r() + r() + r() + r() - 2) / 0.577;

/* ---------- canvas plumbing ---------- */
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}
const CACHE = new Map();
function cached(key, w, h, paint) {
  let c = CACHE.get(key);
  if (!c) { c = makeCanvas(w, h); paint(c.getContext('2d'), w, h); CACHE.set(key, c); }
  return c;
}
let FILTER_OK = null;
function hasFilter() {
  if (FILTER_OK === null) {
    try { const c = makeCanvas(2, 2).getContext('2d'); c.filter = 'blur(1px)'; FILTER_OK = c.filter === 'blur(1px)'; }
    catch (e) { FILTER_OK = false; }
  }
  return FILTER_OK;
}
let LAYER = null;
function layerCtx(ctx) {
  if (!LAYER) LAYER = makeCanvas(W, H);
  const l = LAYER.getContext('2d');
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalAlpha = 1; l.filter = 'none'; l.shadowColor = 'transparent';
  l.clearRect(0, 0, W, H);
  l.setTransform(ctx.getTransform());
  return l;
}
// Paint onto a scratch layer, then composite it with one soft shadow falling toward the viewer.
function shadowed(ctx, paint, o = {}) {
  const { blur = 36, dy = 22, dx = 0, alpha = 0.26, rgb = '72,52,36' } = o;
  paint(layerCtx(ctx));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (hasFilter()) {
    if (!SH_A) { SH_A = makeCanvas(W / 4, H / 4); SH_B = makeCanvas(W / 4, H / 4); }
    const a = SH_A.getContext('2d'), b = SH_B.getContext('2d');
    a.globalCompositeOperation = 'source-over'; a.clearRect(0, 0, W / 4, H / 4);
    a.drawImage(LAYER, 0, 0, W / 4, H / 4);
    a.globalCompositeOperation = 'source-in'; a.fillStyle = `rgb(${rgb})`; a.fillRect(0, 0, W / 4, H / 4);
    b.clearRect(0, 0, W / 4, H / 4); b.filter = `blur(${(blur / 8).toFixed(2)}px)`; b.drawImage(SH_A, 0, 0); b.filter = 'none';
    ctx.globalAlpha = alpha; ctx.drawImage(SH_B, dx, dy, W, H); ctx.globalAlpha = 1;
  } else {
    ctx.shadowColor = `rgba(${rgb},${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = dx; ctx.shadowOffsetY = dy;
  }
  ctx.drawImage(LAYER, 0, 0);
  ctx.restore();
}
let SH_A = null, SH_B = null;
// Full-frame cache for layers that stay still within a shot.
const FROZEN = new Map();
function frozen(ctx, key, paint) {
  let cv = FROZEN.get(key);
  if (!cv) {
    if (FROZEN.size >= 10) FROZEN.delete(FROZEN.keys().next().value);
    cv = makeCanvas(W, H); paint(cv.getContext('2d')); FROZEN.set(key, cv);
  }
  ctx.drawImage(cv, 0, 0);
}
// Paint onto the scratch layer and composite it blurred (focus softening).
function blurred(ctx, paint, px) {
  paint(layerCtx(ctx));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (px > 0.2 && hasFilter()) ctx.filter = `blur(${px.toFixed(2)}px)`;
  ctx.drawImage(LAYER, 0, 0);
  ctx.restore();
}

/* ---------- shape helpers ---------- */
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
function rrect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function blob(c, cx, cy, rad, seed, wob = 0.04, n = 90, sy = 1) {
  const r = rng(seed), p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + wob * (0.5 * Math.sin(3 * a + p1) + 0.3 * Math.sin(5 * a + p2) + 0.2 * Math.sin(8 * a + p3));
    const x = cx + Math.cos(a) * rad * k, y = cy + Math.sin(a) * rad * k * sy;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath();
}
function poly(c, pts, style, w, dx = 0, dy = 0) {
  if (pts.length < 2) return;
  c.strokeStyle = style; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i][0] + dx, pts[i][1] + dy) : c.moveTo(pts[i][0] + dx, pts[i][1] + dy);
  c.stroke();
}
function radialSpot(c, x, y, r, rgb, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
}
function speckle(c, w, h, r, n, rgb, a, size) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = `rgba(${rgb},${(a * r()).toFixed(3)})`;
    const s = 0.5 + r() * size;
    c.fillRect(r() * w, r() * h, s, s);
  }
}

/* ---------- surfaces ---------- */
function marbleTex() {
  return cached('marble', 1300, 2900, (c, w, h) => {
    const r = rng(20240);
    c.fillStyle = '#f4f1ec'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h, rad = 160 + r() * 380, k = r();
      radialSpot(c, x, y, rad, k < 0.4 ? '232,225,215' : k < 0.8 ? '226,227,229' : '252,251,248', 0.5);
    }
    const walk = (x, y, a, len, step = 10) => {
      const p = [[x, y]];
      for (let s = 0; s < len; s += step) { a += (r() - 0.5) * 0.26; x += Math.cos(a) * step; y += Math.sin(a) * step; p.push([x, y]); }
      return p;
    };
    const veins = [];
    for (let i = 0; i < 10; i++) {
      const p = walk(-150 + r() * w * 0.7, -300 + r() * h, 0.6 + (r() - 0.5) * 0.5, 900 + r() * 1500);
      veins.push({ p, w: 1.3 + r() * 1.8, a: 0.26 + r() * 0.2 });
      for (let b = 0; b < 3; b++) {
        const q = p[Math.floor(r() * p.length)];
        veins.push({ p: walk(q[0], q[1], 0.6 + (r() - 0.5) * 1.6, 150 + r() * 420, 8), w: 0.6 + r() * 0.8, a: 0.16 + r() * 0.14 });
      }
    }
    for (let i = 0; i < 26; i++) veins.push({ p: walk(r() * w, r() * h, r() * TAU, 120 + r() * 300, 8), w: 0.6, a: 0.1 + r() * 0.1 });
    if (hasFilter()) c.filter = 'blur(8px)';
    for (const v of veins) poly(c, v.p, `rgba(150,148,152,${v.a * 0.4})`, v.w * 10);
    c.filter = 'none';
    for (const v of veins) poly(c, v.p, `rgba(142,140,146,${v.a * 0.55})`, v.w * 2.4);
    for (const v of veins) poly(c, v.p, `rgba(116,114,122,${v.a})`, v.w * 0.8);
    speckle(c, w, h, r, 7000, '120,118,122', 0.07, 1.6);
  });
}
function quartzTex() {
  return cached('quartz', W, H, (c, w, h) => {
    const r = rng(77);
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#eff2f3'); g.addColorStop(1, '#e6eaec');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) radialSpot(c, r() * w, r() * h, 150 + r() * 300, r() < 0.5 ? '248,250,251' : '222,228,231', 0.35);
    speckle(c, w, h, r, 26000, '150,158,166', 0.35, 2.2);
    speckle(c, w, h, r, 9000, '255,255,255', 0.85, 2.2);
    speckle(c, w, h, r, 1600, '104,112,122', 0.4, 1.6);
  });
}
function greyTex() {
  return cached('grey', W, H, (c, w, h) => {
    const r = rng(91);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#dcdcda'); g.addColorStop(1, '#d2d2d0');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) radialSpot(c, r() * w, r() * h, 200 + r() * 300, r() < 0.5 ? '228,228,226' : '200,200,198', 0.3);
    speckle(c, w, h, r, 20000, '150,150,148', 0.25, 1.8);
    speckle(c, w, h, r, 8000, '240,240,238', 0.5, 1.8);
  });
}
// Soft daylight from beyond the top edge: brighter top, faint falloff toward the viewer.
function daylight(c, k = 1) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(255,253,247,${0.24 * k})`);
  g.addColorStop(0.45, 'rgba(255,253,247,0)');
  g.addColorStop(1, `rgba(80,62,44,${0.07 * k})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function lift(c, a, rgb = '255,252,247') { if (a > 0) { c.fillStyle = `rgba(${rgb},${a})`; c.fillRect(0, 0, W, H); } }

/* ---------- food ---------- */
const SPIRAL_TURNS = 4.2;
function spiralPt(u, cx, cy, rad) {
  const th = -u * SPIRAL_TURNS * TAU;
  const rr = rad * 0.9 * (1 - u * 0.93) * (1 + 0.045 * Math.sin(th * 1.7 + 1) + 0.025 * Math.sin(th * 4.3));
  return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * 0.97];
}
function yogurtBed(c, cx, cy, rad, swirl = 1, seed = 3) {
  blob(c, cx, cy, rad, seed, 0.022);
  let g = c.createRadialGradient(cx, cy + rad * 0.3, rad * 0.1, cx, cy, rad * 1.02);
  g.addColorStop(0, '#fefcf7'); g.addColorStop(0.72, '#f8f4eb'); g.addColorStop(1, '#e5ddcd');
  c.fillStyle = g; c.fill();
  c.save(); blob(c, cx, cy, rad, seed, 0.022); c.clip();
  g = c.createLinearGradient(0, cy - rad, 0, cy);
  g.addColorStop(0, 'rgba(120,92,60,.17)'); g.addColorStop(1, 'rgba(120,92,60,0)');
  c.fillStyle = g; c.fillRect(cx - rad, cy - rad, 2 * rad, rad);
  if (swirl > 0) {
    const pts = [], n = Math.floor(320 * swirl);
    for (let i = 0; i <= n; i++) pts.push(spiralPt(i / 320, cx, cy, rad));
    const k = rad / 430;
    for (let i = 0; i < pts.length - 1; i += 24) {
      const seg = pts.slice(i, i + 26), v = 0.6 + 0.5 * Math.abs(Math.sin(i * 0.037 + 0.8));
      poly(c, seg, 'rgba(168,146,114,.15)', 26 * k * v, 0, 6 * k);
      poly(c, seg, 'rgba(196,180,152,.28)', 9 * k * v, 0, 3 * k);
      poly(c, seg, 'rgba(255,255,255,.95)', 5 * k * v, 0, -8 * k * v);
    }
  }
  for (const [ox, oy, rr] of [[-0.38, -0.25, 0.2], [0.3, -0.4, 0.14], [0.08, 0.28, 0.22], [-0.2, 0.5, 0.12], [0.5, 0.15, 0.12]])
    radialSpot(c, cx + ox * rad, cy + oy * rad, rr * rad, '255,255,255', 0.55);
  c.restore();
}
function yogurtMound(c, cx, cy, rad, seed = 9, wob = 0.12, sy = 1) {
  radialSpot(c, cx, cy + rad * 0.28, rad * 1.2, '64,38,16', 0.34);
  blob(c, cx, cy, rad, seed, wob, 90, sy);
  const g = c.createRadialGradient(cx - rad * 0.12, cy - rad * 0.35, rad * 0.05, cx, cy, rad * 1.05);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f8f4ec'); g.addColorStop(1, '#ddd2bf');
  c.fillStyle = g; c.fill();
  c.save(); blob(c, cx, cy, rad, seed, wob, 90, sy); c.clip();
  const r = rng(seed + 1);
  for (let i = 0; i < 6; i++) {
    const a0 = r() * TAU, rr = rad * (0.25 + r() * 0.6), sp = 0.8 + r() * 1.3, pts = [];
    for (let t = 0; t <= 24; t++) { const a = a0 + (sp * t) / 24; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9 * sy]); }
    poly(c, pts, 'rgba(160,138,108,.22)', rad * 0.07, 0, rad * 0.025);
    poly(c, pts, 'rgba(255,255,255,.95)', rad * 0.025, 0, -rad * 0.02);
  }
  radialSpot(c, cx - rad * 0.2, cy - rad * 0.32, rad * 0.35, '255,255,255', 0.75);
  c.restore();
}
function coinSprite() {
  return cached('coin', 100, 100, c => {
    const cx = 50, cy = 50, R = 40;
    c.fillStyle = '#d6bd72'; circle(c, cx, cy + 3, R); c.fill();
    const g = c.createRadialGradient(cx - 8, cy - 10, 3, cx, cy, R);
    g.addColorStop(0, '#fcf6de'); g.addColorStop(0.65, '#f4e8bc'); g.addColorStop(1, '#e8d38e');
    c.fillStyle = g; circle(c, cx, cy, R); c.fill();
    c.strokeStyle = 'rgba(212,180,92,.65)'; c.lineWidth = 3; circle(c, cx, cy, R - 1.5); c.stroke();
    c.strokeStyle = 'rgba(222,200,135,.5)'; c.lineWidth = 2; circle(c, cx, cy, R * 0.52); c.stroke();
    c.strokeStyle = 'rgba(214,190,120,.28)'; c.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); c.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30); c.stroke(); }
    for (let k = 0; k < 3; k++) { const a = (k * TAU) / 3 - Math.PI / 2; c.fillStyle = 'rgba(190,160,98,.5)'; ell(c, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 5.5, 2.4, a); c.fill(); }
    c.fillStyle = 'rgba(120,88,48,.6)';
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.3; circle(c, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 1.5); c.fill(); }
  });
}
function coin(c, x, y, s = 1, rot = 0, alpha = 1) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); c.globalAlpha *= alpha;
  radialSpot(c, 0, 9, 50, '92,70,40', 0.3);
  c.drawImage(coinSprite(), -50, -50);
  c.restore();
}
function sesame(c, x, y, a, s = 1) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
  c.fillStyle = 'rgba(110,72,26,.28)'; ell(c, 0.8, 1.8, 6.4, 3.6); c.fill();
  c.fillStyle = '#d7a34f';
  c.beginPath(); c.moveTo(-6, 0); c.quadraticCurveTo(-5, -3.5, 1, -3.3); c.quadraticCurveTo(6.6, -1.3, 6.6, 0);
  c.quadraticCurveTo(6.6, 1.3, 1, 3.3); c.quadraticCurveTo(-5, 3.5, -6, 0); c.fill();
  c.fillStyle = 'rgba(150,98,34,.55)'; ell(c, 1, 1.6, 4.5, 1.1); c.fill();
  c.fillStyle = 'rgba(255,232,172,.8)'; ell(c, 0, -1.3, 3.6, 1); c.fill();
  c.restore();
}
function honey(c, pts, w = 10) {
  if (pts.length < 2) return;
  poly(c, pts, 'rgba(140,80,10,.22)', w + 5, 0, w * 0.35);
  poly(c, pts, 'rgba(206,134,22,.92)', w);
  poly(c, pts, 'rgba(244,188,72,.9)', w * 0.55, 0, -w * 0.05);
  poly(c, pts, 'rgba(255,250,226,.9)', Math.max(1.4, w * 0.17), -w * 0.1, -w * 0.22);
}
function cinnamonDot(c, x, y, s, a = 0.55) { c.fillStyle = `rgba(136,78,40,${a})`; c.fillRect(x - s / 2, y - s / 2, s, s * 0.8); }

/* ---------- props ---------- */
function woodBowl(R) {
  return cached('wood' + R, 2 * R + 8, 2 * R + 8, c => {
    const cx = R + 4, cy = R + 4, ri = R * 0.87, r = rng(5);
    let g = c.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#cd9866'); g.addColorStop(1, '#a86e3d');
    c.fillStyle = g; circle(c, cx, cy, R); c.fill();
    g = c.createLinearGradient(0, cy - ri, 0, cy + ri);
    g.addColorStop(0, '#83502c'); g.addColorStop(0.4, '#aa713f'); g.addColorStop(1, '#c9925e');
    c.fillStyle = g; circle(c, cx, cy, ri); c.fill();
    c.save(); circle(c, cx, cy, R); c.clip();
    if (hasFilter()) c.filter = 'blur(6px)';
    for (let i = 0; i < 7; i++) {
      const y0 = cy - R + r() * 2 * R, pts = [];
      for (let x = cx - R; x <= cx + R; x += 10) pts.push([x, y0 + 30 * Math.sin((x - cx) / R * 2 + i) + (y0 - cy) * 0.2 * (1 - ((x - cx) / R) ** 2)]);
      poly(c, pts, `rgba(70,34,12,${0.1 + r() * 0.12})`, 20 + r() * 30);
    }
    c.filter = 'none';
    for (let i = 0; i < 95; i++) {
      const y0 = cy - R * 1.05 + (i / 95) * 2.1 * R + (r() - 0.5) * 12;
      const amp = 5 + r() * 20, k = (1.5 + r() * 2.5) / R, ph = r() * TAU, dark = r() < 0.6, pts = [];
      for (let x = cx - R; x <= cx + R; x += 6) {
        const d = (x - cx) / R;
        pts.push([x, y0 + amp * Math.sin((x - cx) * k + ph) + (y0 - cy) * 0.2 * (1 - d * d)]);
      }
      poly(c, pts, dark ? `rgba(74,38,14,${0.05 + r() * 0.17})` : `rgba(255,214,158,${0.05 + r() * 0.14})`, 1 + r() * (dark ? 8 : 5));
    }
    c.restore();
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.arc(cx, cy, ri, 0, TAU, true); c.clip();
    g = c.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, 'rgba(255,236,205,.34)'); g.addColorStop(0.5, 'rgba(255,236,205,.06)'); g.addColorStop(1, 'rgba(60,30,10,.12)');
    c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    c.restore();
    c.save(); circle(c, cx, cy, ri); c.clip();
    g = c.createLinearGradient(0, cy - ri, 0, cy + ri * 0.2);
    g.addColorStop(0, 'rgba(45,22,6,.42)'); g.addColorStop(1, 'rgba(45,22,6,0)');
    c.fillStyle = g; c.fillRect(cx - ri, cy - ri, 2 * ri, 2 * ri);
    radialSpot(c, cx, cy + ri * 0.35, ri * 0.8, '255,215,165', 0.22);
    c.restore();
    c.lineWidth = 3; c.strokeStyle = 'rgba(60,30,10,.35)'; circle(c, cx, cy, ri); c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,230,190,.35)'; circle(c, cx, cy, ri + 4); c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(70,40,15,.3)'; circle(c, cx, cy, R - 1); c.stroke();
  });
}
function drawWoodBowl(c, x, y, R) {
  const s = woodBowl(R);
  shadowed(c, l => l.drawImage(s, x - R - 4, y - R - 4), { blur: 60, dy: 34, alpha: 0.3 });
}
function whiteBowl(R) {
  return cached('wb' + R, 2 * R + 8, 2 * R + 8, c => {
    const cx = R + 4, cy = R + 4, ri = R * 0.86;
    let g = c.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ecebe8');
    c.fillStyle = g; circle(c, cx, cy, R); c.fill();
    g = c.createLinearGradient(0, cy - ri, 0, cy + ri);
    g.addColorStop(0, '#dcdbd8'); g.addColorStop(0.45, '#efeeeb'); g.addColorStop(1, '#fbfbfa');
    c.fillStyle = g; circle(c, cx, cy, ri); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(150,148,142,.45)'; circle(c, cx, cy, ri); c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(150,148,142,.35)'; circle(c, cx, cy, R - 1); c.stroke();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(cx, cy, (R + ri) / 2, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  });
}
function scallopDish(R) {
  return cached('sd' + R, 2 * R + 20, 2 * R + 20, c => {
    const cx = R + 10, cy = R + 10;
    const path = (rad, amp) => {
      c.beginPath();
      for (let i = 0; i <= 240; i++) {
        const a = (i / 240) * TAU, rr = rad * (1 - amp + amp * Math.abs(Math.cos(a * 6)));
        i ? c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      c.closePath();
    };
    let g = c.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ebeae7');
    path(R, 0.07); c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(150,148,142,.4)'; c.stroke();
    g = c.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#dddcd9'); g.addColorStop(0.5, '#f2f1ee'); g.addColorStop(1, '#fcfcfb');
    circle(c, cx, cy, R * 0.74); c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(150,148,142,.4)'; c.stroke();
  });
}
function spoon(c, x, y, ang, s = 1, load = null) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  let g = c.createLinearGradient(0, -14, 0, 14);
  g.addColorStop(0, '#9da2a8'); g.addColorStop(0.35, '#f2f3f5'); g.addColorStop(0.6, '#d0d3d7'); g.addColorStop(1, '#8e9399');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(50, -8); c.bezierCurveTo(120, -6, 250, -9, 330, -13);
  c.quadraticCurveTo(378, -14, 380, 0); c.quadraticCurveTo(378, 14, 330, 13);
  c.bezierCurveTo(250, 9, 120, 6, 50, 8); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(90,96,104,.35)'; c.lineWidth = 1.5; c.stroke();
  g = c.createRadialGradient(-12, -12, 4, 0, 0, 64);
  g.addColorStop(0, '#fbfcfd'); g.addColorStop(0.5, '#c9cdd2'); g.addColorStop(0.85, '#9fa4aa'); g.addColorStop(1, '#7f858c');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(62, 0);
  c.bezierCurveTo(62, -30, 30, -42, -8, -42); c.bezierCurveTo(-48, -42, -64, -22, -64, 0);
  c.bezierCurveTo(-64, 22, -48, 42, -8, 42); c.bezierCurveTo(30, 42, 62, 30, 62, 0); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(80,86,94,.45)'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.beginPath(); c.ellipse(-4, 0, 50, 32, 0, Math.PI * 1.05, Math.PI * 1.7); c.stroke();
  if (load) load(c);
  c.restore();
}
function knife(c, x, y, ang, s = 1) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  let g = c.createLinearGradient(0, -14, 0, 14);
  g.addColorStop(0, '#f3f4f6'); g.addColorStop(0.5, '#c3c7cc'); g.addColorStop(1, '#8b9096');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(0, -13); c.lineTo(150, -9); c.quadraticCurveTo(186, -3, 176, 5); c.lineTo(0, 13); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(4, -12); c.lineTo(150, -8.5); c.stroke();
  c.fillStyle = '#9ba0a6'; c.fillRect(-8, -14, 9, 28);
  g = c.createLinearGradient(0, -15, 0, 15);
  g.addColorStop(0, '#6b4631'); g.addColorStop(0.4, '#4d3122'); g.addColorStop(1, '#2f1d13');
  c.fillStyle = g; rrect(c, -126, -15, 120, 30, 13); c.fill();
  c.fillStyle = '#c9ccd0'; circle(c, -40, 0, 3.5); c.fill(); circle(c, -90, 0, 3.5); c.fill();
  c.restore();
}

/* ---------- hands ---------- */
const SKIN = { base: '#e9b792', light: '#f6d3b5', shade: '#c78c68', edge: '#b37a58', nail: '#f3d5c8', tip: '#fcf0ea' };
// Back-of-hand view. Local +x points from wrist to fingertips; right hand has thumb at -y.
function hand(c, o) {
  const { x, y, ang = 0, s = 1, left = false, f = [1, 1, 1, 1], curl = [0, 0, 0, 0],
    thumb = 1, thumbAng = 0, thumbCurl = 0.35, arm = 1000, nails = true } = o;
  const spread = o.spread ?? 0.07;
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, left ? -s : s);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const knuck = [[86, -30], [92, -10], [90, 10], [82, 29]], L = [72, 82, 76, 60], Wd = [23, 24, 23, 20];
  const fing = knuck.map((k, i) => {
    const a0 = (i - 1.5) * spread, a1 = a0 + curl[i], l1 = L[i] * 0.52 * f[i], l2 = L[i] * 0.48 * f[i];
    const p1 = [k[0] + Math.cos(a0) * l1, k[1] + Math.sin(a0) * l1];
    const p2 = [p1[0] + Math.cos(a1) * l2, p1[1] + Math.sin(a1) * l2];
    return { k, p1, p2, w: Wd[i], a1, on: f[i] > 0.03 };
  });
  const ta = -0.75 + thumbAng, tb = [20, -30], tl = 64 * thumb;
  const t1 = [tb[0] + Math.cos(ta) * tl * 0.5, tb[1] + Math.sin(ta) * tl * 0.5];
  const ta2 = ta + thumbCurl, t2 = [t1[0] + Math.cos(ta2) * tl * 0.5, t1[1] + Math.sin(ta2) * tl * 0.5];
  const thumbF = { k: tb, p1: t1, p2: t2, w: 25, a1: ta2, on: thumb > 0.03 };
  const armPath = () => { c.beginPath(); c.moveTo(-arm, -52); c.quadraticCurveTo(-arm * 0.4, -47, 0, -38); c.lineTo(0, 38); c.quadraticCurveTo(-arm * 0.4, 47, -arm, 54); c.closePath(); };
  const palmPath = () => { c.beginPath(); c.moveTo(-8, -38); c.bezierCurveTo(30, -46, 70, -46, 92, -38); c.bezierCurveTo(104, -18, 104, 20, 88, 40); c.bezierCurveTo(60, 46, 30, 45, -8, 38); c.closePath(); };
  const fstroke = (p, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(p.k[0], p.k[1]); c.lineTo(p.p1[0], p.p1[1]); c.lineTo(p.p2[0], p.p2[1]); c.stroke(); };
  const all = [...fing, thumbF].filter(p => p.on);
  // silhouette edge
  c.fillStyle = SKIN.edge; c.strokeStyle = SKIN.edge; c.lineWidth = 4;
  armPath(); c.fill(); c.stroke(); palmPath(); c.fill(); c.stroke();
  all.forEach(p => fstroke(p, p.w + 4, SKIN.edge));
  // body fill with rounded shading
  const g = c.createLinearGradient(0, -54, 0, 54);
  g.addColorStop(0, SKIN.shade); g.addColorStop(0.3, SKIN.base); g.addColorStop(0.5, SKIN.light); g.addColorStop(0.72, SKIN.base); g.addColorStop(1, SKIN.shade);
  c.fillStyle = g; armPath(); c.fill(); palmPath(); c.fill();
  all.forEach(p => fstroke(p, p.w, SKIN.base));
  all.forEach(p => fstroke(p, p.w * 0.42, 'rgba(250,220,196,.55)'));
  // knuckles and joint creases
  fing.forEach(p => { if (!p.on) return; radialSpot(c, p.k[0] + 2, p.k[1], 12, '255,232,212', 0.45); });
  c.strokeStyle = 'rgba(150,92,62,.28)'; c.lineWidth = 1.6;
  all.forEach(p => {
    const nx = -Math.sin(p.a1), ny = Math.cos(p.a1), h = p.w * 0.28;
    c.beginPath(); c.moveTo(p.p1[0] - nx * h, p.p1[1] - ny * h); c.lineTo(p.p1[0] + nx * h, p.p1[1] + ny * h); c.stroke();
  });
  if (nails) all.forEach(p => {
    const len = Math.hypot(p.p2[0] - p.p1[0], p.p2[1] - p.p1[1]);
    if (len < 18) return;
    const dx = Math.cos(p.a1), dy = Math.sin(p.a1), nx = p.p2[0] - dx * 7, ny = p.p2[1] - dy * 7;
    c.fillStyle = SKIN.nail; ell(c, nx, ny, 8.5, p.w * 0.34, p.a1); c.fill();
    c.fillStyle = SKIN.tip; ell(c, nx + dx * 5, ny + dy * 5, 3, p.w * 0.3, p.a1); c.fill();
    c.strokeStyle = 'rgba(190,130,110,.35)'; c.lineWidth = 1; ell(c, nx, ny, 8.5, p.w * 0.34, p.a1); c.stroke();
  });
  c.restore();
}
// Place a hand so the middle fingertip lands on (tx, ty).
function handAt(c, tx, ty, ang, s, o = {}) {
  const f = o.f || [1, 1, 1, 1], curl = o.curl || [0, 0, 0, 0], sp = o.spread ?? 0.07;
  const a0 = -0.5 * sp, a1 = a0 + curl[1];
  const lx = 92 + Math.cos(a0) * 82 * 0.52 * f[1] + Math.cos(a1) * 82 * 0.48 * f[1];
  const ly0 = -10 + Math.sin(a0) * 82 * 0.52 * f[1] + Math.sin(a1) * 82 * 0.48 * f[1];
  const ly = o.left ? -ly0 : ly0;
  const wx = tx - (Math.cos(ang) * lx - Math.sin(ang) * ly) * s;
  const wy = ty - (Math.sin(ang) * lx + Math.cos(ang) * ly) * s;
  hand(c, { ...o, x: wx, y: wy, ang, s });
}
function handShadow(c, fn, a = 0.24) { shadowed(c, fn, { blur: 44, dy: 30, alpha: a }); }

/* ---------- Set A geometry ---------- */
const BOWL = { x: 540, y: 980, R: 525 };
const RI = BOWL.R * 0.87, YR = RI * 0.95;
const COIN_S = 1.5;
const ARC = { x: 540, y: 1250, r: 330, n: 9 };
const arcPos = i => { const a = lerp(-152, -28, i / (ARC.n - 1)) * D2R; return [ARC.x + Math.cos(a) * ARC.r, ARC.y + Math.sin(a) * ARC.r]; };
const arcY = x => ARC.y - Math.sqrt(Math.max(0, ARC.r * ARC.r - (x - ARC.x) ** 2));
const MOUND = [560, 1120];
const SPOON_REST = { x: 880, y: 860, ang: -0.52, s: 2 };
const PILE = (() => { const r = rng(31), a = []; for (let i = 0; i < 180; i++) { const sd = i < 140 ? 30 : 62; a.push([gauss(r) * sd, gauss(r) * sd * 0.9, r() * TAU]); } return a; })();
function seedPile(c, n, x = MOUND[0], y = MOUND[1], s = 1.1) {
  n = Math.floor(n);
  if (n <= 0) return;
  const k = n / PILE.length;
  radialSpot(c, x, y + 10, 80, '170,110,40', 0.28 * k);
  radialSpot(c, x, y, 50, '214,160,80', 0.5 * k);
  for (let i = 0; i < n; i++) sesame(c, x + PILE[i][0], y + PILE[i][1], PILE[i][2], s);
}
function honeyP(u) {
  const [mx, my] = MOUND;
  if (u < 0.22) { const v = u / 0.22, th = v * 2.3 * TAU, rr = 6 + 46 * v; return [mx + Math.cos(th) * rr, my + Math.sin(th) * rr * 0.85]; }
  const v = (u - 0.22) / 0.78;
  const end = [mx + 52 * Math.cos(2.3 * TAU), my + 52 * 0.85 * Math.sin(2.3 * TAU)];
  if (v < 0.14) { const w = smooth(v / 0.14); return [lerp(end[0], 250, w), lerp(end[1], arcY(250) + 40, w)]; }
  const w = (v - 0.14) / 0.86, x = lerp(250, 850, w);
  return [x, arcY(x) + 40 + 48 * Math.sin(w * TAU * 3.2) + 8 * Math.sin(w * TAU * 7)];
}
const HONEY_LIFT = [0.22, 0.22 + 0.78 * 0.14];
function honeyLines(u) {
  const a = [], b = [], N = Math.floor(u * 420);
  for (let i = 0; i <= N; i++) { const t = i / 420; if (t <= HONEY_LIFT[0]) a.push(honeyP(t)); else if (t >= HONEY_LIFT[1]) b.push(honeyP(t)); }
  return [a, b];
}
function stirPt(u) {
  const th = -Math.PI / 2 + u * 1.8 * TAU, rr = lerp(1, 0.45, u);
  return [760 + Math.cos(th) * 175 * rr, 990 + Math.sin(th) * 300 * rr];
}
const MIXR = (() => { const r = rng(55), streaks = [], seeds = [];
  for (let i = 0; i < 16; i++) streaks.push({ cx: 740 + (r() - 0.5) * 120, cy: 990 + (r() - 0.5) * 200, rr: 50 + r() * 260, a0: r() * TAU, len: 0.6 + r() * 1.5, w: 6 + r() * 14, hon: r() < 0.6 });
  for (let i = 0; i < 120; i++) { const a = -Math.PI / 2 + r() * Math.PI, d = Math.sqrt(r()) * (YR - 20); seeds.push([BOWL.x + 30 + Math.cos(a) * d, BOWL.y + Math.sin(a) * d, r() * TAU]); }
  return { streaks, seeds };
})();
let MIXC = null, MASKC = null;
function mixLayer(c, m) {
  if (m <= 0) return;
  if (!MIXC) { MIXC = makeCanvas(W, H); MASKC = makeCanvas(W, H); }
  const T = c.getTransform();
  const k = MIXC.getContext('2d'), mk = MASKC.getContext('2d');
  for (const x of [k, mk]) { x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H); x.setTransform(T); }
  // mask: union of brush circles along the stir path, feathered
  if (hasFilter()) mk.filter = 'blur(16px)';
  mk.fillStyle = '#000'; mk.beginPath();
  const n = Math.max(1, Math.floor(m * 140));
  for (let i = 0; i <= n; i++) { const [x, y] = stirPt((i / 140) * Math.min(1, m)); mk.moveTo(x + 140, y); mk.arc(x, y, 140, 0, TAU); }
  mk.fill(); mk.filter = 'none';
  // marbled yogurt with honey and sesame folded through
  k.save(); blob(k, BOWL.x, BOWL.y, YR, 3, 0.022); k.clip();
  let g = k.createRadialGradient(760, 1000, 20, 760, 1000, 420);
  g.addColorStop(0, '#fbf5e8'); g.addColorStop(1, '#f1e4c8');
  k.fillStyle = g; k.fillRect(300, 500, 780, 960);
  g = k.createLinearGradient(0, BOWL.y - YR, 0, BOWL.y);
  g.addColorStop(0, 'rgba(120,92,60,.16)'); g.addColorStop(1, 'rgba(120,92,60,0)');
  k.fillStyle = g; k.fillRect(300, BOWL.y - YR, 780, YR);
  for (const st of MIXR.streaks) {
    const pts = [];
    for (let t = 0; t <= 30; t++) { const a = st.a0 + (st.len * t) / 30; pts.push([st.cx + Math.cos(a) * st.rr, st.cy + Math.sin(a) * st.rr * 1.3]); }
    if (st.hon) { poly(k, pts, 'rgba(212,142,36,.5)', st.w); poly(k, pts, 'rgba(240,184,70,.55)', st.w * 0.5); poly(k, pts, 'rgba(255,248,222,.8)', 2, 0, -st.w * 0.3); }
    else { poly(k, pts, 'rgba(170,146,110,.2)', st.w, 0, 4); poly(k, pts, 'rgba(255,255,255,.95)', 3, 0, -4); }
  }
  for (const [x, y, a] of MIXR.seeds) sesame(k, x, y, a, 1.05);
  coin(k, 690, 890, COIN_S, 0.5); coin(k, 830, 1080, COIN_S * 0.95, 1.2);
  blob(k, 840, 1112, 58, 12, 0.2); k.fillStyle = 'rgba(250,244,232,.92)'; k.fill();
  radialSpot(k, 720, 860, 90, '255,255,255', 0.5);
  k.restore();
  k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'destination-in'; k.drawImage(MASKC, 0, 0); k.globalCompositeOperation = 'source-over';
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(MIXC, 0, 0); c.restore();
}
const CIN = (() => { const r = rng(88), a = []; for (let i = 0; i < 260; i++) a.push({ x: 600 + gauss(r) * 150, y: 950 + gauss(r) * 170, t: 168 + r() * 14, s: 1.6 + r() * 2.2 }); return a; })();
const PINCH = [800, 690];
function cinnamon(c, f) {
  for (const p of CIN) {
    if (f < p.t) continue;
    const k = clamp((f - p.t) / 5);
    if (k < 1) {
      const e = easeIn(k);
      cinnamonDot(c, lerp(PINCH[0], p.x, e), lerp(PINCH[1], p.y, e), p.s * lerp(2.2, 1, e), 0.45);
    } else cinnamonDot(c, p.x, p.y, p.s);
  }
}
// Full bowl contents for Set A (canonical coordinates).
function contentsA(c, st) {
  yogurtBed(c, BOWL.x, BOWL.y, YR, st.swirl ?? 1);
  if (st.arc) for (let i = 0; i < ARC.n; i++) { const [x, y] = arcPos(i); coin(c, x, y, COIN_S, i * 1.7); }
  if (st.seeds) seedPile(c, st.seeds);
  if (st.honey) for (const line of honeyLines(st.honey)) honey(c, line, 11);
  if (st.mix) mixLayer(c, st.mix);
  if (st.cin !== undefined) cinnamon(c, st.cin);
}
// Background, bowl, contents and resting spoon for a static bowl state.
function baseA(c, key, st, spoonRest = true) {
  frozen(c, 'A:' + key, k => { setABg(k); drawWoodBowl(k, BOWL.x, BOWL.y, BOWL.R); contentsA(k, st); if (spoonRest) restSpoon(k); });
}
function setABg(c, dx = 0, dy = 0) { c.drawImage(marbleTex(), -110 + dx, -490 + dy); }
function restSpoon(c) { shadowed(c, l => spoon(l, SPOON_REST.x, SPOON_REST.y, SPOON_REST.ang, SPOON_REST.s), { blur: 16, dy: 10, alpha: 0.3 }); }
// Left fingertips steadying the bowl at its bottom-left rim.
function leftRimFingers(c, f, dx = 0, dy = 0) {
  const w = Math.sin(f * 0.45) * 4;
  handShadow(c, l => handAt(l, 190 + dx + w, 1400 + dy, -0.95, 3, { left: true, f: [0.7, 0.75, 0.7, 0.6], curl: [0.15, 0.15, 0.2, 0.25], spread: 0.16, thumb: 0.8, thumbAng: 0.2 }));
}

/* ---------- Set A shots ---------- */
function whiteCup(c, x, y, s, tilt, ang) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  const r = 150, L = 30 + 140 * tilt, rx = r * (1 - 0.55 * tilt);
  // handle
  let g = c.createLinearGradient(0, -24, 0, 24);
  g.addColorStop(0, '#e2e1dd'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#d8d6d1');
  c.fillStyle = g; rrect(c, -L - 250, -24, 260, 48, 22); c.fill();
  // body
  g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#dedcd7'); g.addColorStop(0.35, '#fbfbf9'); g.addColorStop(1, '#d4d1ca');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(0, -r); c.lineTo(-L, -r * 0.94); c.ellipse(-L, 0, r * 0.35 * tilt + 4, r * 0.94, 0, -Math.PI / 2, Math.PI / 2, true); c.lineTo(0, r); c.closePath(); c.fill();
  // opening
  c.fillStyle = '#f1efea'; ell(c, 0, 0, rx, r); c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = 10; ell(c, 0, 0, rx - 3, r - 3); c.stroke();
  c.strokeStyle = 'rgba(150,146,138,.4)'; c.lineWidth = 2; ell(c, 0, 0, rx + 2, r + 2); c.stroke();
  c.restore();
}
function S01(c, f) {
  setABg(c);
  const bx = 500, by = 1010;
  drawWoodBowl(c, bx, by, 540);
  // dollop: attached at the lip, falls away from lens (shrinks), then splats and settles
  const lip = [660, 930];
  if (f < 4) {
    const k = f / 4;
    yogurtMound(c, lerp(lip[0], 600, k), lerp(lip[1], 980, k), lerp(150, 118, k), 21, 0.18, lerp(0.8, 0.95, k));
  } else {
    const k = easeOut(clamp((f - 4) / 5));
    yogurtMound(c, 598, 985 + 6 * k, lerp(120, 190, k), 21, lerp(0.2, 0.13, k), lerp(0.85, 1, k));
  }
  // cup held from underneath by the right hand, lowering and becoming more upright
  const k = easeOut(prog(f, 0, 7));
  const cx = lerp(820, 870, k), cy = lerp(880, 850, k), cs = lerp(1.05, 0.9, k), tilt = lerp(1, 0.35, k);
  handShadow(c, l => {
    handAt(l, cx - 60, cy - 170 * cs, -2.2, 3 * cs, { f: [0.9, 1, 0.95, 0.85], curl: [-0.2, -0.2, -0.2, -0.2], spread: 0.14, thumb: 0.9, thumbAng: -0.3 });
    whiteCup(l, cx, cy, cs, tilt, Math.PI - 0.15);
    if (f < 4) yogurtMound(l, cx - 140 * cs * (1 - 0.55 * tilt) + 40, cy - 10, 105 * cs, 22, 0.16);
    else yogurtMound(l, cx - 20, cy, 80 * cs, 23, 0.2);
  }, 0.26);
  daylight(c);
}
function spoonWithHand(c, sx, sy, ang, s, hs = 3, o = {}) {
  handShadow(c, l => {
    spoon(l, sx, sy, ang, s);
    const hx = sx + Math.cos(ang) * 320 * s, hy = sy + Math.sin(ang) * 320 * s;
    hand(l, { x: hx + Math.cos(ang) * 150 * hs * 0.5, y: hy + Math.sin(ang) * 150 * hs * 0.5, ang: ang + Math.PI, s: hs, f: [0.45, 0.5, 0.45, 0.4], curl: [0.9, 0.9, 1, 1.1], spread: 0.05, thumb: 0.9, thumbAng: 0.55, ...o });
  });
}
function S02(c, f, l) {
  setABg(c);
  drawWoodBowl(c, BOWL.x, BOWL.y, BOWL.R);
  const press = easeInOut(prog(l, 6, 17));
  yogurtMound(c, 560 - 20 * press, 985, lerp(230, 290, press), 31, lerp(0.16, 0.1, press), lerp(1, 0.96, press));
  const k = easeOut(prog(l, 0, 6));
  const sx = lerp(1180, 730, k) - 90 * press, sy = 975 + 10 * press;
  spoonWithHand(c, sx, sy, -0.12, 2 * (1 - 0.05 * press));
  handShadow(c, l2 => handAt(l2, 900 + Math.sin(f * 0.5) * 5, 1440, -1.75, 3, { left: true, f: [0.8, 0.85, 0.8, 0.7], curl: [0.2, 0.2, 0.2, 0.2], spread: 0.16, thumb: 0.6 }));
  daylight(c);
}
function S03(c, f, l) {
  setABg(c);
  drawWoodBowl(c, BOWL.x, BOWL.y, BOWL.R);
  const u = lerp(0.12, 1, easeInOut(prog(l, 0, 19)));
  yogurtBed(c, BOWL.x, BOWL.y, YR, u);
  const [sx, sy] = spiralPt(u, BOWL.x, BOWL.y, YR);
  const ang = Math.atan2(1000 - sy, 1500 - sx);
  spoonWithHand(c, sx, sy, ang, 2);
  daylight(c);
}
function bananaShape(u, len, W0) { // centerline and half-width along the banana, local coords
  const x = (u - 0.5) * len, y = -0.16 * len * (1 - (2 * u - 1) ** 2);
  const w = W0 * 0.5 * Math.max(0.22, Math.pow(Math.sin(Math.PI * clamp(u, 0.001, 0.999)), 0.4));
  return { x, y, w };
}
function bananaEdges(u0, u1, len, W0) {
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) {
    const u = lerp(u0, u1, i / 40), p = bananaShape(u, len, W0), q = bananaShape(u + 0.001, len, W0);
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d;
    top.push([p.x - nx * p.w, p.y - ny * p.w]); bot.push([p.x + nx * p.w, p.y + ny * p.w]);
  }
  return { top, bot };
}
function fillEdges(c, e) { c.beginPath(); e.top.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); for (let i = e.bot.length - 1; i >= 0; i--) c.lineTo(e.bot[i][0], e.bot[i][1]); c.closePath(); }
function banana(c, x, y, ang, s, peel) { // peel: 0 unpeeled, 1 fully peeled from the stem end (u=1)
  const len = 900, W0 = 175, pl = lerp(0.97, 0.3, peel);
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  // peeled flesh
  let e = bananaEdges(pl, 0.985, len, W0 * 0.9);
  let g = c.createLinearGradient(0, -120, 0, 60);
  g.addColorStop(0, '#fbf3d2'); g.addColorStop(0.6, '#f3e5b3'); g.addColorStop(1, '#e3cf8e');
  fillEdges(c, e); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(200,170,100,.4)'; c.lineWidth = 2; c.stroke();
  for (let k = -1; k <= 1; k++) { const pts = []; for (let i = 0; i <= 20; i++) { const p = bananaShape(lerp(pl, 0.98, i / 20), len, W0 * 0.9); pts.push([p.x, p.y + k * p.w * 0.45]); } poly(c, pts, 'rgba(220,196,140,.35)', 2); }
  // unpeeled skin
  e = bananaEdges(0.015, pl, len, W0);
  g = c.createLinearGradient(0, -170, 0, 90);
  g.addColorStop(0, '#fbe27a'); g.addColorStop(0.45, '#f4cf3c'); g.addColorStop(1, '#d9a91f');
  fillEdges(c, e); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(160,120,20,.55)'; c.lineWidth = 2.5; c.stroke();
  for (let k = -1; k <= 1; k += 2) { const pts = []; for (let i = 0; i <= 20; i++) { const p = bananaShape(lerp(0.03, pl, i / 20), len, W0); pts.push([p.x, p.y + k * p.w * 0.35]); } poly(c, pts, 'rgba(190,140,20,.35)', 3); }
  const tip = bananaShape(0.012, len, W0); c.fillStyle = '#4a3a24'; ell(c, tip.x - 8, tip.y, 16, 12); c.fill();
  // peel strips flopped outward from the peel line
  if (peel > 0.02) {
    const L0 = (1 - pl) * len * 0.95, p = bananaShape(pl, len, W0);
    const strip = (side, dirAng, stem) => {
      const bx = p.x, by = p.y + side * p.w * 0.9, w0 = p.w * 0.9;
      const ex = bx + Math.cos(dirAng) * L0, ey = by + Math.sin(dirAng) * L0;
      const nx = -Math.sin(dirAng), ny = Math.cos(dirAng);
      c.beginPath(); c.moveTo(bx - side * 0, by - side * w0 * 0.2);
      c.quadraticCurveTo(bx + (ex - bx) * 0.5 + nx * w0 * 0.6, by + (ey - by) * 0.5 + ny * w0 * 0.6, ex + nx * w0 * 0.22, ey + ny * w0 * 0.22);
      c.lineTo(ex - nx * w0 * 0.22, ey - ny * w0 * 0.22);
      c.quadraticCurveTo(bx + (ex - bx) * 0.5 - nx * w0 * 0.5, by + (ey - by) * 0.5 - ny * w0 * 0.5, bx - side * p.w * 1.6, by + side * w0 * 0.1);
      c.closePath();
      c.fillStyle = '#f6eab9'; c.fill(); c.strokeStyle = '#e2b52c'; c.lineWidth = 7; c.stroke();
      if (stem) { c.fillStyle = '#6d5a2c'; ell(c, ex, ey, 20, 14, dirAng); c.fill(); }
      return [ex, ey];
    };
    strip(-1, -0.55, false);
    const end = strip(1, 0.75, true);
    c.restore();
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return [x + (end[0] * ca - end[1] * sa) * s, y + (end[0] * sa + end[1] * ca) * s];
  }
  c.restore();
  return null;
}
function S04(c, f, l) {
  baseA(c, 'bed', {});
  const peel = lerp(0.15, 0.75, easeInOut(prog(l, 0, 14)));
  const bx = 520, by = 1000 + Math.sin(f * 0.4) * 4;
  let end = null;
  shadowed(c, lc => {
    handAt(lc, 250, by + 40, -1.35, 3, { left: true, f: [0.55, 0.6, 0.6, 0.55], curl: [0.9, 0.9, 0.9, 0.9], spread: 0.08, thumb: 0.9, thumbAng: 0.5 });
    end = banana(lc, bx, by, -0.05, 0.95, peel);
  }, { blur: 50, dy: 44, alpha: 0.24 });
  if (end) handShadow(c, lc => handAt(lc, end[0] + 10, end[1] + 30, -1.6, 3, { f: [0.8, 0.5, 0.45, 0.4], curl: [0.5, 1, 1, 1], spread: 0.1, thumb: 1, thumbAng: 0.6 }));
  daylight(c);
}
const SLICE = [70, 75, 80, 85];
// Peeled banana rests diagonally across the bottom-right rim; the knife cuts perpendicular to it.
const BAN = { x: 1250, y: 1580, ang: Math.atan2(-0.82, -1), len: 640, hw: 74, coin: 42 };
function S05(c, f, l) {
  baseA(c, 'bed', {});
  const done = SLICE.filter(t => f >= t).length;
  const dx = Math.cos(BAN.ang), dy = Math.sin(BAN.ang), nx = -dy, ny = dx; // n points up-right
  const at = d => [BAN.x + dx * d, BAN.y + dy * d];
  const Lb = BAN.len - done * BAN.coin;
  // coins dropped so far, each with a tiny settle bounce
  SLICE.forEach((t, i) => {
    if (f < t) return;
    const k = f - t, from = at(BAN.len - i * BAN.coin - BAN.coin / 2);
    const side = [-1, 1, 0.2, -0.6][i];
    const land = [from[0] + dx * (95 + 30 * (i % 2)) + nx * side * 55, from[1] + dy * (95 + 30 * (i % 2)) + ny * side * 55];
    const fall = clamp(k / 3), bounce = k < 3 ? 0 : Math.exp(-(k - 3) * 0.7) * Math.sin((k - 3) * 2.2);
    const s = COIN_S * (lerp(1.2, 1, easeIn(fall)) + 0.05 * bounce);
    coin(c, lerp(from[0], land[0], easeIn(fall)), lerp(from[1], land[1], easeIn(fall)) - 6 * bounce, s, i * 1.3);
  });
  shadowed(c, lc => {
    lc.save(); lc.translate(BAN.x, BAN.y); lc.rotate(BAN.ang);
    const g = lc.createLinearGradient(0, -BAN.hw, 0, BAN.hw);
    g.addColorStop(0, '#fbf3d2'); g.addColorStop(0.55, '#f2e3b0'); g.addColorStop(1, '#dfc986');
    lc.fillStyle = g; rrect(lc, -100, -BAN.hw, Lb + 100, BAN.hw * 2, 34); lc.fill();
    lc.strokeStyle = 'rgba(200,170,100,.45)'; lc.lineWidth = 2; lc.stroke();
    lc.fillStyle = 'rgba(255,250,230,.95)'; rrect(lc, Lb - 16, -BAN.hw + 5, 16, BAN.hw * 2 - 10, 7); lc.fill();
    for (let k = -1; k <= 1; k++) poly(lc, [[-100, k * 34], [Lb - 20, k * 30]], 'rgba(220,196,140,.35)', 2);
    lc.restore();
  }, { blur: 30, dy: 26, alpha: 0.26 });
  // knife saws down through the banana end each cycle; handle and hand come from the right edge
  let ph = 0; for (const t of SLICE) if (f >= t - 5) ph = clamp((f - (t - 5)) / 5);
  const P = at(Lb - BAN.coin + 4 * Math.sin(ph * Math.PI));
  const J = [P[0] + nx * (BAN.hw + 70 - 150 * ph), P[1] + ny * (BAN.hw + 70 - 150 * ph)];
  const bladeAng = Math.atan2(-ny, -nx);
  handShadow(c, lc => {
    knife(lc, J[0], J[1], bladeAng, 1.6);
    const hx = J[0] + nx * 110, hy = J[1] + ny * 110;
    hand(lc, { x: hx + nx * 260, y: hy + ny * 260, ang: bladeAng, s: 3, f: [0.45, 0.42, 0.4, 0.36], curl: [1.1, 1.2, 1.2, 1.2], spread: 0.04, thumb: 0.95, thumbAng: 0.7 });
  });
  leftRimFingers(c, f);
  daylight(c);
}
function S06(c, f) {
  baseA(c, 'arc', { arc: true });
  leftRimFingers(c, f);
  daylight(c, 0.6);
  lift(c, 0.12, '252,246,242'); // softest, lowest-contrast pastel frame
}
function glassCup(c, x, y, s, ang, fill) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  const r = 170;
  c.fillStyle = 'rgba(214,226,232,.35)'; rrect(c, -r - 170, -26, 190, 52, 24); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 4; c.stroke();
  c.fillStyle = 'rgba(222,234,240,.42)'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.moveTo(r - 6, -26); c.quadraticCurveTo(r + 30, 0, r - 6, 26); c.fill();
  const r2 = rng(71);
  for (let i = 0; i < 90 * fill; i++) sesame(c, r * 0.35 + gauss(r2) * 40 * fill, gauss(r2) * 55 * fill, r2() * TAU, 1.1);
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 7; circle(c, 0, 0, r - 4); c.stroke();
  c.strokeStyle = 'rgba(120,140,150,.45)'; c.lineWidth = 2; circle(c, 0, 0, r); c.stroke(); circle(c, 0, 0, r - 12); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, r - 26, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
  c.strokeStyle = 'rgba(120,140,150,.5)'; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const a = Math.PI * 0.62 + i * 0.12; c.beginPath(); c.moveTo(Math.cos(a) * (r - 14), Math.sin(a) * (r - 14)); c.lineTo(Math.cos(a) * (r - 40), Math.sin(a) * (r - 40)); c.stroke(); }
  c.restore();
}
function S07(c, f, l) {
  baseA(c, 'arc', { arc: true });
  // seed particles: launched from the spout, falling away from the lens toward the mound
  const ent = easeOut(prog(l, 0, 5));
  const cx = lerp(1180, 790, ent), cy = lerp(330, 700, ent);
  const ang = Math.atan2(MOUND[1] - cy, MOUND[0] - cx);
  const spout = [cx + Math.cos(ang) * 185, cy + Math.sin(ang) * 185];
  const T0 = 105, T1 = 115, N = PILE.length;
  const landed = [], flying = [];
  for (let i = 0; i < N; i++) {
    const tl = T0 + (i / N) * (T1 - T0), k = (f - tl) / 3.5;
    if (k >= 1) landed.push(i); else if (k >= 0) flying.push([i, k]);
  }
  seedPile(c, landed.length);
  shadowed(c, lc => {
    for (const [i, k] of flying) {
      const e = easeIn(k), jx = PILE[i][0] * 0.3, jy = PILE[i][1] * 0.3;
      sesame(lc, lerp(spout[0] + jx, MOUND[0] + PILE[i][0], e), lerp(spout[1] + jy, MOUND[1] + PILE[i][1], e), PILE[i][2] + k * 3, lerp(1.9, 1.1, e));
    }
    glassCup(lc, cx, cy, 1, ang, 1 - prog(f, T0, T1 + 2) * 0.85);
    handAt(lc, cx + 90, cy - 150, -2.3, 3, { f: [0.7, 0.8, 0.8, 0.7], curl: [0.3, 0.3, 0.3, 0.3], thumb: 0.6 });
  }, { blur: 50, dy: 40, alpha: 0.2 });
  daylight(c);
}
function squeezeBottle(c, tx, ty, ang, s = 1) { // (tx,ty) nozzle tip, ang points from tip toward bottle body
  c.save(); c.translate(tx, ty); c.rotate(ang); c.scale(s, s);
  let g = c.createLinearGradient(0, -150, 0, 150);
  g.addColorStop(0, '#d8a61c'); g.addColorStop(0.35, '#fbe27e'); g.addColorStop(0.55, '#f5cf3a'); g.addColorStop(1, '#c9951a');
  c.fillStyle = g; rrect(c, 170, -148, 900, 296, 110); c.fill();
  c.strokeStyle = 'rgba(160,110,10,.35)'; c.lineWidth = 3; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; rrect(c, 240, -95, 700, 26, 13); c.fill();
  g = c.createLinearGradient(0, -80, 0, 80);
  g.addColorStop(0, '#caa022'); g.addColorStop(0.45, '#f7d65a'); g.addColorStop(1, '#b8871a');
  c.fillStyle = g; rrect(c, 70, -82, 120, 164, 30); c.fill();
  c.strokeStyle = 'rgba(140,100,10,.35)'; c.lineWidth = 2;
  for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(90 + i * 17, -78); c.lineTo(90 + i * 17, 78); c.stroke(); }
  c.fillStyle = g; c.beginPath(); c.moveTo(0, -9); c.lineTo(75, -34); c.lineTo(75, 34); c.lineTo(0, 9); c.closePath(); c.fill();
  c.fillStyle = 'rgba(214,142,26,.95)'; circle(c, 2, 0, 8); c.fill();
  c.restore();
}
function S08(c, f, l) {
  const u = easeInOut(prog(f, 121, 141));
  baseA(c, 'seeds', { arc: true, seeds: PILE.length }, false);
  if (f >= 121) for (const line of honeyLines(u)) honey(c, line, 11);
  restSpoon(c);
  const ent = easeOut(prog(l, 0, 4));
  const tip = honeyP(u), ang = -2.25;
  const tx = lerp(tip[0] - 700, tip[0] - 28, ent), ty = lerp(tip[1] - 800, tip[1] - 36, ent);
  const lifted = u > HONEY_LIFT[0] && u < HONEY_LIFT[1];
  if (f >= 121 && !lifted) honey(c, [[tx, ty], [lerp(tx, tip[0], 0.5), lerp(ty, tip[1], 0.5) + 3], tip], 6);
  shadowed(c, lc => {
    squeezeBottle(lc, tx, ty, ang);
    const bx = tx + Math.cos(ang) * 620, by = ty + Math.sin(ang) * 620;
    handAt(lc, bx + 150, by - 20, ang + Math.PI + 1.7, 3, { left: true, f: [1, 1, 1, 0.9], curl: [0.35, 0.35, 0.35, 0.35], spread: 0.08, thumb: 0.7 });
  }, { blur: 60, dy: 50, alpha: 0.22 });
  daylight(c);
}
function S09(c, f, l) {
  const sh = [Math.sin(f * 0.9) * 3, Math.sin(f * 0.7 + 1) * 3];
  c.save(); c.translate(sh[0], sh[1]);
  setABg(c, -sh[0], -sh[1]);
  c.drawImage(cached('honeyBowl', W, H, k => { drawWoodBowl(k, BOWL.x, BOWL.y, BOWL.R); contentsA(k, { arc: true, seeds: PILE.length, honey: 1 }); }), 0, 0);
  const m = easeInOut(prog(l, 0, 22));
  mixLayer(c, m);
  const [sx, sy] = stirPt(m);
  spoonWithHand(c, sx, sy, Math.atan2(900 - sy, 1500 - sx), 2);
  handShadow(c, lc => handAt(lc, 95, 1000 + Math.sin(f * 0.5) * 6, 0.15, 3, { left: true, f: [0.75, 0.8, 0.75, 0.65], curl: [0.25, 0.25, 0.25, 0.3], spread: 0.14, thumb: 0.8 }));
  c.restore();
  daylight(c);
}
function S10(c, f) {
  baseA(c, 'mixed', { arc: true, seeds: PILE.length, honey: 1, mix: 1 }, false);
  cinnamon(c, f);
  restSpoon(c);
  const rub = Math.sin(f * 1.3) * 6;
  handShadow(c, lc => handAt(lc, PINCH[0] + rub, PINCH[1], -2.7, 3, { f: [0.62, 0.45, 0.4, 0.38], curl: [0.4, 1.2, 1.3, 1.3], spread: 0.06, thumb: 1, thumbAng: 0.9, thumbCurl: 0.2 }));
  leftRimFingers(c, f);
  daylight(c);
}
function S11(c, f) {
  const t = easeIn(prog(f, 188, 198));
  setABg(c, -40 * t, -260 * t);
  c.save(); c.translate(260 * t, 1380 * t);
  const grp = cached('finishedBowl', W, H, k => {
    drawWoodBowl(k, BOWL.x, BOWL.y, BOWL.R);
    contentsA(k, { arc: true, seeds: PILE.length, honey: 1, mix: 1, cin: 999 });
    shadowed(k, l => spoon(l, 880, 1000, -0.1, 2), { blur: 16, dy: 10, alpha: 0.3 });
  });
  c.drawImage(grp, 0, 0);
  handShadow(c, lc => handAt(lc, 190, 1480, -1.2, 3, { left: true, f: [0.25, 0.25, 0.25, 0.25], curl: [1, 1, 1, 1], spread: 0.05, thumb: 1.05, thumbAng: 0.3 }));
  c.restore();
  daylight(c);
  lift(c, 0.08 + 0.08 * t); // brightest frame
}

/* ---------- Set B ---------- */
const JAR = { x: 540, y: 940, R: 340 };
const JAR_COINS = [[-140, -50, 0.3], [40, 110, 1.1], [140, -120, 2.2], [-70, 150, 0.8], [-170, 100, 1.9], [150, 60, 2.7]];
function jar(c, x, y, R, o = {}) {
  const { lid = false, crater = 0, push = 0, spoonDraw = null } = o;
  // glass body with layered contents visible through the wall
  c.fillStyle = 'rgba(208,222,228,.55)'; circle(c, x, y, R); c.fill();
  c.save(); c.beginPath(); c.arc(x, y, R - 2, 0, TAU); c.arc(x, y, R * 0.86, 0, TAU, true); c.clip();
  const r = rng(404);
  for (let i = 0; i < 26; i++) {
    const a0 = r() * TAU, a1 = a0 + 0.2 + r() * 0.5, k = r();
    c.strokeStyle = k < 0.45 ? 'rgba(248,244,234,.9)' : k < 0.75 ? 'rgba(238,220,150,.85)' : 'rgba(214,160,70,.75)';
    c.lineWidth = 10 + r() * 20; c.beginPath(); c.arc(x, y, R * (0.88 + r() * 0.1), a0, a1); c.stroke();
  }
  c.restore();
  // top surface of the contents
  const ri = R * 0.86;
  c.save(); circle(c, x, y, ri); c.clip();
  yogurtBed(c, x, y, ri + 4, 0, 41);
  for (const [dx, dy, a] of JAR_COINS) coin(c, x + dx, y + dy, 1.6, a);
  const r2 = rng(505);
  for (let i = 0; i < 90; i++) sesame(c, x + gauss(r2) * 130, y + gauss(r2) * 130, r2() * TAU, 1.3);
  for (let j = 0; j < 2; j++) { const hp = []; for (let i = 0; i <= 80; i++) { const t = i / 80; hp.push([x - 230 + 460 * t, y - 110 + j * 150 + 70 * t + 38 * Math.sin(t * TAU * 1.6 + j * 2)]); } honey(c, hp, 9); }
  if (crater > 0) craterAt(c, x + 105, y - 100, 150 * crater, crater, x, y);
  if (push > 0) yogurtMound(c, x - 120 - 30 * push, y - 40, 50 + 100 * push, 71, 0.16);
  if (spoonDraw) spoonDraw(c);
  const g = c.createLinearGradient(0, y - ri, 0, y);
  g.addColorStop(0, 'rgba(90,100,110,.16)'); g.addColorStop(1, 'rgba(90,100,110,0)');
  c.fillStyle = g; c.fillRect(x - ri, y - ri, 2 * ri, ri);
  c.restore();
  // glass rim
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 12; circle(c, x, y, R * 0.88); c.stroke();
  c.strokeStyle = 'rgba(120,145,155,.5)'; c.lineWidth = 2.5; circle(c, x, y, R * 0.86); c.stroke(); circle(c, x, y, R * 0.905); c.stroke();
  c.strokeStyle = 'rgba(120,145,155,.45)'; c.lineWidth = 3; circle(c, x, y, R - 1); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 6; c.beginPath(); c.arc(x, y, R - 12, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
  if (lid) {
    c.fillStyle = 'rgba(232,242,246,.28)'; circle(c, x, y, R * 0.97); c.fill();
    c.strokeStyle = '#efe8d9'; c.lineWidth = 18; circle(c, x, y, R * 0.9); c.stroke();
    c.strokeStyle = 'rgba(160,150,130,.45)'; c.lineWidth = 2; circle(c, x, y, R * 0.93); c.stroke(); circle(c, x, y, R * 0.87); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 9; c.beginPath(); c.arc(x, y, R * 0.7, Math.PI * 1.12, Math.PI * 1.4); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.arc(x, y, R * 0.6, Math.PI * 1.15, Math.PI * 1.3); c.stroke();
  }
}
function craterAt(c, x, y, rc, depth, jx, jy) {
  // raised lip, then the hole: walls hold their shape and show coins and seeds
  blob(c, x, y, rc * 1.14, 61, 0.1); c.fillStyle = '#fbf8f1'; c.fill();
  c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 6; c.stroke();
  blob(c, x, y, rc, 62, 0.12);
  const g = c.createRadialGradient(x - rc * 0.1, y + rc * 0.25, rc * 0.1, x, y, rc);
  g.addColorStop(0, '#e2d6c0'); g.addColorStop(0.7, '#ece4d4'); g.addColorStop(1, '#f6f1e6');
  c.fillStyle = g; c.fill();
  c.save(); blob(c, x, y, rc, 62, 0.12); c.clip();
  const sg = c.createLinearGradient(0, y - rc, 0, y + rc * 0.4);
  sg.addColorStop(0, `rgba(105,80,48,${0.42 * depth})`); sg.addColorStop(1, 'rgba(105,80,48,0)');
  c.fillStyle = sg; c.fillRect(x - rc, y - rc, 2 * rc, 2 * rc);
  for (const [a, d, s] of [[3.6, 0.8, 1.3], [4.6, 0.86, 1.2], [0.5, 0.82, 1.25], [2.2, 0.9, 1.1]]) {
    coin(c, x + Math.cos(a) * rc * d, y + Math.sin(a) * rc * d, s * depth, a);
    c.fillStyle = 'rgba(244,238,226,.75)'; circle(c, x + Math.cos(a) * rc * (d + 0.25), y + Math.sin(a) * rc * (d + 0.25), 40 * depth); c.fill();
  }
  const r = rng(63);
  for (let i = 0; i < 40; i++) { const a = r() * TAU, d = (0.55 + r() * 0.42) * rc; sesame(c, x + Math.cos(a) * d, y + Math.sin(a) * d, r() * TAU, 1.1); }
  poly(c, [[x - rc * 0.7, y - rc * 0.5], [x - rc * 0.4, y - rc * 0.2], [x - rc * 0.3, y + rc * 0.2]], 'rgba(214,150,40,.55)', 10);
  c.restore();
  c.strokeStyle = 'rgba(150,125,90,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, rc * 0.98, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, rc * 1.02, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
}
function jarHands(c, x, y, f, mode = 'sides') {
  const w = Math.sin(f * 0.4) * 3, R = JAR.R;
  const o = { f: [0.95, 1, 0.95, 0.85], curl: [0.25, 0.25, 0.3, 0.3], spread: 0.08, thumb: 0.8, thumbAng: 0.3 };
  handShadow(c, lc => {
    if (mode === 'sides') {
      handAt(lc, x - R * 0.9 + w, y + R * 0.05, -1.2, 3.4, { ...o, left: true, curl: [-0.25, -0.25, -0.3, -0.3] });
      handAt(lc, x + R * 0.9 - w, y + R * 0.05, -1.94, 3.4, { ...o, curl: [0.25, 0.25, 0.3, 0.3] });
    } else {
      handAt(lc, x - R * 0.5 + w, y + R * 0.9, -1.3, 3.4, { ...o, left: true, curl: [-0.3, -0.3, -0.35, -0.35] });
      handAt(lc, x + R * 0.5 - w, y + R * 0.9, -1.84, 3.4, { ...o });
    }
  }, 0.22);
}
function S12(c, f, l) {
  c.drawImage(quartzTex(), 0, 0);
  const k = easeOut(prog(l, 0, 12));
  const y = lerp(2300, JAR.y, k);
  const spr = cached('jarLid', W, H, k => shadowed(k, lc => jar(lc, JAR.x, JAR.y, JAR.R, { lid: true }), { blur: 60, dy: 34, alpha: 0.28 }));
  c.drawImage(spr, 0, y - JAR.y);
  jarHands(c, JAR.x, y, f);
  daylight(c);
}
function S13(c, f, l) {
  c.drawImage(quartzTex(), 0, 0);
  // enter 0-15, dig 15-35, push the mound left 35-62; slow and satisfying
  const enter = easeInOut(prog(l, 0, 15)), dig = easeInOut(prog(l, 14, 36)), push = easeInOut(prog(l, 34, 60));
  const cxr = JAR.x + 105, cyr = JAR.y - 100;
  const sx = lerp(1250, cxr + 30, enter) - 250 * push, sy = lerp(900, cyr, enter) + 30 * push - 10 * Math.sin(dig * Math.PI);
  const ss = 2.3 * (1 - 0.1 * dig + 0.08 * push);
  const load = lc => { if (dig > 0.3) yogurtMound(lc, -2, 0, 52 * Math.min(1, dig), 81, 0.18); if (push > 0.4) coin(lc, 8, -6, 0.9, 1.3); };
  shadowed(c, lc => jar(lc, JAR.x, JAR.y, JAR.R, {
    crater: dig * (1 - 0.1 * push), push,
    spoonDraw: sc => spoon(sc, sx, sy, -0.18 + 0.1 * push, ss, load),
  }), { blur: 60, dy: 34, alpha: 0.28 });
  // spoon handle continues outside the jar mouth to the hand at the right edge
  const a = -0.18 + 0.1 * push;
  handShadow(c, lc => {
    lc.save(); circle(lc, JAR.x, JAR.y, JAR.R * 0.86); lc.rect(W, 0, -W, H); lc.clip('evenodd');
    spoon(lc, sx, sy, a, ss); lc.restore();
    hand(lc, { x: sx + Math.cos(a) * 395 * ss, y: sy + Math.sin(a) * 395 * ss, ang: a + Math.PI, s: 3.4, f: [0.45, 0.5, 0.45, 0.4], curl: [0.9, 0.9, 1, 1.1], spread: 0.05, thumb: 0.9, thumbAng: 0.55 });
  });
  jarHands(c, JAR.x, JAR.y, f, 'bottom');
  daylight(c);
}

/* ---------- Set C ---------- */
const UB = { x: 540, y: 300, R: 390 }, LB = { x: 730, y: 1440, R: 420 }, SD = { x: 215, y: 960, R: 190 };
const CS = 1.3;
const LB_COINS = [[-90, -40, 0.4], [-20, -110, 1.3], [60, -30, 2.1], [-40, 60, 0.9], [40, 70, 2.6], [110, -100, 1.7]];
const UB_COINS = [[-70, 60, 0.7], [20, 130, 1.9], [90, 40, 2.8], [-20, -10, 1.2]];
function bowlC(c, b, coins, n, extras = {}) {
  const spr = whiteBowl(b.R);
  shadowed(c, lc => lc.drawImage(spr, b.x - b.R - 4, b.y - b.R - 4), { blur: 50, dy: 30, alpha: 0.26 });
  const ri = b.R * 0.86 * 0.94;
  yogurtBed(c, b.x, b.y, ri, 0.55, b.R);
  for (let i = 0; i < Math.min(n, coins.length); i++) {
    const [dx, dy, a] = coins[i];
    if (extras.dropAt && extras.dropAt[i] !== undefined) continue;
    coin(c, b.x + dx, b.y + dy, CS, a);
  }
  if (extras.honey) {
    for (let j = 0; j < 3; j++) {
      const pts = []; for (let i = 0; i <= 50; i++) { const t = i / 50; pts.push([b.x - ri * 0.7 + ri * 1.4 * t, b.y - ri * 0.45 + j * ri * 0.4 + 30 * Math.sin(t * TAU * 2 + j)]); }
      honey(c, pts, 6);
    }
  }
  if (extras.seeds) { const r = rng(b.R + 7); for (let i = 0; i < 55; i++) sesame(c, b.x + gauss(r) * ri * 0.35, b.y + gauss(r) * ri * 0.35, r() * TAU, 1.05); }
}
function setC(c, st) {
  const stat = { ...st, f: 0 };
  const drops = [];
  for (const [b, coins, n, x] of [[UB, UB_COINS, st.ub ?? 0, st.ubx], [LB, LB_COINS, st.lb ?? 0, st.lbx]]) {
    if (x && x.dropAt) { x.dropAt.forEach((t, i) => drops.push([b, coins[i], t])); }
  }
  frozen(c, 'C:' + JSON.stringify(stat), k => setCBase(k, stat));
  for (const [b, [dx, dy, a], t] of drops) {
    const k = clamp((st.f - t) / 3);
    if (k > 0) coin(c, b.x + dx, b.y + dy, CS * lerp(1.2, 1, easeIn(k)), a);
  }
}
function setCBase(c, st) {
  c.drawImage(greyTex(), 0, 0);
  const d = scallopDish(SD.R);
  shadowed(c, lc => lc.drawImage(d, SD.x - SD.R - 10, SD.y - SD.R - 10), { blur: 40, dy: 24, alpha: 0.24 });
  const r = rng(12);
  for (let i = 0; i < 7; i++) coin(c, SD.x + gauss(r) * 45, SD.y + gauss(r) * 45, 1.1, r() * TAU);
  bowlC(c, UB, UB_COINS, st.ub ?? 0, { ...st.ubx, f: st.f });
  bowlC(c, LB, LB_COINS, st.lb ?? 0, { ...st.lbx, f: st.f });
}
function S14(c, f, l) {
  setC(c, { f, ub: 0, lb: 2, lbx: { dropAt: [289, 296] } });
  const k = easeOut(prog(l, 0, 5));
  const tgt = f < 292 ? [LB.x - 90, LB.y - 40] : [LB.x - 20, LB.y - 110];
  const bob = Math.sin(l * 0.8) * 10;
  const tx = lerp(-300, tgt[0] - 30, k) + bob, ty = lerp(1300, tgt[1] - 10, k);
  const holding = (f < 289) || (f >= 292 && f < 296);
  handShadow(c, lc => {
    handAt(lc, tx, ty, 0.25, 3.6, { f: [0.9, 0.55, 0.45, 0.4], curl: [0.3, 1.1, 1.2, 1.2], spread: 0.08, thumb: 1, thumbAng: 0.8, thumbCurl: 0.2 });
    if (holding) coin(lc, tx + 10, ty + 20, CS * 1.15, 0.8);
  });
  daylight(c);
}
function S15(c, f, l) {
  setC(c, { f, ub: 2, lb: 6, ubx: { dropAt: [304, 308] } });
  const k = easeOut(prog(l, 0, 3));
  const tx = lerp(100, 480, k) + Math.sin(l) * 8, ty = lerp(-100, 380, k);
  handShadow(c, lc => {
    handAt(lc, tx, ty, 0.9, 3.6, { f: [0.9, 0.55, 0.45, 0.4], curl: [0.3, 1.1, 1.2, 1.2], spread: 0.08, thumb: 1, thumbAng: 0.8, thumbCurl: 0.2 });
    if (f < 304) coin(lc, tx, ty + 10, CS * 1.15, 1);
  });
  daylight(c);
}
function S16(c, f, l) {
  setC(c, { f, ub: 4, lb: 6, ubx: { honey: true, seeds: true }, lbx: { honey: true, seeds: true } });
  const k = easeIn(prog(l, 0, 12));
  const tx = lerp(960, 1500, k), ty = lerp(1000, 900, k);
  if (l < 13) shadowed(c, lc => {
    squeezeBottle(lc, tx, ty, -0.35);
    handAt(lc, tx + 470, ty - 90, 2.75, 3.4, { f: [1, 1, 1, 0.9], curl: [-0.35, -0.35, -0.35, -0.35], spread: 0.06, thumb: 0.7 });
  }, { blur: 60, dy: 50, alpha: 0.22 });
  daylight(c);
}
function loadedSpoon(lc, x, y, ang, s, liftK) {
  spoon(lc, x, y, ang, s, sc => {
    yogurtMound(sc, 0, 2, 40, 91, 0.14);
    coin(sc, -4, -2, 1.05, 0.6);
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([-46 + 92 * t, -18 + 30 * t + 8 * Math.sin(t * 9)]); }
    honey(sc, pts, 5);
    const r = rng(93); for (let i = 0; i < 14; i++) sesame(sc, gauss(r) * 18, gauss(r) * 16, r() * TAU, 0.8);
  });
}
function S17(c, f, l) {
  setC(c, { f, ub: 4, lb: 6, ubx: { honey: true, seeds: true }, lbx: { honey: true, seeds: true } });
  const cradle = Math.sin(f * 0.25) * 4;
  handShadow(c, lc => handAt(lc, LB.x - LB.R + 60 + cradle, LB.y + LB.R - 120, -0.75, 3.6, { left: true, f: [0.8, 0.85, 0.8, 0.7], curl: [0.3, 0.3, 0.3, 0.35], spread: 0.14, thumb: 0.85, thumbAng: 0.1 }));
  const target = [LB.x + 40, LB.y - 30];
  const enter = easeOut(prog(f, 334, 350)), dig = easeInOut(prog(f, 350, 384));
  const up1 = easeInOut(prog(f, 384, 397)), up2 = easeIn(prog(f, 397, 411));
  let x = lerp(1400, target[0] + 40, enter) - 40 * dig + 30 * Math.sin(dig * Math.PI * 2) * (1 - up1);
  let y = lerp(1300, target[1], enter) + 20 * dig;
  let s = 2.1 * (1 - 0.06 * dig) * lerp(1, 1.3, up1) * lerp(1, 2.05, up2);
  x += 30 * up1; y += -30 * up1;
  x = lerp(x, 660, up2); y = lerp(y, 1330, up2);
  const ang = -0.35 - 0.1 * up2;
  const loaded = f >= 380;
  if (up1 > 0 && up2 < 1) { const st = [[target[0], target[1]], [x, y + 20 * s * 0.4]]; poly(c, st, `rgba(214,150,40,${0.6 * (1 - up2)})`, 3); }
  const blurPx = 11 * up2 * up2;
  const paint = lc => {
    if (loaded) loadedSpoon(lc, x, y, ang, s, up1); else spoon(lc, x, y, ang, s);
    const hs = 3.4 * (s / 2.1) ** 0.8;
    hand(lc, { x: x + Math.cos(ang) * 400 * s, y: y + Math.sin(ang) * 400 * s, ang: ang + Math.PI, s: hs, f: [0.45, 0.5, 0.45, 0.4], curl: [0.9, 0.9, 1, 1.1], spread: 0.05, thumb: 0.9, thumbAng: 0.55 });
  };
  if (blurPx > 0.3) blurred(c, paint, blurPx);
  else handShadow(c, paint);
  daylight(c);
}

/* ---------- Set D: kitchen and host ---------- */
function kitchenBg() {
  return cached('kitchen', W, H, (c) => {
    const t = makeCanvas(W, H), k = t.getContext('2d'), r = rng(301);
    // backsplash: white herringbone tile
    k.fillStyle = '#d9d5cd'; k.fillRect(0, 640, W, 720);
    k.save(); k.beginPath(); k.rect(0, 640, W, 720); k.clip();
    k.translate(540, 1000); k.rotate(Math.PI / 4);
    const Wt = 30, Lt = 90;
    const tile = (x, y, w, h) => {
      const v = 240 + r() * 12;
      const g = k.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, `rgb(${v + 3},${v + 2},${v})`); g.addColorStop(1, `rgb(${v - 8},${v - 9},${v - 12})`);
      k.fillStyle = g; rrect(k, x + 1.5, y + 1.5, w - 3, h - 3, 3); k.fill();
      k.fillStyle = 'rgba(255,255,255,.55)'; k.fillRect(x + 4, y + 3, w - 10, 2);
    };
    for (let sIdx = -14; sIdx <= 14; sIdx++) for (let j = -40; j <= 40; j++) {
      const ox = -Lt * sIdx + j * Wt, oy = Lt * sIdx + j * Wt;
      if (Math.abs(ox) > 1100 || Math.abs(oy) > 1100) continue;
      tile(ox, oy, Lt, Wt); tile(ox, oy + Wt, Wt, Lt);
    }
    k.restore();
    // upper cabinets, shaker doors in medium brown wood
    k.fillStyle = '#6b4329'; k.fillRect(0, 0, W, 650);
    for (let i = 0; i < 4; i++) {
      const x = -30 + i * 292, w = 280, y = -20, h = 640;
      const g = k.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#94643f'); g.addColorStop(0.5, '#9c6c46'); g.addColorStop(1, '#85583a');
      k.fillStyle = g; k.fillRect(x, y, w, h);
      for (let n = 0; n < 40; n++) { k.strokeStyle = `rgba(${r() < 0.5 ? '70,40,20' : '190,140,95'},${0.08 + r() * 0.1})`; k.lineWidth = 1 + r() * 2; const gx = x + r() * w; k.beginPath(); k.moveTo(gx, y); k.bezierCurveTo(gx + 6, y + h * 0.3, gx - 6, y + h * 0.7, gx + 3, y + h); k.stroke(); }
      k.fillStyle = 'rgba(60,34,18,.28)'; k.fillRect(x + 40, y + 60, w - 80, 8); k.fillRect(x + 40, y + 60, 8, h - 120);
      k.fillStyle = 'rgba(210,160,110,.25)'; k.fillRect(x + 40, y + h - 68, w - 80, 6); k.fillRect(x + w - 48, y + 60, 6, h - 120);
      k.fillStyle = 'rgba(60,34,18,.4)'; k.fillRect(x + w - 2, y, 14, h);
      const kx = i % 2 ? x + 30 : x + w - 30;
      k.fillStyle = '#b89456'; circle(k, kx, 575, 10); k.fill(); k.fillStyle = 'rgba(255,240,200,.7)'; circle(k, kx - 3, 572, 3.5); k.fill();
    }
    k.fillStyle = '#4b2f1e'; k.fillRect(0, 620, W, 28);
    const glow = k.createLinearGradient(0, 648, 0, 900);
    glow.addColorStop(0, 'rgba(255,214,150,.45)'); glow.addColorStop(1, 'rgba(255,214,150,0)');
    k.fillStyle = glow; k.fillRect(0, 648, W, 260);
    // back counter and base cabinets
    k.fillStyle = '#f5f3ef'; k.fillRect(0, 1330, W, 40);
    k.fillStyle = '#d8d3ca'; k.fillRect(0, 1370, W, 12);
    k.fillStyle = '#8d5f3d'; k.fillRect(0, 1382, W, 540);
    for (let i = 0; i < 4; i++) { k.fillStyle = 'rgba(60,34,18,.35)'; k.fillRect(-30 + i * 292 + 278, 1382, 14, 540); k.strokeStyle = 'rgba(60,34,18,.3)'; k.lineWidth = 6; k.strokeRect(-30 + i * 292 + 40, 1440, 200, 420); }
    // props on the back counter
    k.fillStyle = '#efece6'; rrect(k, 110, 1215, 120, 120, 18); k.fill(); k.fillStyle = '#c9b89c'; rrect(k, 104, 1200, 132, 26, 10); k.fill();
    k.fillStyle = '#b98b5a'; rrect(k, 880, 1060, 150, 275, 40); k.fill(); k.fillStyle = 'rgba(80,50,25,.3)'; circle(k, 955, 1100, 12); k.fill();
    // warm light
    radialSpot(k, 540, 820, 750, '255,206,150', 0.18);
    const v = k.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(40,24,12,.12)'); v.addColorStop(0.5, 'rgba(40,24,12,0)');
    k.fillStyle = v; k.fillRect(0, 0, W, H);
    if (hasFilter()) c.filter = 'blur(3px)';
    c.drawImage(t, 0, 0);
    c.filter = 'none';
  });
}
const HOST = { skin: '#dfa47f', skinL: '#efc2a2', skinS: '#c2835f', hair: '#3b2920', hairL: '#5e4232', top: '#93ad8e', topS: '#7a9677', pants: '#4b5b76', lip: '#b8625a' };
function limb(c, a, b, w, col) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
function hostBowl(c, x, y, s, open) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const rx = 150, ry = 40 + 45 * open;
  let g = c.createLinearGradient(-rx, 0, rx, 0);
  g.addColorStop(0, '#d9d7d2'); g.addColorStop(0.4, '#ffffff'); g.addColorStop(1, '#cfccc6');
  c.fillStyle = g; c.beginPath(); c.moveTo(-rx, 0); c.bezierCurveTo(-rx, 90, -60, 118, 0, 118); c.bezierCurveTo(60, 118, rx, 90, rx, 0); c.closePath(); c.fill();
  c.fillStyle = '#f2f0ec'; ell(c, 0, 0, rx, ry); c.fill();
  c.strokeStyle = '#fbfbfa'; c.lineWidth = 6; ell(c, 0, 0, rx - 3, ry - 2); c.stroke();
  c.save(); ell(c, 0, 0, rx - 12, ry - 8); c.clip();
  c.fillStyle = '#faf6ee'; ell(c, 0, 6, rx - 14, ry - 8); c.fill();
  for (const [dx, dy] of [[-60, -4], [10, 8], [70, -2], [-20, -14]]) {
    c.save(); c.translate(dx, dy * (ry / 60)); c.scale(1, ry / 85); coin(c, 0, 0, 0.75, dx); c.restore();
  }
  const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push([-110 + 220 * t, (ry / 85) * (-20 + 30 * Math.sin(t * 8))]); }
  honey(c, pts, 4);
  const r = rng(707); for (let i = 0; i < 26; i++) sesame(c, gauss(r) * 50, gauss(r) * 12 * (ry / 60), r() * TAU, 0.6);
  c.restore();
  c.restore();
}
function mouth(c, st) {
  const { open = 0, round = 0, smile = 0.6, chew = 0 } = st;
  const mx = 540 + chew * 3, my = 568;
  if (open < 0.05) {
    c.strokeStyle = HOST.lip; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(mx - 36 + chew * 2, my - 4 * smile); c.quadraticCurveTo(mx, my + 20 * smile - Math.abs(chew) * 4, mx + 36, my - 4 * smile); c.stroke();
    c.strokeStyle = 'rgba(180,100,90,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(mx - 14, my + 16 * smile + 8); c.quadraticCurveTo(mx, my + 20 * smile + 11, mx + 14, my + 16 * smile + 8); c.stroke();
    return;
  }
  const w = lerp(40, 22, round) + 10 * smile * (1 - round), h = 8 + 34 * open;
  c.save();
  c.beginPath(); c.moveTo(mx - w, my - 2); c.bezierCurveTo(mx - w * 0.6, my - h * 0.55 - 4, mx + w * 0.6, my - h * 0.55 - 4, mx + w, my - 2);
  c.bezierCurveTo(mx + w * 0.7, my + h * 0.9 + smile * 6, mx - w * 0.7, my + h * 0.9 + smile * 6, mx - w, my - 2); c.closePath();
  c.fillStyle = '#5c2622'; c.fill();
  c.clip();
  c.fillStyle = '#fbf8f4'; c.fillRect(mx - w, my - h, 2 * w, h * 0.55);
  c.fillStyle = '#c86b6b'; ell(c, mx, my + h * 0.75, w * 0.6, h * 0.35); c.fill();
  c.restore();
  c.strokeStyle = HOST.lip; c.lineWidth = 6; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(mx - w, my - 2); c.bezierCurveTo(mx - w * 0.6, my - h * 0.55 - 4, mx + w * 0.6, my - h * 0.55 - 4, mx + w, my - 2);
  c.bezierCurveTo(mx + w * 0.7, my + h * 0.9 + smile * 6, mx - w * 0.7, my + h * 0.9 + smile * 6, mx - w, my - 2); c.closePath(); c.stroke();
}
function host(c, p) {
  const { lean = 0, handR, elbowR, elbowL, spoonAng, spoonIn = 0, bowl, mouthSt, eyesClosed = 0, brow = 0, nod = 0 } = p;
  c.save();
  const sc = 1 + 0.045 * lean;
  c.translate(540, 1700); c.scale(sc, sc); c.translate(-540, -1700 - 14 * lean);
  // back hair
  c.fillStyle = HOST.hair;
  c.beginPath(); c.moveTo(420, 430); c.bezierCurveTo(390, 560, 380, 700, 400, 790); c.lineTo(680, 790); c.bezierCurveTo(700, 700, 690, 560, 660, 430); c.closePath(); c.fill();
  // pants and top
  c.fillStyle = HOST.pants; c.beginPath(); c.moveTo(385, 1230); c.lineTo(700, 1230); c.lineTo(725, 1760); c.lineTo(355, 1760); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 3; c.beginPath(); c.moveTo(542, 1290); c.lineTo(545, 1760); c.stroke();
  let g = c.createLinearGradient(330, 0, 760, 0);
  g.addColorStop(0, HOST.topS); g.addColorStop(0.45, HOST.top); g.addColorStop(1, HOST.topS);
  c.fillStyle = g;
  c.beginPath(); c.moveTo(492, 690); c.bezierCurveTo(430, 700, 360, 712, 340, 760); c.bezierCurveTo(325, 830, 332, 900, 350, 950);
  c.bezierCurveTo(370, 1050, 380, 1150, 372, 1270); c.lineTo(712, 1270); c.bezierCurveTo(702, 1150, 712, 1050, 732, 950);
  c.bezierCurveTo(750, 900, 757, 830, 742, 760); c.bezierCurveTo(722, 712, 652, 700, 590, 690);
  c.bezierCurveTo(575, 735, 505, 735, 492, 690); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(70,95,70,.35)'; c.lineWidth = 3;
  for (const [a, b] of [[[430, 1000], [470, 1180]], [[650, 990], [620, 1170]], [[520, 1210], [600, 1240]]]) { c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2 + 10, (a[1] + b[1]) / 2, b[0], b[1]); c.stroke(); }
  // neck
  g = c.createLinearGradient(0, 590, 0, 720);
  g.addColorStop(0, HOST.skinS); g.addColorStop(1, HOST.skin);
  c.fillStyle = g; c.beginPath(); c.moveTo(498, 590); c.lineTo(582, 590); c.lineTo(590, 700); c.bezierCurveTo(575, 732, 505, 732, 490, 700); c.closePath(); c.fill();
  // her left arm (viewer's right) holding the bowl
  const shL = [728, 770], hL = [bowl.x + 60 * bowl.s, bowl.y + 70 * bowl.s];
  const elL = elbowL;
  limb(c, shL, elL, 70, HOST.skin); limb(c, elL, hL, 60, HOST.skin);
  limb(c, elL, hL, 26, 'rgba(245,205,175,.5)');
  c.fillStyle = HOST.top; ell(c, 735, 815, 58, 78, -0.2); c.fill();
  c.fillStyle = HOST.skin; ell(c, hL[0], hL[1], 55, 42, -0.3); c.fill();
  hostBowl(c, bowl.x, bowl.y, bowl.s, bowl.open);
  c.fillStyle = HOST.skin; ell(c, bowl.x + 120 * bowl.s, bowl.y + 4, 16, 34, 0.5); c.fill();
  c.strokeStyle = HOST.skinS; c.lineWidth = 2; c.stroke();
  // head (nods slightly while chewing)
  c.save(); c.translate(540, 600); c.rotate(nod * 0.03); c.translate(-540, -600 + nod * 4);
  c.fillStyle = HOST.skinS; ell(c, 424, 482, 20, 32); c.fill(); ell(c, 656, 482, 20, 32); c.fill();
  c.beginPath(); c.moveTo(540, 322); c.bezierCurveTo(612, 322, 660, 382, 660, 470); c.bezierCurveTo(660, 556, 602, 620, 540, 620); c.bezierCurveTo(478, 620, 420, 556, 420, 470); c.bezierCurveTo(420, 382, 468, 322, 540, 322); c.closePath();
  g = c.createRadialGradient(540, 470, 30, 540, 480, 170);
  g.addColorStop(0, HOST.skinL); g.addColorStop(0.65, HOST.skin); g.addColorStop(1, HOST.skinS);
  c.fillStyle = g; c.fill();
  radialSpot(c, 470, 530, 42, '232,120,110', 0.28); radialSpot(c, 610, 530, 42, '232,120,110', 0.28);
  if (p.cheek) radialSpot(c, 600, 555, 40, '240,190,160', 0.6 * p.cheek);
  // eyes
  for (const ex of [490, 590]) {
    const ey = 470;
    if (eyesClosed > 0.5) {
      c.strokeStyle = '#3a2620'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(ex - 24, ey + 4); c.quadraticCurveTo(ex, ey - 14, ex + 24, ey + 4); c.stroke();
    } else {
      c.fillStyle = '#fbf7f2'; c.beginPath(); c.moveTo(ex - 27, ey); c.quadraticCurveTo(ex, ey - 22, ex + 27, ey); c.quadraticCurveTo(ex, ey + 16, ex - 27, ey); c.fill();
      c.fillStyle = '#4b3025'; circle(c, ex + 1, ey - 1, 13); c.fill();
      c.fillStyle = '#1e1310'; circle(c, ex + 1, ey - 1, 6.5); c.fill();
      c.fillStyle = '#ffffff'; circle(c, ex - 4, ey - 6, 4); c.fill();
      c.strokeStyle = '#2d1c16'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(ex - 29, ey + 1); c.quadraticCurveTo(ex, ey - 24, ex + 29, ey - 1); c.stroke();
      c.strokeStyle = 'rgba(150,90,70,.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 18, ey + 13); c.quadraticCurveTo(ex, ey + 18, ex + 18, ey + 12); c.stroke();
    }
  }
  c.strokeStyle = HOST.hair; c.lineWidth = 8; c.lineCap = 'round';
  c.beginPath(); c.moveTo(458, 432 - brow * 8); c.quadraticCurveTo(490, 414 - brow * 12, 520, 428 - brow * 8); c.stroke();
  c.beginPath(); c.moveTo(560, 428 - brow * 8); c.quadraticCurveTo(590, 414 - brow * 12, 622, 432 - brow * 8); c.stroke();
  c.strokeStyle = HOST.skinS; c.lineWidth = 4; c.beginPath(); c.moveTo(545, 480); c.quadraticCurveTo(556, 520, 540, 530); c.quadraticCurveTo(530, 532, 524, 526); c.stroke();
  radialSpot(c, 538, 505, 14, '255,235,215', 0.6);
  mouth(c, mouthSt);
  // front hair with a side part, framing the face
  c.fillStyle = HOST.hair;
  c.beginPath(); c.moveTo(412, 520); c.bezierCurveTo(400, 380, 460, 300, 545, 300); c.bezierCurveTo(630, 300, 690, 380, 670, 520);
  c.bezierCurveTo(662, 440, 640, 395, 600, 372); c.bezierCurveTo(560, 400, 500, 405, 470, 400); c.bezierCurveTo(440, 420, 430, 470, 412, 520); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(418, 440); c.bezierCurveTo(395, 560, 402, 690, 380, 780); c.bezierCurveTo(420, 760, 440, 650, 438, 540); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(662, 440); c.bezierCurveTo(690, 560, 680, 690, 702, 780); c.bezierCurveTo(660, 760, 642, 650, 644, 540); c.closePath(); c.fill();
  c.strokeStyle = HOST.hairL; c.lineWidth = 4;
  for (const [a, b, cc] of [[[470, 330], [430, 450], [440, 380]], [[560, 318], [640, 420], [620, 350]], [[600, 330], [660, 480], [650, 380]], [[410, 560], [395, 720], [410, 640]], [[670, 560], [690, 720], [676, 640]]]) {
    c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(cc[0], cc[1], b[0], b[1]); c.stroke();
  }
  c.restore();
  // her right arm (viewer's left) with the spoon, drawn in front
  const shR = [352, 770];
  const elR = elbowR;
  limb(c, shR, elR, 70, HOST.skin); limb(c, elR, handR, 60, HOST.skin);
  limb(c, elR, handR, 26, 'rgba(245,205,175,.5)');
  c.fillStyle = HOST.top; ell(c, 345, 815, 58, 78, 0.2); c.fill();
  // spoon from the fist
  const sl = 200, bx = handR[0] + Math.cos(spoonAng) * sl, by = handR[1] + Math.sin(spoonAng) * sl;
  const sg = c.createLinearGradient(handR[0], handR[1], bx, by);
  sg.addColorStop(0, '#a4a9ae'); sg.addColorStop(0.5, '#eef0f2'); sg.addColorStop(1, '#b7bbc0');
  limb(c, handR, [lerp(handR[0], bx, 0.85), lerp(handR[1], by, 0.85)], 13, sg);
  if (spoonIn < 0.5) {
    c.fillStyle = sg; ell(c, bx, by, 26, 38, spoonAng + Math.PI / 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3; ell(c, bx - 4, by - 4, 14, 24, spoonAng + Math.PI / 2); c.stroke();
  }
  c.fillStyle = HOST.skin; ell(c, handR[0], handR[1], 44, 50, spoonAng); c.fill();
  c.strokeStyle = HOST.skinS; c.lineWidth = 3;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(handR[0] - 18 + i * 14, handR[1] + 8, 14, 0.2, 2.2); c.stroke(); }
  c.fillStyle = HOST.skinL; ell(c, handR[0] + 14, handR[1] - 26, 26, 14, spoonAng); c.fill();
  c.restore();
}
function foreground(c) {
  const g = c.createLinearGradient(0, 1640, 0, H);
  g.addColorStop(0, '#efece6'); g.addColorStop(1, '#f8f6f2');
  c.fillStyle = g; c.fillRect(0, 1640, W, H - 1640);
  c.fillStyle = 'rgba(120,100,80,.18)'; c.fillRect(0, 1640, W, 6);
  // dish of banana coins and a second bowl on the counter edge
  c.fillStyle = 'rgba(80,60,40,.18)'; ell(c, 245, 1790, 150, 36); c.fill();
  c.fillStyle = '#fbfbfa'; ell(c, 240, 1750, 140, 44); c.fill();
  c.strokeStyle = 'rgba(160,155,148,.5)'; c.lineWidth = 2; c.stroke();
  for (const [dx, dy] of [[-60, -6], [-10, 4], [40, -10], [70, 8], [0, -18]]) { c.save(); c.translate(240 + dx, 1748 + dy); c.scale(1, 0.4); coin(c, 0, 0, 0.9, dx); c.restore(); }
  hostBowl(c, 860, 1710, 1.05, 0.3);
}
function S18(c, f, l) {
  c.drawImage(kitchenBg(), 0, 0);
  const toMouth = easeInOut(prog(l, 0, 8)), out = easeInOut(prog(l, 10, 17));
  const hand = [lerp(lerp(440, 478, toMouth), 420, out), lerp(lerp(820, 690, toMouth), 930, out)];
  const elbowR = [lerp(lerp(350, 390, toMouth), 330, out), lerp(lerp(1060, 1010, toMouth), 1090, out)];
  const spoonAng = lerp(lerp(-1.1, -0.95, toMouth), -1.25, out);
  const chewOn = l >= 12;
  const chew = chewOn ? Math.sin((l - 12) * 0.85) : 0;
  const mouthSt = l < 5 ? { open: 0.6 * easeOut(prog(l, 1, 5)), round: 0.5, smile: 0.2 }
    : l < 12 ? { open: 0, smile: 0.1 } : { open: 0, smile: 0.35, chew };
  host(c, {
    lean: easeInOut(prog(l, 0, 38)), handR: hand, elbowR, elbowL: [805, 1070], spoonAng, spoonIn: l >= 6 && l < 12 ? 1 : 0,
    bowl: { x: 650, y: 1070 + Math.sin(f * 0.3) * 3, s: 1, open: 0.35 }, mouthSt,
    eyesClosed: l >= 13 && l < 32 ? 1 : 0, brow: chewOn ? 0.6 : 0.2, nod: chewOn ? chew * 0.5 : 0, cheek: chewOn ? (chew + 1) / 2 : 0,
  });
  c.drawImage(cached('fg', W, H, k => blurred(k, foreground, 1.5)), 0, 0);
  lift(c, 0.04, '255,236,210');
}
function S19(c, f, l) {
  c.drawImage(kitchenBg(), 0, 0);
  const raise = easeOut(prog(l, 0, 6)), present = easeOut(prog(l, 0, 9));
  const hand = [lerp(420, 300, raise), lerp(930, 700, raise)];
  const elbowR = [lerp(330, 240, raise), lerp(1090, 960, raise)];
  // "So good" frames 458-475
  let mouthSt = { open: 0, smile: 0.7 };
  if (f >= 458 && f < 466) { const k = prog(f, 458, 461); mouthSt = { open: 0.75 * k, round: 0.85, smile: 0.1 }; }
  else if (f >= 466 && f < 471) mouthSt = { open: 0.45, round: 1, smile: 0 };
  else if (f >= 471 && f < 475) mouthSt = { open: 0.22, round: 0.4, smile: 0.4 };
  else if (f >= 475) mouthSt = { open: 0.32, round: 0, smile: 1 };
  host(c, {
    lean: 1 + 0.2 * Math.sin(l * 0.2), handR: hand, elbowR, elbowL: [lerp(805, 815, present), lerp(1070, 1130, present)], spoonAng: lerp(-1.25, -1.65, raise),
    bowl: { x: lerp(650, 640, present), y: lerp(1070, 1110, present), s: lerp(1, 1.25, present), open: lerp(0.35, 0.95, present) },
    mouthSt, eyesClosed: 0, brow: 0.8,
  });
  c.drawImage(cached('fg', W, H, k => blurred(k, foreground, 1.5)), 0, 0);
  lift(c, 0.04, '255,236,210');
}

/* ---------- compose ---------- */
const SHOT_FN = { S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15, S16, S17, S18, S19 };
export const CAPTION_FONT = '"Nunito","Varela Round","SF Pro Rounded",ui-rounded,"Quicksand","Arial Rounded MT Bold",system-ui,sans-serif';
function wrap(c, text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
export function drawCaption(c, f) {
  const cap = captionAt(f);
  if (!cap) return;
  c.save();
  const fs = 58, lh = fs * 1.24;
  c.font = `800 ${fs}px ${CAPTION_FONT}`;
  const lines = wrap(c, cap.text, 820);
  const tw = Math.max(...lines.map(s => c.measureText(s).width));
  const pw = tw + 90, ph = lines.length * lh + 52, y = 1350 - ph / 2;
  c.fillStyle = 'rgba(34,26,20,.42)'; rrect(c, (W - pw) / 2, y, pw, ph, Math.min(50, ph / 2)); c.fill();
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  lines.forEach((s, i) => c.fillText(s, W / 2, y + 26 + lh * (i + 0.5)));
  c.restore();
}
export function drawFrame(ctx, frame, opts = {}) {
  const f = ((Math.floor(frame) % TOTAL) + TOTAL) % TOTAL;
  const s = shotAt(f);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#f4f1ec'; ctx.fillRect(0, 0, W, H);
  SHOT_FN[s.id](ctx, f, f - s.a);
  ctx.restore();
  if (opts.captions !== false) drawCaption(ctx, f);
}
