'use strict';
// Draws the cursor themes of lampfish and makes their files for Windows. A style draws one image for a phase w in [0, 2pi):
// image k of n uses w = 2pi k / n, so the last image of a loop leads back to the first.
(function () {
// The same file runs in the page, for previews, and in a worker, which makes the files of a theme without freezing the page.
const canvas = size => new OffscreenCanvas(size, size);
const TAU = Math.PI * 2;

// ---------- Shapes, 32 unit grid ----------
function poly(pts) { const p = new Path2D(); pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; }
function circle(cx, cy, r, ccw = false) { const p = new Path2D(); p.moveTo(cx + (ccw ? r : r), cy); p.arc(cx, cy, r, 0, TAU, ccw); p.closePath(); return p; }
function ring(cx, cy, R, r) { const p = new Path2D(); p.moveTo(cx + R, cy); p.arc(cx, cy, R, 0, TAU, false); p.closePath(); p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU, true); p.closePath(); return p; }
function rrect(x, y, w, h, r) { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; }
// Arrows pointing along each direction from the centre: a0 = 0 for a straight double arrow, a0 = w for a cross.
function arms(dirs, a0, w = 1.35, base = 9.2, head = 4.2, tip = 14.2, c = 16) {
  const pts = [];
  for (const [dx, dy] of dirs) { const nx = -dy, ny = dx; for (const [p, a] of [[-w, a0], [-w, base], [-head, base], [0, tip], [head, base], [w, base]]) pts.push([c + a * dx + p * nx, c + a * dy + p * ny]); }
  return poly(pts);
}
const D = Math.SQRT1_2;
const ARROW_PTS = [[4, 3], [4, 22.5], [9, 18.2], [12.2, 25.5], [15.4, 24.1], [12.2, 17], [19, 17]];
const arrowPath = () => poly(ARROW_PTS);
function pen() {
  const N = [4.6, 27.4], E = [26.4, 5.6], len = Math.hypot(E[0] - N[0], E[1] - N[1]);
  const u = [(E[0] - N[0]) / len, (E[1] - N[1]) / len], n = [-u[1], u[0]], at = (d, s) => [N[0] + u[0] * d + n[0] * s, N[1] + u[1] * d + n[1] * s];
  const body = poly([N, at(6.2, 2.5), at(len - 1.2, 2.5), at(len, 1.3), at(len, -1.3), at(len - 1.2, -2.5), at(6.2, -2.5)]);
  const crease = new Path2D(); const a = at(6.2, 2.5), b = at(6.2, -2.5), c1 = at(len - 4.2, 2.5), c2 = at(len - 4.2, -2.5);
  crease.moveTo(...a); crease.lineTo(...b); crease.moveTo(...c1); crease.lineTo(...c2);
  return { parts: [body], crease, tip: N };
}
// Only the gaps between the folded fingers, never into the palm: longer lines read as bars across the hand.
const HAND_CREASES = (() => { const p = new Path2D(); for (const [x, y0, y1] of [[15.15, 13.5, 16.9], [19.25, 14.8, 17.3], [23.1, 16.1, 17.7]]) { p.moveTo(x, y0); p.lineTo(x, y1); } return p; })();
const BASE = {
  arrow: { parts: [arrowPath()], tip: [4, 3] },
  hand: { parts: [rrect(10.9, 3, 4.25, 16, [2.12, 2.12, 0, 0]), rrect(15.15, 11.4, 4.1, 8.6, [2.05, 2.05, 0, 0]), rrect(19.25, 12.7, 3.85, 8, [1.92, 1.92, 0, 0]), rrect(23.1, 14.2, 3.4, 6.8, [1.7, 1.7, 0, 0]),
      new Path2D('M10.9 16 L26.5 16 L26.5 22.6 C26.5 26.7 23.7 29.6 19.7 29.6 L15.6 29.6 C13 29.6 11.6 28.6 10.3 27 L5.1 20.6 C4.2 19.5 4.4 18 5.5 17.3 C6.6 16.6 8 16.9 8.9 17.9 L10.9 20.4 Z')],
    crease: HAND_CREASES, tip: [13.02, 3], dir: [5, 26] },
  help: { parts: [arrowPath(), circle(23, 22.4, 6.3)], glyph: { stroke: new Path2D('M20.9 20.6 a2.15 2.15 0 1 1 3.1 1.95 c-.72 .38 -1.05 .82 -1.05 1.55 v.35'), dot: [22.95, 26.3] }, tip: [4, 3] },
  appstarting: { parts: [arrowPath(), ring(23.2, 23, 5.6, 3)], badge: { c: [23.2, 23], r: 4.3 }, tip: [4, 3] },
  wait: { parts: [ring(16, 16, 10.5, 6)], ring: { c: [16, 16], r: 8.25 }, center: true },
  crosshair: { parts: [rrect(14.9, 3, 2.2, 9.6, 1.1), rrect(14.9, 19.4, 2.2, 9.6, 1.1), rrect(3, 14.9, 9.6, 2.2, 1.1), rrect(19.4, 14.9, 9.6, 2.2, 1.1), circle(16, 16, 1.35)], center: true },
  ibeam: { parts: [new Path2D('M10 3.2 h12 v2.6 h-4.7 v20.4 h4.7 v2.6 H10 v-2.6 h4.7 V5.8 H10 Z')], center: true },
  nwpen: (() => { const p = pen(); return { parts: p.parts, crease: p.crease, tip: p.tip, dir: [16, -16] }; })(),
  no: (() => { const r = new Path2D(); r.addPath(poly([[-7.4, -1.55], [7.4, -1.55], [7.4, 1.55], [-7.4, 1.55]]), new DOMMatrix().translate(16, 16).rotate(45)); return { parts: [ring(16, 16, 10.6, 7.4), r], center: true }; })(),
  sizens: { parts: [arms([[0, -1], [0, 1]], 0, 1.35, 8.6, 4.4, 13.6)], center: true },
  sizewe: { parts: [arms([[-1, 0], [1, 0]], 0, 1.35, 8.6, 4.4, 13.6)], center: true },
  sizenwse: { parts: [arms([[-D, -D], [D, D]], 0, 1.35, 7.6, 4.2, 12.4)], center: true },
  sizenesw: { parts: [arms([[D, -D], [-D, D]], 0, 1.35, 7.6, 4.2, 12.4)], center: true },
  move: { parts: [arms([[0, -1], [1, 0], [0, 1], [-1, 0]], 1.35)], center: true },
  uparrow: { parts: [poly([[16, 3], [22.6, 12], [17.7, 12], [17.7, 28.6], [14.3, 28.6], [14.3, 12], [9.4, 12]])], tip: [16, 3], dir: [0, 25] },
  pin: { parts: [arrowPath(), circle(23.2, 19.6, 4.7), poly([[19, 21.7], [23.2, 29.4], [27.4, 21.7]])], glyph: { hole: [23.2, 19.6, 1.75] }, tip: [4, 3] },
  person: { parts: [arrowPath(), circle(23.2, 17.2, 3), new Path2D('M17.6 29 C17.6 24.6 20 22 23.2 22 C26.4 22 28.8 24.6 28.8 29 Z')], tip: [4, 3] },
};
const ROLES = ['arrow', 'help', 'appstarting', 'wait', 'crosshair', 'ibeam', 'nwpen', 'no', 'sizens', 'sizewe', 'sizenwse', 'sizenesw', 'move', 'uparrow', 'hand', 'pin', 'person'];
const ROLE_FILE = { arrow: 'Arrow', help: 'Help', appstarting: 'AppStarting', wait: 'Wait', crosshair: 'Crosshair', ibeam: 'IBeam', nwpen: 'NWPen', no: 'No', sizens: 'SizeNS', sizewe: 'SizeWE', sizenwse: 'SizeNWSE', sizenesw: 'SizeNESW', move: 'SizeAll', uparrow: 'UpArrow', hand: 'Hand', pin: 'Pin', person: 'Person' };

const shapeCache = {};
function shape(name, inset = .92) {
  const key = name + '|' + inset;
  if (shapeCache[key]) return shapeCache[key];
  const b = BASE[name];
  const m = new DOMMatrix().translate(16, 16).scale(inset).translate(-16, -16).translate(b.center ? 0 : 1.6, b.center ? 0 : 1.4);
  const tp = p => { const q = m.transformPoint(new DOMPoint(p[0], p[1])); return [q.x, q.y]; };
  const path = new Path2D(); for (const part of b.parts) path.addPath(part, m);
  const s = { key, name, path, m, inset, center: !!b.center, tip: b.tip ? tp(b.tip) : [16, 16], dir: b.dir || [11, 22] };
  if (b.crease) { s.crease = new Path2D(); s.crease.addPath(b.crease, m); }
  if (b.glyph) {
    s.glyph = {};
    if (b.glyph.stroke) { s.glyph.stroke = new Path2D(); s.glyph.stroke.addPath(b.glyph.stroke, m); s.glyph.dot = tp(b.glyph.dot); }
    if (b.glyph.hole) { const [x, y] = tp(b.glyph.hole); s.glyph.hole = [x, y, b.glyph.hole[2] * inset]; }
  }
  if (b.ring) s.ring = { c: tp(b.ring.c), r: b.ring.r * inset };
  if (b.badge) s.badge = { c: tp(b.badge.c), r: b.badge.r * inset };
  const probe = canvas(32).getContext('2d');
  s.inside = (x, y) => probe.isPointInPath(path, x, y);
  return (shapeCache[key] = s);
}

// ---------- Helpers ----------
// Canvases that are read back stay in memory rather than on the graphics card: reading them is then cheap.
let CPU = false;
function layer(size) { const c = canvas(size); const x = c.getContext('2d', { willReadFrequently: CPU }); x.setTransform(size / 32, 0, 0, size / 32, 0, 0); return [c, x]; }
function stamp(x, c) { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(c, 0, 0); x.restore(); }
const layers = new Map();
function cached(key, make) { let c = layers.get(key); if (!c) { c = make(); layers.set(key, c); } return c; }
// Band outside the outline, between distances a and b, without the seams of a shape made of several parts.
function band(s, size, a, b, color) {
  return cached(`b|${s.key}|${size}|${a}|${b}|${color}`, () => {
    const [c, x] = layer(size);
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.lineWidth = 2 * b; x.strokeStyle = color; x.stroke(s.path);
    x.globalCompositeOperation = 'destination-out'; x.fill(s.path);
    if (a > 0) { x.lineWidth = 2 * a; x.strokeStyle = '#000'; x.stroke(s.path); }
    return c;
  });
}
// Strip just inside the edge, on the side opposite to (dx, dy): a bevel without seams.
function inner(s, size, dx, dy) {
  return cached(`i|${s.key}|${size}|${dx}|${dy}`, () => {
    const [c, x] = layer(size);
    x.fillStyle = '#fff'; x.fill(s.path);
    x.globalCompositeOperation = 'destination-out'; x.save(); x.translate(dx, dy); x.fill(s.path); x.restore();
    return c;
  });
}
function paint(src, size, make) { const c = canvas(size); const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.setTransform(size / 32, 0, 0, size / 32, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = make(x); x.fillRect(-2, -2, 36, 36); return c; }
function seeded(seed) { let v = seed >>> 0; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 4294967296; }; }
function glow(x, k, blur, color) { x.shadowColor = color; x.shadowBlur = blur * k; x.shadowOffsetX = 0; x.shadowOffsetY = 0; }
function noGlow(x) { x.shadowColor = 'transparent'; x.shadowBlur = 0; }
function lin(x, ax, stops) { const g = x.createLinearGradient(ax[0], ax[1], ax[2], ax[3]); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function conic(x, a, cx, cy, cols) { const g = x.createConicGradient(a, cx, cy); cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c)); return g; }
// Gradients run from the click point along the body of the shape.
const AXIS = s => s.center ? [16, 4, 16, 28] : [s.tip[0], s.tip[1], s.tip[0] + s.dir[0], s.tip[1] + s.dir[1]];
// Busy arc on the ring of Wait and on the badge of AppStarting, two turns per loop.
function busyArc(x, s, color, w, width = 3) {
  for (const r of [s.ring, s.badge]) {
    if (!r) continue;
    const thin = r === s.badge ? .62 : 1;
    x.save(); x.translate(r.c[0], r.c[1]); x.rotate(w * 2);
    x.beginPath(); x.arc(0, 0, r.r, -Math.PI / 2, 0); x.lineWidth = width * thin; x.lineCap = 'round'; x.strokeStyle = color; x.stroke();
    x.restore();
  }
}
function star(x, cx, cy, r, color, alpha) {
  if (alpha <= 0) return;
  x.save(); x.globalAlpha = alpha; x.translate(cx, cy);
  for (const [w, len] of [[.32, r], [.2, r * .55]]) {
    for (let i = 0; i < 4; i++) {
      x.rotate(Math.PI / 2);
      const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, -w); x.lineTo(len, 0); x.lineTo(0, w); x.closePath(); x.fill();
    }
    x.rotate(Math.PI / 4);
  }
  x.restore();
}
function finish(ctx, size, L, shadow = .35) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = `rgba(0,0,0,${shadow})`; ctx.shadowBlur = size / 32 * 1.4; ctx.shadowOffsetY = size / 32 * .8;
  ctx.drawImage(L, 0, 0); ctx.restore();
}
const wave = (w, k = 1, p = 0) => Math.sin(w * k + p);        // k whole: loops exactly
const frac = (w, k = 1, p = 0) => (((w * k / TAU + p) % 1) + 1) % 1;
// Glyphs and creases go on top of the body: the ? of Help, the hole of Pin, the folds of the hand and the pen.
function details(x, s, crease, ink) {
  if (s.crease) { x.save(); x.clip(s.path); x.strokeStyle = crease; x.lineWidth = .6; x.lineCap = 'round'; x.stroke(s.crease); x.restore(); }
  if (s.glyph) {
    x.save();
    if (s.glyph.stroke) { x.strokeStyle = ink; x.lineWidth = 1.45; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke(s.glyph.stroke); x.fillStyle = ink; x.beginPath(); x.arc(s.glyph.dot[0], s.glyph.dot[1], .9, 0, TAU); x.fill(); }
    if (s.glyph.hole) { x.fillStyle = ink; x.beginPath(); x.arc(...s.glyph.hole, 0, TAU); x.fill(); }
    x.restore();
  }
}
// Where a lamp or a spark sits: the click point for pointers, the centre for the rest.
const lampAt = s => s.center ? [16, 16] : s.tip;

