'use strict';

// The swim of the mark, shared by the moving marks of the window (mark.js) and the wallpapers that show the fish
// (lampfish-dusk, lampfish-lamp). src/Mark.cs draws the same swim for the round button of the assistant: keep them in step.
// The tail swims as a wave that runs from the body to the tip. A gesture only changes where the wave goes: stronger, faster,
// bent to one side, or calmer; springs carry it there, so it never jumps in place or in speed. The rod is a fishing rod that a
// short push sets bouncing, the little fin waves on its own, the eye blinks, the glow breathes, the whole fish rocks gently.
const MarkSwim = (function () {
  if (typeof MARK_DATA === 'undefined') return null;
  const D = MARK_DATA, deg = Math.PI / 180, TAU = 2 * Math.PI;
  const rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
  const ease = k => .5 - Math.cos(Math.max(0, Math.min(1, k)) * Math.PI) / 2;
  const spring = (s, target, w, dt) => { s.v += (w * w * (target - s.x) - 2 * w * s.v) * dt; s.x += s.v * dt; };
  const GESTURES = [
    { w: 3, len: 1.4, amp: 6, beat: .75 },
    { w: 2, len: .8, amp: 9, beat: 1.1 },
    { w: 2, len: 1.3, bend: 9, amp: -1.2 },
    { w: 2, len: .6, bend: 12 },
    { w: 1, len: 2.2, amp: -1.6, beat: -.1 },
  ];
  const pick = () => { let r = Math.random() * GESTURES.reduce((s, g) => s + g.w, 0); for (const g of GESTURES) if ((r -= g.w) < 0) return g; return GESTURES[0]; };
  const weight = (g, t) => g ? Math.min(ease((t - g.at) / .3), ease((g.g.len - (t - g.at)) / .3)) : 0;
  // The middle of the fish, around which it rocks.
  const xs = D.rings[0].map(p => p[0]), ys = D.rings[0].map(p => p[1]);
  const middle = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];

  const still = { tail: () => 0, rod: 0, lid: 1, fin: 0, rock: 0, glow: 1, eye: 1, t: 0 };

  function path(pose) {
    let d = '';
    for (const ring of D.rings) {
      d += 'M';
      for (let i = 0; i < ring.length; i++) {
        let [x, y, k, w] = ring[i];
        if (k === 1 && w) [x, y] = rot(x, y, D.tail[0], D.tail[1], pose.tail(w) * w);
        else if (k === 2 && w) [x, y] = rot(x, y, D.root[0], D.root[1], pose.rod * w);
        else if (k === 3 && pose.lid !== 1) y = D.lid + (y - D.lid) * pose.lid;
        else if (k === 4 && pose.fin) [x, y] = rot(x, y, D.fin[0], D.fin[1], pose.fin);
        d += (i ? 'L' : '') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      d += 'Z';
    }
    return d;
  }

  // One fish: step(dt, busy) moves it by the real time since the last frame (at most a twentieth of a second, so a late frame
  // never makes it leap) and gives its pose; busy brings the gestures closer together; poke() is the pointer on the fish.
  function swimmer() {
    const s = { t: 0, move: null, nextMove: 1.5, blinkAt: -9, nextBlink: 2.5, nextRod: 4, own: null, lit: 0,
      amp: { x: 2, v: 0 }, beat: { x: .385, v: 0 }, bend: { x: 0, v: 0 }, phase: 0, rod: { x: 0, v: 0 }, pluck: null };
    return {
      poke() {
        if (s.own) return;
        s.own = { g: GESTURES[Math.random() < .5 ? 0 : 1], at: s.t, s: Math.random() < .5 ? -1 : 1 };
        s.pluck = { at: s.t, s: -1 };
      },
      step(dt, busy) {
        dt = Math.max(0, Math.min(.05, dt));
        const t = s.t += dt;
        if (!s.move && t >= s.nextMove) s.move = { g: pick(), at: t, s: Math.random() < .5 ? -1 : 1 };
        if (s.move && t - s.move.at > s.move.g.len) { s.move = null; s.nextMove = t + (busy ? .5 + Math.random() : 1.8 + Math.random() * 1.7); }
        if (s.own && t - s.own.at > s.own.g.len) s.own = null;
        if (t >= s.nextBlink) { s.blinkAt = t; s.nextBlink = t + 3 + Math.random() * 4 + (Math.random() < .25 ? -2.8 : 0); }
        if (t >= s.nextRod) { s.nextRod = t + 6 + Math.random() * 3; if (!s.pluck) s.pluck = { at: t, s: Math.random() < .7 ? -1 : 1 }; }
        const b = (t - s.blinkAt) / .26, lid = b >= 0 && b < 1 ? Math.max(.08, Math.abs(1 - 2 * b)) : 1;
        const fin = (Math.sin(t * TAU / 3.3) * 3.6 + Math.sin(t * TAU / 1.9 + 1.3) * 1.4) * deg;
        const float = Math.sin(t * TAU / 9) * 1.5;
        // Between gestures the tail always sways, but unevenly: its strength drifts between faint and clear.
        const env = .35 + .65 * Math.pow(Math.sin(t * TAU / 11) * .6 + Math.sin(t * TAU / 6.7 + 1) * .4, 2);
        const a = weight(s.move, t), own = weight(s.own, t);
        const add = key => (s.move ? a * (s.move.g[key] || 0) : 0) + (s.own ? own * (s.own.g[key] || 0) : 0);
        const side = (s.move ? a * s.move.s * (s.move.g.bend || 0) : 0) + (s.own ? own * s.own.s * (s.own.g.bend || 0) : 0);
        spring(s.amp, Math.max(.6, 2.8 * env + add('amp')), 6, dt);
        spring(s.beat, .385 * (1 + .08 * Math.sin(t * TAU / 13)) + add('beat'), 5, dt);
        spring(s.bend, side, 7, dt);
        s.phase = (s.phase + TAU * s.beat.x * dt) % (TAU * 1000);
        const pu = s.pluck ? (t - s.pluck.at) / .3 : 1;
        const push = pu < 1 ? s.pluck.s * 300 * Math.pow(Math.sin(Math.PI * pu), 2) : 0;
        if (pu >= 1) s.pluck = null;
        s.rod.v += (push - 81 * s.rod.x - 5.4 * s.rod.v) * dt;
        s.rod.x += s.rod.v * dt;
        // The lamp glows a little more during a gesture of the pointer.
        s.lit += (own - s.lit) * .2;
        const amp = s.amp.x, phase = s.phase, bend = s.bend.x;
        return {
          t, lid, fin,
          tail: w => (amp * Math.sin(phase - 1.4 * w) + bend * w) * deg,
          rod: (float + s.rod.x) * deg,
          eye: Math.max(0, Math.min(1, (lid - .6) / .25)),
          glow: 1 + .05 * Math.sin(t * TAU / 3.6) + .1 * s.lit,
          // Two slow waves that never quite repeat, under 3 degrees.
          rock: Math.sin(t * TAU / 5.3) * 1.8 + Math.sin(t * TAU / 8.9 + .7) * .9,
        };
      },
    };
  }

  // The same outline traced straight onto a canvas: building and reading back a path in text cost most of a frame.
  // Every second point is enough below 600 px.
  function trace(ctx, pose, size) {
    const step = size < 600 ? 2 : 1;
    ctx.beginPath();
    for (const ring of D.rings) {
      for (let i = 0; i < ring.length; i += step) {
        let [x, y, k, w] = ring[i];
        if (k === 1 && w) [x, y] = rot(x, y, D.tail[0], D.tail[1], pose.tail(w) * w);
        else if (k === 2 && w) [x, y] = rot(x, y, D.root[0], D.root[1], pose.rod * w);
        else if (k === 3 && pose.lid !== 1) y = D.lid + (y - D.lid) * pose.lid;
        else if (k === 4 && pose.fin) [x, y] = rot(x, y, D.fin[0], D.fin[1], pose.fin);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
  }

  // For a canvas: the parts drawn inside the inner group of the mark, once, as paths of the 512 box.
  let parts = null;
  function canvasParts() {
    if (parts) return parts;
    const m = /matrix\(([^)]+)\)/.exec(D.inner)[1].split(/[\s,]+/).map(Number);
    const inner = new DOMMatrix(m);
    const paths = svg => { const out = new Path2D(); for (const one of svg.matchAll(/ d="([^"]+)"/g)) out.addPath(new Path2D(one[1]), inner); return out; };
    const circles = svg => [...svg.matchAll(/cx="([^"]+)" cy="([^"]+)" r="([^"]+)"(?: fill="[^"]*")?(?: opacity="([^"]+)")?/g)].map(c => {
      const p = inner.transformPoint(new DOMPoint(Number(c[1]), Number(c[2])));
      return { x: p.x, y: p.y, r: Number(c[3]) * Math.hypot(m[0], m[1]), a: c[4] ? Number(c[4]) : 1 };
    });
    parts = { mouth: paths(D.mouth), eye: paths(D.eye), tip: paths(D.tip), lamp: circles(D.lamp)[0], halos: circles(D.halos) };
    return parts;
  }

  // Draws the fish in the square box (x, y, size) of a canvas: body in color, lamp and halos in lamp.
  function draw(ctx, pose, x, y, size, color, lamp) {
    const p = canvasParts(), k = size / 512;
    ctx.save();
    ctx.translate(x, y); ctx.scale(k, k);
    ctx.translate(middle[0], middle[1]); ctx.rotate(pose.rock * deg); ctx.translate(-middle[0], -middle[1]);
    ctx.fillStyle = color;
    trace(ctx, pose, size);
    ctx.fill('evenodd');
    ctx.fill(p.mouth, 'evenodd');
    if (pose.eye > 0) {
      ctx.save(); ctx.globalAlpha *= pose.eye;
      ctx.translate(0, D.lid); ctx.scale(1, pose.lid); ctx.translate(0, -D.lid);
      ctx.fill(p.eye, 'evenodd'); ctx.restore();
    }
    ctx.translate(D.root[0], D.root[1]); ctx.rotate(pose.rod); ctx.translate(-D.root[0], -D.root[1]);
    ctx.fill(p.tip, 'evenodd');
    ctx.fillStyle = lamp || color;
    const base = ctx.globalAlpha;
    for (const h of p.halos) { ctx.globalAlpha = base * h.a; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * pose.glow, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = base; ctx.beginPath(); ctx.arc(p.lamp.x, p.lamp.y, p.lamp.r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Where the lamp is now, in the box of a canvas, for the light it casts.
  function lampAt(pose, x, y, size) {
    const k = size / 512, a = pose.rock * deg;
    let [lx, ly] = rot(D.light[0], D.light[1], D.root[0], D.root[1], pose.rod);
    [lx, ly] = rot(lx, ly, middle[0], middle[1], a);
    return [x + lx * k, y + ly * k];
  }

  return { D, middle, still, path, swimmer, draw, lampAt };
})();