// ---------- Styles: (ctx, size, s, th, w, anim) ----------
const STYLES = {
  flat(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    stamp(x, band(s, size, 0, 1.15, th.edge));
    x.fillStyle = s.center ? th.body : lin(x, AXIS(s), [[0, th.lamp], [.3, th.body], [1, th.body]]); x.fill(s.path);
    if (s.name === 'move' || s.name === 'crosshair') { x.beginPath(); x.arc(16, 16, 1.9 * s.inset, 0, TAU); x.fillStyle = th.lamp; x.fill(); }
    details(x, s, th.crease, th.ink);
    busyArc(x, s, th.lamp, w);
    finish(ctx, size, L);
  },
  glass(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    stamp(x, band(s, size, 0, 1.1, th.rim));
    x.fillStyle = lin(x, [0, 2, 0, 30], [[0, th.top], [1, th.bottom]]); x.fill(s.path);
    x.save(); x.clip(s.path);
    const h = x.createRadialGradient(9, 5, 0, 9, 5, 15); h.addColorStop(0, 'rgba(255,255,255,.42)'); h.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = h; x.fillRect(0, 0, 32, 32);
    if (anim) { const p = frac(w) * 64 - 16; x.fillStyle = lin(x, [p - 6, p - 6, p + 6, p + 6], [[0, 'rgba(255,255,255,0)'], [.5, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, 32, 32); }
    x.restore();
    details(x, s, th.crease, th.ink);
    busyArc(x, s, th.glow, w);
    finish(ctx, size, L, .4);
  },
  metal(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    stamp(x, band(s, size, 0, .9, th.edge));
    x.fillStyle = lin(x, [2, 2, 26, 30], th.stops); x.fill(s.path);
    stamp(x, paint(inner(s, size, .65, .75), size, () => th.light));
    stamp(x, paint(inner(s, size, -.55, -.65), size, () => th.shade));
    if (anim) { const p = frac(w) * 72 - 20; stamp(x, paint(inner(s, size, 99, 99), size, c => lin(c, [p - 7, p - 7, p + 7, p + 7], [[0, 'rgba(255,255,255,0)'], [.5, 'rgba(255,255,255,.75)'], [1, 'rgba(255,255,255,0)']]))); }
    details(x, s, th.crease, th.ink);
    busyArc(x, s, th.arc, w, 2.6);
    if (!s.center) { const [lx, ly] = lampAt(s); star(x, lx + 1.1, ly + 2.2, 3.2, th.spark, anim ? Math.max(0, wave(w, 2)) : .8); }
    finish(ctx, size, L, .45);
  },
  lacquer(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    stamp(x, band(s, size, 1.0, 1.35, '#000'));
    stamp(x, paint(band(s, size, 0, 1.0, '#fff'), size, c => lin(c, [2, 2, 26, 30], th.rim)));
    x.fillStyle = lin(x, [0, 2, 0, 30], [[0, '#3a3d3f'], [.35, '#101112'], [1, '#000']]); x.fill(s.path);
    stamp(x, paint(inner(s, size, .6, .7), size, () => 'rgba(255,255,255,.28)'));
    x.save(); x.clip(s.path);
    x.fillStyle = lin(x, [0, 0, 18, 18], [[0, 'rgba(255,255,255,.22)'], [.45, 'rgba(255,255,255,.06)'], [.46, 'rgba(255,255,255,0)']]); x.fillRect(0, 0, 32, 32);
    if (anim) { const p = frac(w) * 72 - 20; x.fillStyle = lin(x, [p - 5, p - 5, p + 5, p + 5], [[0, 'rgba(255,240,200,0)'], [.5, 'rgba(255,240,200,.3)'], [1, 'rgba(255,240,200,0)']]); x.fillRect(0, 0, 32, 32); }
    x.restore();
    details(x, s, th.crease, th.ink);
    busyArc(x, s, th.arc, w, 2.4);
    if (!s.center) { const [lx, ly] = lampAt(s); star(x, lx + 1.1, ly + 2.2, 3.2, th.spark, anim ? Math.max(0, wave(w, 2)) : .8); }
    finish(ctx, size, L, .45);
  },
  photophore(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size), k = size / 32;
    stamp(x, band(s, size, .7, 1.15, th.halo));
    stamp(x, band(s, size, 0, .7, th.rim));
    x.fillStyle = lin(x, AXIS(s), [[0, th.body[0]], [1, th.body[1]]]); x.fill(s.path);
    x.save(); x.clip(s.path);
    // Evenly spread lights: a new light keeps its distance from the others.
    const dots = s.dots || (s.dots = (() => { const r = seeded(11 + s.name.length * 7), d = []; for (let i = 0; i < 2500 && d.length < 34; i++) { const px = r() * 32, py = r() * 32; if (![[0, 0], [.8, 0], [-.8, 0], [0, .8], [0, -.8]].every(([a, b]) => s.inside(px + a, py + b))) continue; if (d.some(q => Math.hypot(q[0] - px, q[1] - py) < 2.1)) continue; d.push([px, py, .28 + r() * .32, r() * TAU]); } return d; })());
    for (const [px, py, rad, ph] of dots) {
      const [lx, ly] = lampAt(s), near = 1 - Math.hypot(px - lx, py - ly) / (s.center ? 16 : 26);
      const a = Math.max(.25, Math.min(1, .35 + near * .8)) * (anim ? .55 + .45 * wave(w, 2, ph) : 1);
      glow(x, k, 2.2, `rgba(${th.glow},${a})`);
      x.beginPath(); x.arc(px, py, rad, 0, TAU); x.fillStyle = `rgba(${th.dot},${a})`; x.fill();
    }
    x.restore();
    if (!s.center || s.name === 'move' || s.name === 'crosshair') { const [lx, ly] = s.center ? [16, 16] : [s.tip[0] + .9, s.tip[1] + 1.6]; glow(x, k, 3, `rgb(${th.glow})`); x.beginPath(); x.arc(lx, ly, .9, 0, TAU); x.fillStyle = `rgb(${th.dot})`; x.fill(); }
    noGlow(x);
    for (const r of [s.ring, s.badge]) if (r) for (let i = 0; i < 12; i++) {
      const ang = i / 12 * TAU - Math.PI / 2, lit = ((i - frac(w, 2) * 12) % 12 + 12) % 12, a = lit < 1 ? 1 : lit > 8 ? .2 + (lit - 8) * .15 : .2;
      glow(x, k, 2.4, `rgba(${th.glow},${a})`); x.beginPath(); x.arc(r.c[0] + Math.cos(ang) * r.r * .92, r.c[1] + Math.sin(ang) * r.r * .92, r === s.badge ? .5 : .85, 0, TAU); x.fillStyle = `rgba(${th.dot},${a})`; x.fill();
    }
    noGlow(x);
    details(x, s, `rgba(${th.dot},.35)`, `rgb(${th.dot})`);
    finish(ctx, size, L, .45);
  },
  nacre(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    if (th.halo) stamp(x, band(s, size, .8, 1.25, th.halo));
    stamp(x, band(s, size, 0, th.halo ? .8 : 1.0, th.edge));
    x.fillStyle = conic(x, .6 + (anim ? w : 0), 15, 15, th.stops); x.fill(s.path);
    x.save(); x.clip(s.path);
    const h = x.createRadialGradient(10, 7, 0, 10, 7, 13); h.addColorStop(0, `rgba(255,255,255,${th.shine})`); h.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = h; x.fillRect(0, 0, 32, 32);
    x.fillStyle = lin(x, [0, 10, 0, 32], [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.2)']]); x.fillRect(0, 0, 32, 32);
    x.restore();
    stamp(x, paint(inner(s, size, .6, .7), size, () => 'rgba(255,255,255,.5)'));
    details(x, s, th.crease, th.edge);
    busyArc(x, s, th.arc, w, 2.4);
    finish(ctx, size, L, .35);
  },
  depth(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size), k = size / 32;
    stamp(x, band(s, size, .8, 1.25, 'rgba(220,240,255,.5)'));
    stamp(x, band(s, size, 0, .8, th.edge));
    x.fillStyle = lin(x, AXIS(s), th.stops); x.fill(s.path);
    x.save(); x.clip(s.path);
    x.strokeStyle = th.caustic; x.lineWidth = .45;
    for (let i = 0; i < 7; i++) { x.beginPath(); for (let px = 0; px <= 32; px += .8) { const py = i * 4.6 + 2 + Math.sin(px * .55 + i * 1.7 + (anim ? w : 0)) * 1.1 + Math.sin(px * .23 + i) * .8; px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    x.restore();
    if (!s.center) { glow(x, k, 3, th.lamp); x.beginPath(); x.arc(s.tip[0] + .9, s.tip[1] + 1.6, .75, 0, TAU); x.fillStyle = '#fff'; x.fill(); noGlow(x); }
    details(x, s, th.crease, th.ink);
    busyArc(x, s, th.arc, w, 2.2);
    finish(ctx, size, L, .4);
  },
  neon(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size), k = size / 32;
    x.fillStyle = 'rgba(3,10,12,.8)'; x.fill(s.path);
    stamp(x, band(s, size, 1.35, 1.85, 'rgba(2,6,8,.9)'));
    const flick = anim ? .82 + .18 * wave(w, 19) * wave(w, 6) : 1;
    x.save(); glow(x, k, 3.2, th.tube); x.globalAlpha = flick; stamp(x, band(s, size, 0, 1.35, th.tube)); x.restore();
    stamp(x, band(s, size, .45, .9, th.core));
    x.save(); x.globalAlpha = .55; details(x, s, th.tube, th.core); x.restore();
    x.save(); glow(x, k, 3, th.tube); busyArc(x, s, th.core, w, 1.6); x.restore();
    finish(ctx, size, L, .2);
  },
  scales(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    stamp(x, band(s, size, .8, 1.25, 'rgba(200,255,250,.5)'));
    stamp(x, band(s, size, 0, .8, '#03181a'));
    x.fillStyle = lin(x, [0, 2, 0, 30], [[0, '#3fe6d3'], [.5, '#0F9D8F'], [1, '#064843']]); x.fill(s.path);
    x.save(); x.clip(s.path);
    x.lineWidth = .42;
    const shimmer = anim ? frac(w) * 84 - 10 : -99;
    for (let row = 0; row < 14; row++) for (let col = -1; col < 12; col++) {
      const cx = col * 3 + (row % 2 ? 1.5 : 0), cy = row * 2.3 + 1, lit = Math.max(0, 1 - Math.abs(cx + cy - shimmer) / 4);
      x.beginPath(); x.arc(cx, cy, 1.65, .1, Math.PI - .1); x.strokeStyle = 'rgba(2,30,28,.55)'; x.stroke();
      x.beginPath(); x.arc(cx, cy - .35, 1.2, .5, Math.PI - .5); x.strokeStyle = `rgba(220,255,250,${.28 + lit * .6})`; x.stroke();
    }
    const [lx, ly] = lampAt(s), h = x.createRadialGradient(lx, ly, 0, lx, ly, 9); h.addColorStop(0, 'rgba(230,255,252,.75)'); h.addColorStop(1, 'rgba(230,255,252,0)'); x.fillStyle = h; x.fillRect(0, 0, 32, 32);
    x.restore();
    details(x, s, 'rgba(3,24,26,.6)', '#03181a');
    busyArc(x, s, '#eafffd', w, 2.2);
    finish(ctx, size, L, .4);
  },
  origami(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    stamp(x, band(s, size, .75, 1.2, 'rgba(200,255,250,.5)'));
    stamp(x, band(s, size, 0, .75, '#041a1c'));
    x.save(); x.clip(s.path);
    const r = seeded(31), step = 4.2, light = anim ? wave(w) * .12 : 0;
    for (let gy = -1; gy < 9; gy++) for (let gx = -1; gx < 9; gx++) {
      const ox = gx * step + (gy % 2 ? step / 2 : 0), oy = gy * step * .87;
      for (const tri of [[[ox, oy], [ox + step, oy], [ox + step / 2, oy + step * .87]], [[ox + step, oy], [ox + step * 1.5, oy + step * .87], [ox + step / 2, oy + step * .87]]]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const v = Math.max(0, Math.min(1, .78 - (cx + cy) / 64 * .7 + (r() - .5) * .34 + light));
        x.fillStyle = `rgb(${[6, 58, 58].map((c, i) => Math.round(c + ([120, 245, 230][i] - c) * v)).join(',')})`;
        x.beginPath(); x.moveTo(...tri[0]); x.lineTo(...tri[1]); x.lineTo(...tri[2]); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = .15; x.stroke();
      }
    }
    x.restore();
    details(x, s, 'rgba(4,26,28,.55)', '#041a1c');
    busyArc(x, s, '#eafffd', w, 2.2);
    finish(ctx, size, L, .45);
  },
  riso(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    const off = band(s, size, 0, 1.15, '#1EBBAA'); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(off, .75 * size / 32, .65 * size / 32); x.restore();
    stamp(x, band(s, size, 0, 1.05, '#0b1a1d'));
    x.fillStyle = '#f6f3ec'; x.fill(s.path);
    x.save(); x.clip(s.path); x.fillStyle = '#17b3a2';
    const [lx, ly] = lampAt(s);
    for (let i = -20; i < 40; i++) for (let j = -20; j < 40; j++) {
      const u = i * 1.45, v = j * 1.45, px = 16 + (u - 16) * Math.cos(.26) - (v - 16) * Math.sin(.26), py = 16 + (u - 16) * Math.sin(.26) + (v - 16) * Math.cos(.26);
      if (px < -1 || py < -1 || px > 33 || py > 33) continue;
      const d = Math.hypot(px - lx, py - ly) / (s.center ? 13 : 22), rad = Math.max(0, (1 - d) * .62 + (anim ? wave(w, 2, -d * 6) * .12 : 0));
      if (rad > .08) { x.beginPath(); x.arc(px, py, rad, 0, TAU); x.fill(); }
    }
    x.restore();
    details(x, s, 'rgba(11,26,29,.7)', '#0b1a1d');
    busyArc(x, s, '#0b1a1d', w, 2.2);
    finish(ctx, size, L, .25);
  },
  bubble(ctx, size, s, th, w, anim) {
    const [L, x] = layer(size);
    x.fillStyle = 'rgba(190,255,248,.18)'; x.fill(s.path);
    stamp(x, band(s, size, .95, 1.5, 'rgba(8,23,26,.78)'));
    stamp(x, paint(band(s, size, 0, .95, '#fff'), size, c => conic(c, (anim ? w : 0) + 1, 16, 16, ['#7ffff0', '#b7a7ff', '#ffb3dd', '#ffe9a8', '#8af5e6', '#7ffff0'])));
    x.save(); x.clip(s.path);
    const [lx, ly] = lampAt(s), h = x.createRadialGradient(lx + 3, ly + 4, 0, lx + 3, ly + 4, 7); h.addColorStop(0, 'rgba(255,255,255,.55)'); h.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = h; x.fillRect(0, 0, 32, 32);
    x.restore();
    x.beginPath(); x.arc(s.center ? 13 : s.tip[0] + 2.2, s.center ? 12 : s.tip[1] + 6, .75, 0, TAU); x.fillStyle = '#fff'; x.fill();
    details(x, s, 'rgba(255,255,255,.7)', '#ffffff');
    busyArc(x, s, 'rgba(255,255,255,.95)', w, 1.6);
    finish(ctx, size, L, .18);
  },
};


// ---------- Themes ----------
// One family per look, its variants as colours. The name of a theme is its folder, its scheme in Windows and its name in lampfish.
// Shown in this order, each with a different colour first, so the page is not a wall of turquoise.
const FAMILIES = [
  { key: 'photophore', name: 'Photophore', variants: [
    { variant: 'Ember', swatch: '#ff7a3d', style: 'photophore', body: ['#25100a', '#070302'], rim: '#7a2e16', halo: 'rgba(255,170,130,.45)', dot: '255,228,205', glow: '255,120,60' },
    { variant: 'Gold', swatch: '#ffc45a', style: 'photophore', body: ['#1d160a', '#060402'], rim: '#6b5320', halo: 'rgba(255,226,150,.45)', dot: '255,240,200', glow: '255,196,80' },
    { variant: 'Berry', swatch: '#a882ff', style: 'photophore', body: ['#1a0f2e', '#06030c'], rim: '#5b3fa0', halo: 'rgba(200,170,255,.45)', dot: '235,220,255', glow: '170,130,255' },
    { variant: 'Abyss', swatch: '#2ED9C6', style: 'photophore', body: ['#0a2226', '#020607'], rim: '#1b6f69', halo: 'rgba(150,255,243,.45)', dot: '200,255,248', glow: '80,255,235' },
  ] },
  { key: 'nacre', name: 'Nacre', variants: [
    { variant: 'Rose', swatch: '#f3c2b4', style: 'nacre', stops: ['#fff1ea', '#f5c9b8', '#ffe3d1', '#f2b8c6', '#fff4d6', '#f8d6c8', '#fff1ea'], edge: '#4a2a22', shine: .7, arc: '#a8634f', crease: 'rgba(74,42,34,.4)' },
    { variant: 'Pearl', swatch: '#d8f2ee', style: 'nacre', stops: ['#e8fffb', '#a9efe6', '#d8d0ff', '#ffd3ea', '#fff3cf', '#b8f5ea', '#e8fffb'], edge: '#13262b', shine: .75, arc: '#0F9D8F', crease: 'rgba(19,38,43,.4)' },
    { variant: 'Black Pearl', swatch: '#2f4a4e', style: 'nacre', stops: ['#33464b', '#1b5a58', '#3d3366', '#5a2d4a', '#55502e', '#22605a', '#33464b'], edge: '#030607', halo: 'rgba(200,240,235,.5)', shine: .35, arc: '#9ff5ea', crease: 'rgba(200,240,235,.35)' },
  ] },
  { key: 'deep', name: 'Deep', variants: [
    { variant: 'Midnight', swatch: '#5b8cff', style: 'depth', stops: [[0, '#dce8ff'], [.22, '#5b8cff'], [.6, '#1b2f7a'], [1, '#070a24']], edge: '#02040f', caustic: 'rgba(210,225,255,.22)', lamp: '#9ab8ff', arc: '#dce8ff', crease: 'rgba(2,4,15,.5)', ink: '#02040f' },
    { variant: 'Sunset', swatch: '#ff9a5c', style: 'depth', stops: [[0, '#fff1c9'], [.22, '#ffb35c'], [.6, '#c2416b'], [1, '#2a0f3a']], edge: '#1a0612', caustic: 'rgba(255,240,220,.25)', lamp: '#ffd27a', arc: '#fff1c9', crease: 'rgba(26,6,18,.5)', ink: '#1a0612' },
    { variant: 'Lagoon', swatch: '#1EBBAA', style: 'depth', stops: [[0, '#c8fff8'], [.22, '#2ED9C6'], [.6, '#0d5d70'], [1, '#081a36']], edge: '#020c12', caustic: 'rgba(220,255,252,.22)', lamp: '#7ffff0', arc: '#d9fffa', crease: 'rgba(2,12,18,.5)', ink: '#020c12' },
  ] },
  { key: 'neon', name: 'Neon', variants: [
    { variant: 'Pink', swatch: '#ff4fd8', style: 'neon', tube: '#ff4fd8', core: 'rgba(255,235,250,.95)' },
    { variant: 'Amber', swatch: '#ffc23d', style: 'neon', tube: '#ffc23d', core: 'rgba(255,248,225,.95)' },
    { variant: 'Violet', swatch: '#a37bff', style: 'neon', tube: '#a37bff', core: 'rgba(240,232,255,.95)' },
    { variant: 'Teal', swatch: '#2ED9C6', style: 'neon', tube: '#2ED9C6', core: 'rgba(235,255,252,.95)' },
  ] },
  { key: 'metal', name: 'Metal', variants: [
    { variant: 'Silver', swatch: '#cfd8db', style: 'metal', stops: [[0, '#ffffff'], [.16, '#d7dee1'], [.34, '#7d898e'], [.5, '#f4f8f9'], [.66, '#b9c3c7'], [.84, '#59656a'], [1, '#d9e0e3']], edge: '#1a2023', light: 'rgba(255,255,255,.9)', shade: 'rgba(20,28,32,.5)', arc: '#1EBBAA', spark: '#ffffff', crease: 'rgba(26,32,35,.5)', ink: '#1a2023' },
    { variant: 'Rose Gold', swatch: '#e8a690', style: 'metal', stops: [[0, '#ffeee6'], [.16, '#f0b8a4'], [.34, '#a8634f'], [.5, '#ffd9cb'], [.66, '#d9937c'], [.84, '#7e3f31'], [1, '#ecb19c']], edge: '#3a1a12', light: 'rgba(255,240,232,.85)', shade: 'rgba(70,25,15,.5)', arc: '#3a1a12', spark: '#fff4ee', crease: 'rgba(58,26,18,.5)', ink: '#3a1a12' },
    { variant: 'Black Chrome', swatch: '#1b1f21', style: 'lacquer', rim: [[0, '#ffffff'], [.2, '#aab4b8'], [.45, '#4a5458'], [.6, '#f2f6f7'], [.8, '#6d787c'], [1, '#d9e0e3']], arc: '#d9e0e3', spark: '#ffffff', crease: 'rgba(217,224,227,.5)', ink: '#d9e0e3' },
    { variant: 'Anodized', swatch: '#1EBBAA', style: 'metal', stops: [[0, '#d6fff9'], [.16, '#4fe3d2'], [.34, '#0d7a70'], [.5, '#9ff5ea'], [.66, '#1EBBAA'], [.84, '#07463f'], [1, '#3fd6c4']], edge: '#02201c', light: 'rgba(230,255,252,.8)', shade: 'rgba(0,40,36,.55)', arc: '#02201c', spark: '#f0fffd', crease: 'rgba(2,32,28,.55)', ink: '#02201c' },
  ] },
  { key: 'riso', name: 'Riso', variants: [{ variant: '', swatch: '#f6f3ec', style: 'riso' }] },
  { key: 'scale', name: 'Scale', variants: [{ variant: '', swatch: '#0F9D8F', style: 'scales' }] },
  { key: 'bubble', name: 'Bubble', variants: [{ variant: '', swatch: '#c9b8ff', style: 'bubble' }] },
  { key: 'origami', name: 'Origami', variants: [{ variant: '', swatch: '#4fd6c6', style: 'origami' }] },
  { key: 'flat', name: 'Flat', variants: [
    { variant: 'Foam', swatch: '#f6fbfa', style: 'flat', body: '#f6fbfa', edge: '#08171A', lamp: '#0F9D8F', crease: 'rgba(8,23,26,.45)', ink: '#08171A' },
    { variant: 'Lagoon', swatch: '#13a898', style: 'flat', body: '#13a898', edge: '#08171A', lamp: '#eafffc', crease: 'rgba(8,23,26,.5)', ink: '#08171A' },
    { variant: 'Abyss', swatch: '#0b1d20', style: 'flat', body: '#0b1d20', edge: '#2ED9C6', lamp: '#8ffff2', crease: 'rgba(46,217,198,.6)', ink: '#2ED9C6' },
  ] },
  { key: 'glass', name: 'Glass', variants: [
    { variant: 'Foam', swatch: '#ffffff', style: 'glass', top: '#ffffff', bottom: '#c7ebe6', rim: '#08171A', glow: '#1EBBAA', crease: 'rgba(8,23,26,.4)', ink: '#08171A' },
    { variant: 'Lagoon', swatch: '#6ff3e1', style: 'glass', top: '#6ff3e1', bottom: '#0a7f74', rim: '#effffd', glow: '#2ED9C6', crease: 'rgba(3,40,36,.45)', ink: '#03201d' },
    { variant: 'Abyss', swatch: '#16494b', style: 'glass', top: '#16494b', bottom: '#031416', rim: '#5ff0de', glow: '#2ED9C6', crease: 'rgba(95,240,222,.45)', ink: '#5ff0de' },
  ] },
];
const THEME = {};
for (const f of FAMILIES) for (const v of f.variants) { v.name = ('lampfish ' + f.name + ' ' + v.variant).trim(); v.family = f.key; THEME[v.name] = v; }

// ---------- Rendering ----------
function drawTheme(target, px, theme, role, w = 0, anim = false) {
  const ctx = target.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, target.width, target.height);
  const s = shape(role, theme.inset || .92);
  ctx.setTransform(px / 32, 0, 0, px / 32, 0, 0);
  STYLES[theme.style](ctx, px, s, theme, w, anim);
  // The click point is the visible tip, outline included.
  const edge = s.center || theme.tipEdge === 0 ? 0 : .9;
  return [(s.tip[0] - edge * .45) * px / 32, (s.tip[1] - edge * .8) * px / 32];
}

// ---------- Files for Windows ----------
// Frames are stored as PNG inside the .cur and .ani containers, which Windows reads since Vista: a theme weighs about 1 MB.
const VERSION = '2';
const LOOP = 2.4, BUSY_FRAMES = 24, FRAMES = 12;
const SIZES_ANI = [32, 48, 64, 96], SIZES_CUR = [32, 48, 64, 96, 128];
const MOVING = theme => theme.style !== 'flat';
const BUSY = role => role === 'wait' || role === 'appstarting';

// PNG written here from the pixels: canvas.toBlob takes 15 to 40 ms an image in WebView2, this takes about one.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function pngChunk(tag, data) {
  const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function png(canvas) {
  const w = canvas.width, h = canvas.height, px = canvas.getContext('2d').getImageData(0, 0, w, h).data, row = w * 4;
  // Each row is stored as its difference with the pixel to its left (filter Sub), which deflate packs much better.
  const raw = new Uint8Array((row + 1) * h);
  for (let y = 0; y < h; y++) {
    const at = y * (row + 1), src = y * row;
    raw[at] = 1;
    for (let x = 0; x < row; x++) raw[at + 1 + x] = (px[src + x] - (x >= 4 ? px[src + x - 4] : 0)) & 255;
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  const idat = new Uint8Array(await new Response(stream).arrayBuffer());
  const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  return join([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))]);
}
function sizes(theme, role, w, anim, list) {
  return Promise.all(list.map(size => {
    const c = canvas(size); c.getContext('2d', { willReadFrequently: true });
    const [hx, hy] = drawTheme(c, size, theme, role, w, anim);
    return png(c).then(data => ({ size, hx: Math.max(0, Math.min(size - 1, Math.round(hx))), hy: Math.max(0, Math.min(size - 1, Math.round(hy))), data }));
  }));
}
function join(parts) { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; }
function cur(images) {
  const head = new DataView(new ArrayBuffer(6 + 16 * images.length));
  head.setUint16(2, 2, true); head.setUint16(4, images.length, true);
  let offset = 6 + 16 * images.length;
  images.forEach((im, i) => {
    const e = 6 + 16 * i;
    head.setUint8(e, im.size % 256); head.setUint8(e + 1, im.size % 256);
    head.setUint16(e + 4, im.hx, true); head.setUint16(e + 6, im.hy, true);
    head.setUint32(e + 8, im.data.length, true); head.setUint32(e + 12, offset, true);
    offset += im.data.length;
  });
  return join([new Uint8Array(head.buffer), ...images.map(im => im.data)]);
}
function chunk(tag, data) {
  const head = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 4; i++) head.setUint8(i, tag.charCodeAt(i));
  head.setUint32(4, data.length, true);
  return join([new Uint8Array(head.buffer), data, new Uint8Array(data.length % 2)]);
}
function ani(frames, jiffies) {
  const h = new DataView(new ArrayBuffer(36));
  [36, frames.length, frames.length, 0, 0, 0, 0, jiffies, 1].forEach((v, i) => h.setUint32(i * 4, v, true));
  const fram = join([new TextEncoder().encode('fram'), ...frames.map(f => chunk('icon', f))]);
  const body = join([new TextEncoder().encode('ACON'), chunk('anih', new Uint8Array(h.buffer)), chunk('LIST', fram)]);
  const riff = new DataView(new ArrayBuffer(8)); 'RIFF'.split('').forEach((ch, i) => riff.setUint8(i, ch.charCodeAt(0))); riff.setUint32(4, body.length, true);
  return join([new Uint8Array(riff.buffer), body]);
}
function base64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

// Every role of the theme, animated ones looping exactly: busy roles turn in 24 images, the others breathe in 12.
// still: one image per cursor, written in a fraction of a second so the pointer changes at once; the animated files follow.
async function build(name, progress, roles = ROLES, still = false) {
  const theme = THEME[name];
  if (!theme) throw new Error('Unknown cursor theme ' + name);
  const files = {};
  CPU = true;
  try {
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      if (!still && (BUSY(role) || MOVING(theme))) {
        const n = BUSY(role) ? BUSY_FRAMES : FRAMES;
        const frames = (await Promise.all(Array.from({ length: n }, (_, k) => sizes(theme, role, k / n * TAU, true, SIZES_ANI)))).map(cur);
        files[ROLE_FILE[role] + '.ani'] = base64(ani(frames, Math.round(LOOP / n * 60)));
      } else files[ROLE_FILE[role] + '.cur'] = base64(cur(await sizes(theme, role, .6, false, SIZES_CUR)));
      if (progress) progress((i + 1) / roles.length);
    }
  } finally {
    CPU = false;
  }
  return { name, version: still ? VERSION + '-still' : VERSION, files };
}

// A pack (the special edition) adds its own families and styles with the same drawing tools.
const packs = [], packFamilies = [];

// Families made in the Workshop (C67): a style and two colours per variant, on top of a real variant of that style.
// The page and the workers derive the same drawing from the same three values, so only those are kept in the settings.
const hex2rgb = h => { const n = parseInt(String(h).slice(1), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgb2hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, k) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * k)); };
const lightHex = (c, k) => mixHex(c, '#ffffff', k), darkHex = (c, k) => mixHex(c, '#000000', k);
const rgbStr = c => hex2rgb(c).join(','), rgbaStr = (c, a) => `rgba(${rgbStr(c)},${a})`;
const CUSTOM_STYLES = {
  flat: (a, b) => ({ body: a, edge: b, lamp: b, ink: b, crease: rgbaStr(b, .45) }),
  glass: (a, b) => ({ top: lightHex(a, .35), bottom: darkHex(a, .35), rim: b, glow: a, ink: b, crease: rgbaStr(b, .4) }),
  neon: (a, b) => ({ tube: a, core: rgbaStr(lightHex(mixHex(a, b, .5), .8), .95) }),
  metal: (a, b) => ({ stops: [[0, lightHex(a, .9)], [.16, lightHex(a, .5)], [.34, mixHex(a, b, .5)], [.5, lightHex(a, .85)], [.66, a], [.84, darkHex(mixHex(a, b, .5), .4)], [1, lightHex(a, .45)]], edge: darkHex(b, .7) }),
  photophore: (a, b) => ({ body: [darkHex(b, .7), darkHex(b, .9)], rim: mixHex(a, b, .6), halo: rgbaStr(lightHex(a, .4), .45), dot: rgbStr(lightHex(a, .75)), glow: rgbStr(a) }),
  depth: (a, b) => ({ stops: [[0, lightHex(a, .8)], [.22, a], [.6, mixHex(a, b, .65)], [1, darkHex(b, .6)]], edge: darkHex(b, .85), lamp: lightHex(a, .45), arc: lightHex(a, .85) }),
  nacre: (a, b) => ({ stops: [lightHex(a, .85), lightHex(a, .55), lightHex(mixHex(a, '#c9b8ff', .5), .6), lightHex(mixHex(a, '#ffb3d1', .5), .6), lightHex(mixHex(a, '#fff3cf', .5), .7), lightHex(a, .65), lightHex(a, .85)], edge: darkHex(b, .3), arc: mixHex(a, b, .5), crease: rgbaStr(b, .4) }),
};
const customFamilies = [];
function customVariant(style, a, b) {
  const base = FAMILIES.flatMap(f => f.variants).find(v => v.style === style);
  const own = JSON.parse(JSON.stringify(base));
  delete own.name; delete own.family; delete own.variant;
  return Object.assign(own, CUSTOM_STYLES[style](a, b), { style, swatch: a });
}
// Registers the families of the Workshop, replacing any earlier copy of the same family.
function setCustom(list) {
  customFamilies.length = 0;
  for (const f of list || []) {
    if (!f || !f.name || !Array.isArray(f.variants)) continue;
    const family = { key: f.key, name: f.name, custom: true, variants: [] };
    for (const v of f.variants) {
      if (!CUSTOM_STYLES[v.style]) continue;
      const theme = customVariant(v.style, v.a, v.b);
      theme.variant = v.variant;
      theme.name = ('lampfish ' + f.name + ' ' + v.variant).trim();
      theme.family = f.key;
      theme.a = v.a; theme.b = v.b;
      THEME[theme.name] = theme;
      family.variants.push(theme);
    }
    if (family.variants.length) customFamilies.push(family);
  }
}
const api = {
  VERSION, FAMILIES, THEME, ROLES, packs, packFamilies, customFamilies, CUSTOM_STYLES, setCustom, customVariant,
  kit: { STYLES, layer, stamp, band, inner, paint, glow, noGlow, lin, conic, star, finish, details, busyArc, lampAt, wave, frac, TAU },
  addFamilies: list => { for (const f of list) { for (const v of f.variants) { v.name = ('lampfish ' + f.name + ' ' + v.variant).trim(); v.family = f.key; THEME[v.name] = v; } packFamilies.push(f); } },
  has: name => !!THEME[name],
  draw: (target, px, name, role, w, anim) => drawTheme(target, px, THEME[name], role, w, anim),
  phase: seconds => (seconds % LOOP) / LOOP * TAU,
};

if (typeof document === 'undefined') {
  self.CursorEngine = api;
  self.onmessage = async e => {
    try {
      for (const url of e.data.packs || []) if (!packs.includes(url)) { importScripts(url); packs.push(url); }
      if (e.data.custom) setCustom(e.data.custom);
      postMessage({ done: await build(e.data.build, p => postMessage({ progress: p }), e.data.roles, e.data.still) }); }
    catch (err) { postMessage({ error: String(err) }); }
  };
} else {
  // Workers share the roles of a theme, so that it is made several times faster and the page never waits.
  const COUNT = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  let workers = null, queue = Promise.resolve();
  const drop = () => { if (workers) for (const w of workers) w.terminate(); workers = null; };
  const part = (worker, name, roles, still, report) => new Promise((ok, no) => {
    worker.onmessage = e => {
      if (e.data.progress != null) { report(e.data.progress * roles.length); return; }
      if (e.data.error) no(new Error(e.data.error)); else ok(e.data.done.files);
    };
    worker.onerror = err => { drop(); no(err); };
    worker.postMessage({ build: name, roles, still, packs, custom: customFamilies.map(f => ({ key: f.key, name: f.name, variants: f.variants.map(v => ({ variant: v.variant, style: v.style, a: v.a, b: v.b })) })) });
  });
  const run = async (name, progress, still) => {
    try { workers = workers || Array.from({ length: COUNT }, () => new Worker('cursor-engine.js')); }
    catch (err) { return build(name, progress, ROLES, still); }
    // The busy roles are the heaviest: they are spread first so every worker gets a fair share.
    const order = ROLES.slice().sort((a, b) => (b === 'wait' || b === 'appstarting') - (a === 'wait' || a === 'appstarting'));
    const shares = workers.map(() => []);
    order.forEach((role, i) => shares[i % workers.length].push(role));
    const done = workers.map(() => 0);
    const parts = await Promise.all(workers.map((w, i) => part(w, name, shares[i], still, n => { done[i] = n; if (progress) progress(done.reduce((a, b) => a + b, 0) / ROLES.length); })));
    return { name, version: still ? VERSION + '-still' : VERSION, files: Object.assign({}, ...parts) };
  };
  api.warm = () => { try { workers = workers || Array.from({ length: COUNT }, () => new Worker('cursor-engine.js')); } catch (err) { } };
  api.build = (name, progress, still = false) => (queue = queue.then(() => run(name, progress, still), () => run(name, progress, still)));
  // The page loads a pack once; the workers load it with their next request.
  api.load = url => packs.includes(url) ? Promise.resolve() : new Promise((ok, no) => {
    const tag = document.createElement('script');
    tag.src = url;
    tag.onload = () => { packs.push(url); ok(); };
    tag.onerror = no;
    document.head.append(tag);
  });
  window.CursorEngine = api;
}
})();
