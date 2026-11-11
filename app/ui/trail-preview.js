'use strict';
// Live previews of the trails of the special edition, for the gallery of Mouse. The recipes are the ones Trail.cs was
// ported from (TrailRecipes.cs), so a preview moves like the real trail. Everything stays inside this scope.
(function () {
const TR = { D: 1, L: 1, clickFx: true };
const rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = k => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const CAP = 260;
const sprites = new Map();
function glowSprite(rgb) {
  if (sprites.has(rgb)) return sprites.get(rgb);
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, `rgba(${rgb},.95)`); g.addColorStop(.45, `rgba(${rgb},.28)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); sprites.set(rgb, c); return c;
}
function starPath(x, r, w) { x.beginPath(); x.moveTo(0, -r); x.lineTo(w, -w); x.lineTo(r, 0); x.lineTo(w, w); x.lineTo(0, r); x.lineTo(-w, w); x.lineTo(-r, 0); x.lineTo(-w, -w); x.closePath(); }
function mix(stops, a) {
  for (let i = 1; i < stops.length; i++) if (a <= stops[i][0]) { const [o0, c0] = stops[i - 1], [o1, c1] = stops[i], k = (a - o0) / (o1 - o0 || 1); return c0.map((v, j) => Math.round(v + (c1[j] - v) * k)); }
  return stops[stops.length - 1][1];
}
function along(prev, p, n, f) { for (let i = 0; i < n; i++) { const k = Math.random(); f(prev.x + (p.x - prev.x) * k, prev.y + (p.y - prev.y) * k); } }
function count(speed, rate, cap = 5) { const v = speed * rate * TR.D; return Math.min(cap * TR.D, Math.floor(v) + (Math.random() < v % 1 ? 1 : 0)); }
function push(list, item) { if (list.length < CAP) list.push(item); }
// A path drawn as curves through the midpoints, so fast movements never show corners.
function smooth(x, pts, styleAt) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, m2 = c ? { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 } : b;
    if (!styleAt(x, i, b)) continue;
    x.beginPath(); x.moveTo(m1.x, m1.y); x.quadraticCurveTo(b.x, b.y, m2.x, m2.y); x.stroke();
  }
}
// Physics shared by thrown particles: velocity in px per ms, drag, gravity, all scaled by the time step.
function fly(d, dt, g = 0, drag = 0) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += g * dt; if (drag) { const f = Math.pow(1 - drag, dt / 16); d.vx *= f; d.vy *= f; } }

const R = {
  bubbles: cfg => ({
    move(z, p, prev, speed) {
      along(prev, p, count(speed, .9, 4), (x, y) => push(z.items, { x: x + rnd(-2.5, 2.5) + 2, y: y + rnd(6, 12), r: 1.3 + Math.random() * Math.random() * 4.6, vy: -rnd(.018, .045), vx: 0, ph: rnd(0, 6.28), life: 0, max: rnd(900, 1900) * TR.L, grow: rnd(1, 1.5), hue: rnd(0, 360) }));
      if (cfg.dust && Math.random() < Math.min(.9, speed * .5 * TR.D)) push(z.extra, { x: p.x + rnd(-5, 5), y: p.y + rnd(4, 12), life: 0, max: rnd(500, 1000) * TR.L, vx: 0, vy: rnd(.02, .05), s: rnd(.8, 2.2) });
    },
    draw(z, x, dt, now) {
      const light = z.light;
      for (let i = z.items.length - 1; i >= 0; i--) {
        const b = z.items[i];
        b.life += dt; b.ph += dt * .006; b.vy -= .00005 * dt; b.x += (Math.sin(b.ph) * .015 + b.vx) * dt; b.y += b.vy * dt; b.vx *= Math.pow(.97, dt / 16);
        const k = b.life / b.max, r = b.r * (1 + (b.grow - 1) * k);
        if (k >= 1 || b.y < -10) { if (k >= 1) z.pops.push({ x: b.x, y: b.y, r, life: 0, hue: b.hue }); z.items.splice(i, 1); continue; }
        const a = k < .1 ? k * 10 : 1 - Math.max(0, k - .75) * 2;
        drawBubble(x, b.x, b.y, r, a, cfg, light, now, b.hue);
      }
      for (let i = z.pops.length - 1; i >= 0; i--) {
        const p = z.pops[i]; p.life += dt; const k = p.life / 200;
        if (k >= 1) { z.pops.splice(i, 1); continue; }
        x.lineWidth = 1; x.strokeStyle = cfg.prism ? `hsla(${p.hue},90%,70%,${.5 * (1 - k)})` : `rgba(${light ? cfg.rimLight : cfg.rim},${.5 * (1 - k)})`;
        x.beginPath(); x.arc(p.x, p.y, p.r * (1 + k * .9), 0, 6.283); x.stroke();
      }
      for (let i = z.extra.length - 1; i >= 0; i--) {
        const d = z.extra[i]; d.life += dt; const k = d.life / d.max;
        if (k >= 1) { z.extra.splice(i, 1); continue; }
        fly(d, dt, 0, .02);
        x.save(); x.translate(d.x, d.y); x.globalAlpha = Math.sin(k * Math.PI) * (.6 + .4 * Math.sin(d.life * .03)); x.fillStyle = light ? '#a87412' : '#ffe39a';
        starPath(x, d.s * 2, d.s * .35); x.fill(); x.restore();
      }
      return z.items.length + z.pops.length + z.extra.length > 0;
    },
    // A big bubble swells under the click, wobbles, then bursts into droplets and a handful of small bubbles.
    click(z, p, now) {
      const drops = Array.from({ length: 9 }, (_, i) => ({ a: i / 9 * 6.283 + rnd(-.2, .2), v: rnd(.8, 1.2) }));
      let burst = false;
      z.fx.push({ t: now, dur: 950, draw(x, k) {
        if (k < .38) { const e = easeOut(k / .38), r = 3 + 13 * e, wob = Math.sin(k * 60) * (1 - e) * 1.5; drawBubble(x, p.x, p.y, r + wob, 1, cfg, z.light, now, 180, true); return; }
        if (!burst) { burst = true; for (let i = 0; i < 7; i++) push(z.items, { x: p.x + rnd(-8, 8), y: p.y + rnd(-8, 8), r: rnd(1.2, 3.2), vy: -rnd(.03, .06), vx: rnd(-.04, .04), ph: rnd(0, 6.28), life: 0, max: rnd(700, 1300), grow: 1.2, hue: rnd(0, 360) }); if (cfg.dust) for (let i = 0; i < 14; i++) push(z.extra, { x: p.x, y: p.y, vx: Math.cos(i / 14 * 6.283) * rnd(.08, .16), vy: Math.sin(i / 14 * 6.283) * rnd(.08, .16), life: 0, max: rnd(600, 1000), s: rnd(1, 2.4) }); }
        const kk = (k - .38) / .62, col = cfg.prism ? `hsla(${(now * .1) % 360},90%,${z.light ? 45 : 72}%,` : `rgba(${z.light ? cfg.rimLight : cfg.rim},`;
        x.lineWidth = 1.4; x.strokeStyle = col + (1 - kk) * .8 + ')'; x.beginPath(); x.arc(p.x, p.y, 16 + kk * 12, 0, 6.283); x.stroke();
        x.fillStyle = col + (1 - kk) + ')';
        for (const d of drops) { const dist = (16 + 26 * easeOut(kk)) * d.v; x.beginPath(); x.arc(p.x + Math.cos(d.a) * dist, p.y + Math.sin(d.a) * dist + kk * kk * 10, 1.7 * (1 - kk) + .3, 0, 6.283); x.fill(); }
      } });
    },
  }),
  sparkles: cfg => ({
    move(z, p, prev, speed) { along(prev, p, count(speed, 1.1), (x, y) => push(z.items, { x: x + rnd(-8, 8), y: y + rnd(-6, 10), life: 0, max: rnd(400, 950) * TR.L, vy: rnd(.01, .045), vx: rnd(-.015, .015), s: rnd(1, 3.2), rot: rnd(0, .8), tw: rnd(.015, .04) })); },
    draw(z, x, dt) {
      x.save(); if (!z.light) x.globalCompositeOperation = 'lighter';
      for (let i = z.items.length - 1; i >= 0; i--) {
        const d = z.items[i]; d.life += dt; const k = d.life / d.max;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        fly(d, dt, 0, d.drag || 0);
        const a = Math.sin(k * Math.PI) * (.55 + .45 * Math.sin(d.life * d.tw));
        x.save(); x.translate(d.x, d.y); x.rotate(d.rot); x.globalAlpha = a;
        if (!z.light) { const r = d.s * 3; x.drawImage(glowSprite(cfg.glow), -r, -r, r * 2, r * 2); }
        x.fillStyle = z.light ? cfg.dark : cfg.core; starPath(x, d.s * 2.2, d.s * .32); x.fill();
        x.restore();
      }
      x.restore();
      return z.items.length > 0;
    },
    // A lens flare: a great four-point star that opens and turns, and a ring of small stars thrown out.
    click(z, p, now) {
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; push(z.items, { x: p.x, y: p.y, vx: Math.cos(a) * rnd(.1, .18), vy: Math.sin(a) * rnd(.1, .18), drag: .06, life: 0, max: rnd(500, 800), s: rnd(1.2, 2.4), rot: a, tw: .03 }); }
      z.fx.push({ t: now, dur: 650, draw(x, k) {
        const size = 26 * Math.sin(Math.PI * Math.min(1, k * 1.15));
        x.save(); x.translate(p.x, p.y); x.rotate(k * .8);
        if (!z.light) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = 1 - k; const r = size * 1.3; x.drawImage(glowSprite(cfg.glow), -r, -r, r * 2, r * 2); }
        x.globalAlpha = 1 - k * .6; x.fillStyle = z.light ? cfg.dark : cfg.core; starPath(x, size, size * .09); x.fill();
        x.rotate(Math.PI / 4); starPath(x, size * .45, size * .06); x.fill();
        x.restore();
      } });
    },
  }),
  plankton: cfg => ({
    move(z, p, prev, speed) { along(prev, p, count(speed, 1.2), (x, y) => push(z.items, { x: x + rnd(-12, 12), y: y + rnd(-12, 12), vx: rnd(-.012, .012), vy: rnd(-.012, .012), life: 0, max: rnd(1200, 2400) * TR.L, s: rnd(1.2, 3.2), ph: rnd(0, 6.28) })); },
    draw(z, x, dt) {
      x.save(); if (!z.light) x.globalCompositeOperation = 'lighter';
      for (let i = z.items.length - 1; i >= 0; i--) {
        const d = z.items[i]; d.life += dt; const k = d.life / d.max;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        fly(d, dt, 0, d.drag || 0); d.x += Math.sin(d.life * .002 + d.ph) * .003 * dt;
        const a = (k < .15 ? k / .15 : 1 - (k - .15) / .85) * (.6 + .4 * Math.sin(d.life * .01 + d.ph));
        x.globalAlpha = Math.max(0, a);
        if (z.light) { x.fillStyle = `rgba(${cfg.dark},.22)`; x.beginPath(); x.arc(d.x, d.y, d.s * 1.6, 0, 6.283); x.fill(); x.fillStyle = `rgb(${cfg.dark})`; x.beginPath(); x.arc(d.x, d.y, d.s * .75, 0, 6.283); x.fill(); }
        else { const r = d.s * 3.2; x.drawImage(glowSprite(cfg.glow), d.x - r, d.y - r, r * 2, r * 2); }
      }
      x.restore();
      return z.items.length > 0;
    },
    // The water lights up: a soft pulse of light, and the plankton around it wakes in a ring.
    click(z, p, now) {
      for (let i = 0; i < 34; i++) { const a = rnd(0, 6.283), r = rnd(6, 16); push(z.items, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, vx: Math.cos(a) * rnd(.05, .11), vy: Math.sin(a) * rnd(.05, .11), drag: .05, life: 0, max: rnd(1100, 1900), s: rnd(1.2, 3), ph: rnd(0, 6.28) }); }
      z.fx.push({ t: now, dur: 1000, draw(x, k) {
        const r = 10 + 62 * easeOut(k), g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        const c = z.light ? cfg.dark : cfg.glow;
        g.addColorStop(0, `rgba(${c},${.35 * (1 - k)})`); g.addColorStop(.6, `rgba(${c},${.12 * (1 - k)})`); g.addColorStop(1, `rgba(${c},0)`);
        x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, r, 0, 6.283); x.fill();
      } });
    },
  }),
  constellation: cfg => ({
    move(z, p, prev, speed, now) {
      z.travel = (z.travel || 0) + Math.hypot(p.x - prev.x, p.y - prev.y);
      if (z.travel > 30 / TR.D) { z.travel = 0; push(z.items, { x: p.x + rnd(-8, 8), y: p.y + rnd(-8, 8), t: now, s: rnd(1, 2.2) }); }
    },
    draw(z, x, dt, now) {
      const life = 1500 * TR.L;
      while (z.items.length && now - z.items[0].t > life) z.items.shift();
      const col = z.light ? cfg.dark : cfg.core;
      x.lineWidth = .8;
      for (let i = 1; i < z.items.length; i++) { const a = z.items[i - 1], b = z.items[i], k = 1 - (now - a.t) / life; x.strokeStyle = `rgba(${col},${.45 * k})`; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
      x.save(); if (!z.light) x.globalCompositeOperation = 'lighter';
      for (const s of z.items) drawStar(x, s.x, s.y, s.s, (1 - (now - s.t) / life) * (.7 + .3 * Math.sin(now * .012 + s.x)), cfg, z.light);
      x.restore();
      return z.items.length > 0;
    },
    // A new constellation is drawn star by star around the click, then fades.
    click(z, p, now) {
      const n = 6, pts = Array.from({ length: n }, (_, i) => { const a = -1.9 + i * 1.05 + rnd(-.25, .25), r = rnd(16, 34); return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * .8, s: rnd(1.2, 2.4) }; });
      pts.unshift({ x: p.x, y: p.y, s: 2.6 });
      z.fx.push({ t: now, dur: 1700, draw(x, k) {
        const col = z.light ? cfg.dark : cfg.core, fade = k > .6 ? 1 - (k - .6) / .4 : 1;
        x.lineWidth = .9;
        for (let i = 1; i < pts.length; i++) { const show = Math.min(1, Math.max(0, (k - i * .06) / .06)); if (!show) continue; const a = pts[i - 1], b = pts[i]; x.strokeStyle = `rgba(${col},${.6 * fade})`; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(a.x + (b.x - a.x) * show, a.y + (b.y - a.y) * show); x.stroke(); }
        x.save(); if (!z.light) x.globalCompositeOperation = 'lighter';
        pts.forEach((s, i) => { if (k > i * .06) drawStar(x, s.x, s.y, s.s, fade, cfg, z.light); });
        x.restore();
      } });
    },
  }),
  ribbon: cfg => ({
    move(z, p, prev, speed, now) { push(z.items, { x: p.x, y: p.y, t: now }); },
    draw(z, x, dt, now) {
      const life = 480 * TR.L;
      while (z.items.length && now - z.items[0].t > life) z.items.shift();
      x.save(); if (!z.light && cfg.add) x.globalCompositeOperation = 'lighter';
      x.lineCap = 'round';
      smooth(x, z.items, (x, i, b) => { const a = Math.min(1, (now - b.t) / life); x.lineWidth = Math.max(.5, cfg.width * (1 - a)); x.strokeStyle = ribbonColor(cfg, a, z.light, now, i); return true; });
      x.restore();
      return z.items.length > 0;
    },
    // The ribbon ties itself in a spiral under the click, from the centre outward, then lets go.
    click(z, p, now) {
      z.fx.push({ t: now, dur: 1100, draw(x, k) {
        const grow = Math.min(1, k * 2.2), fade = k > .5 ? 1 - (k - .5) / .5 : 1;
        x.save(); if (!z.light && cfg.add) x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
        let prev = null;
        for (let u = 0; u <= grow; u += .02) {
          const a = u * Math.PI * 4.2, r = 2 + 17 * u, pt = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
          if (prev) { x.strokeStyle = ribbonColor(cfg, u, z.light, now, u * 40).replace(/[\d.]+\)$/, fade * (z.light ? .9 : .85) + ')'); x.lineWidth = (cfg.width * .7) * (1 - u * .6); x.beginPath(); x.moveTo(prev.x, prev.y); x.lineTo(pt.x, pt.y); x.stroke(); }
          prev = pt;
        }
        x.restore();
      } });
    },
  }),
  ripples: cfg => ({
    move(z, p, prev, speed, now) {
      z.travel = (z.travel || 0) + Math.hypot(p.x - prev.x, p.y - prev.y);
      if (z.travel > 26 / TR.D) { z.travel = 0; push(z.items, { x: p.x, y: p.y, t: now }); }
    },
    draw(z, x, dt, now) {
      const life = 1000 * TR.L;
      for (let i = z.items.length - 1; i >= 0; i--) {
        const r = z.items[i], k = (now - r.t) / life;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        drawRipple(x, r.x, r.y, 22 * easeOut(k), 1 - k, cfg, z.light);
      }
      return z.items.length > 0;
    },
    // A stone in the water: three rings one after the other, and droplets that jump and fall back.
    click(z, p, now) {
      const drops = Array.from({ length: 7 }, () => ({ dx: rnd(-14, 14), h: rnd(10, 22), r: rnd(1, 2) }));
      z.fx.push({ t: now, dur: 1500, draw(x, k) {
        for (let j = 0; j < 3; j++) { const kk = (k - j * .14) / .72; if (kk > 0 && kk < 1) drawRipple(x, p.x, p.y, 44 * easeOut(kk), (1 - kk) * 1.1, cfg, z.light); }
        const kd = k / .45;
        if (kd < 1) { x.fillStyle = `rgba(${z.light ? cfg.dark : cfg.rgb},${1 - kd})`; for (const d of drops) { x.beginPath(); x.arc(p.x + d.dx * kd, p.y - Math.sin(Math.PI * kd) * d.h, d.r, 0, 6.283); x.fill(); } }
      } });
    },
  }),
  snow: cfg => ({
    move(z, p, prev, speed) { along(prev, p, count(speed, .5, 3), (x, y) => push(z.items, { x: x + rnd(-10, 10), y: y + rnd(-4, 8), vx: 0, vy: rnd(.008, .025), ph: rnd(0, 6.28), life: 0, max: rnd(1800, 3200) * TR.L, s: rnd(.6, 1.8) })); },
    draw(z, x, dt) {
      for (let i = z.items.length - 1; i >= 0; i--) {
        const d = z.items[i]; d.life += dt; const k = d.life / d.max;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        fly(d, dt, 0, d.burst ? .045 : 0);
        if (d.burst && Math.hypot(d.vx, d.vy) < .03) { d.burst = false; d.vx = 0; d.vy = rnd(.008, .02); }
        d.x += Math.sin(d.life * .0015 + d.ph) * .005 * dt;
        x.globalAlpha = Math.sin(k * Math.PI) * .85;
        x.fillStyle = z.light ? 'rgba(40,70,74,.8)' : 'rgba(230,250,248,.9)';
        x.beginPath(); x.arc(d.x, d.y, d.s, 0, 6.283); x.fill();
      }
      x.globalAlpha = 1;
      return z.items.length > 0;
    },
    // A gust: a puff of flakes blown out from the click, which slow down and fall again.
    click(z, p) { for (let i = 0; i < 30; i++) { const a = rnd(0, 6.283), v = rnd(.08, .22); push(z.items, { x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, burst: true, ph: rnd(0, 6.28), life: 0, max: rnd(1800, 2800), s: rnd(.7, 2) }); } },
  }),
  school: cfg => ({
    move(z, p, prev, speed, now) {
      z.path.push({ x: p.x, y: p.y, t: now });
      while (z.path.length && now - z.path[0].t > 2000) z.path.shift();
      if (!z.fish.length) for (let i = 0; i < 6; i++) z.fish.push({ x: p.x - 20 - i * 8, y: p.y + rnd(-10, 10), a: 0, ph: rnd(0, 6), vx: 0, vy: 0, s: rnd(1.15, 1.5) });
      z.fade = 1;
    },
    draw(z, x, dt, now) {
      if (!z.fish.length) return false;
      if (now - z.lastMove > 2600 && !(z.attract && now - z.attract.t < 1400)) z.fade = Math.max(0, z.fade - dt / 900);
      const head = z.path[z.path.length - 1] || z.fish[0];
      const lure = z.attract && now - z.attract.t < 1400 ? z.attract : null;
      z.fish.forEach((f, i) => {
        let tx, ty;
        if (lure && now - lure.t < 520) { tx = lure.x + Math.cos(i * 1.05) * 12; ty = lure.y + Math.sin(i * 1.05) * 9; }
        else {
          const lag = (i + 1) * 120 * TR.L; let target = head;
          for (let j = z.path.length - 1; j >= 0; j--) if (now - z.path[j].t >= lag) { target = z.path[j]; break; }
          const off = Math.sin(now * .002 + i * 1.7) * (8 + i * 1.5);
          tx = target.x - 12 + Math.cos(i * 2.1) * 10; ty = target.y + 8 + off * .6;
        }
        const pull = lure && now - lure.t < 520 ? .0024 : .0009;
        f.vx += (tx - f.x) * pull * dt; f.vy += (ty - f.y) * pull * dt;
        // Keep a little room between fish.
        for (const o of z.fish) if (o !== f) { const dx = f.x - o.x, dy = f.y - o.y, d = Math.hypot(dx, dy); if (d > 0 && d < 10) { f.vx += dx / d * .012 * dt; f.vy += dy / d * .012 * dt; } }
        const damp = Math.pow(.9, dt / 16); f.vx *= damp; f.vy *= damp;
        f.x += f.vx * dt * .06; f.y += f.vy * dt * .06;
        const sp = Math.hypot(f.vx, f.vy);
        if (sp > .02) { const want = Math.atan2(f.vy, f.vx); let da = want - f.a; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; f.a += da * Math.min(1, dt / 80); }
        f.ph += dt * (.008 + sp * .02);
        drawFish(x, f, z, cfg);
      });
      if (z.fade <= 0) { z.fish = []; z.path = []; return false; }
      return true;
    },
    // The fish dart to the click as if to food, then scatter.
    click(z, p, now) {
      if (!z.fish.length) for (let i = 0; i < 6; i++) z.fish.push({ x: p.x - 30 - i * 6, y: p.y + rnd(-14, 14), a: 0, ph: rnd(0, 6), vx: 0, vy: 0, s: rnd(1.15, 1.5) });
      z.fade = 1; z.attract = { x: p.x, y: p.y, t: now };
      setTimeout(() => { for (const f of z.fish) { const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy) || 1; f.vx += dx / d * 9; f.vy += dy / d * 9; } }, 560);
      z.fx.push({ t: now, dur: 700, draw(x, k) { const c = z.light ? cfg.lureDark : cfg.lure; for (let i = 0; i < 3; i++) { const r = 2 + i * 3 + k * 4; x.fillStyle = `rgba(${c},${(1 - k) * .8})`; x.beginPath(); x.arc(p.x + Math.cos(i * 2.1 + k * 3) * r, p.y + Math.sin(i * 2.1 + k * 3) * r, 1.2, 0, 6.283); x.fill(); } } });
    },
  }),
  neon: cfg => ({
    move(z, p, prev, speed, now) { push(z.items, { x: p.x, y: p.y, t: now }); },
    draw(z, x, dt, now) {
      const life = 380 * TR.L;
      while (z.items.length && now - z.items[0].t > life) z.items.shift();
      if (z.items.length < 2) return z.items.length > 0;
      const fl = .85 + .15 * Math.sin(now * .09) * Math.sin(now * .023);
      x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
      for (const [w, col, blur] of [[5, cfg.tube, 10], [1.6, z.light ? cfg.tube : '#ffffff', 0]]) {
        x.shadowColor = cfg.tube; x.shadowBlur = blur;
        smooth(x, z.items, (x, i, b) => { const a = 1 - (now - b.t) / life; x.globalAlpha = Math.max(0, a * fl); x.strokeStyle = col; x.lineWidth = w * (.4 + .6 * Math.max(0, a)); return a > 0; });
      }
      x.restore();
      return true;
    },
    // A neon sign switches on under the click: it stutters, holds, and goes out.
    click(z, p, now) {
      z.fx.push({ t: now, dur: 1000, draw(x, k) {
        const on = k < .22 ? [0, 1, 0, 1, 1, 0, 1][Math.floor(k / .22 * 7)] : 1;
        if (!on) return;
        const a = k > .6 ? 1 - (k - .6) / .4 : 1;
        x.save(); x.globalAlpha = a; x.shadowColor = cfg.tube; x.shadowBlur = 12;
        for (const [r, w, col] of [[15, 3.2, cfg.tube], [15, 1.1, '#fff'], [7, 2.4, cfg.tube], [7, .8, '#fff']]) { x.lineWidth = w; x.strokeStyle = z.light && col === '#fff' ? cfg.tube : col; x.beginPath(); x.arc(p.x, p.y, r, 0, 6.283); x.stroke(); }
        x.restore();
      } });
    },
  }),
  pearls: cfg => ({
    move(z, p, prev, speed, now) {
      z.travel = (z.travel || 0) + Math.hypot(p.x - prev.x, p.y - prev.y);
      while (z.travel > 9 / TR.D) { z.travel -= 9 / TR.D; push(z.items, { x: p.x, y: p.y, life: 0, max: 900 * TR.L, vx: 0, vy: 0, r: rnd(2.2, 3.4), hue: (now * .08) % 360 }); }
    },
    draw(z, x, dt) {
      for (let i = z.items.length - 1; i >= 0; i--) {
        const b = z.items[i]; b.life += dt; const k = b.life / b.max;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        if (b.free) { fly(b, dt, .0007, .01); if (b.y > b.floor && b.vy > 0) { b.y = b.floor; b.vy *= -.45; b.vx *= .7; } }
        else if (k > .35) { b.vy += .0006 * dt; b.y += b.vy * dt * .06; }
        const r = b.r * (1 - Math.max(0, k - .7) * 2);
        x.globalAlpha = 1 - Math.max(0, k - .6) * 2.5;
        drawPearl(x, b.x, b.y, Math.max(.1, r), cfg, b.hue);
      }
      x.globalAlpha = 1;
      return z.items.length > 0;
    },
    // The string breaks: pearls burst out, fall and bounce on the floor of the water.
    click(z, p, now) { for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + rnd(-1.3, 1.3), v = rnd(.12, .26); push(z.items, { x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, free: true, floor: p.y + rnd(30, 44), life: 0, max: rnd(1400, 1900), r: rnd(2.2, 3.6), hue: rnd(0, 360) }); } },
  }),
  sequins: cfg => ({
    move(z, p, prev, speed) { along(prev, p, count(speed, .8, 4), (x, y) => push(z.items, { x: x + rnd(-6, 6), y: y + rnd(0, 8), vy: rnd(.02, .05), vx: rnd(-.02, .02), g: 0, ph: rnd(0, 6.28), spin: rnd(.008, .02), life: 0, max: rnd(900, 1600) * TR.L, s: rnd(3.6, 5.6), rot: rnd(0, 6.28) })); },
    draw(z, x, dt) {
      for (let i = z.items.length - 1; i >= 0; i--) {
        const d = z.items[i]; d.life += dt; const k = d.life / d.max;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        fly(d, dt, d.g, d.g ? .02 : 0); d.ph += d.spin * dt;
        const flip = Math.cos(d.ph), bright = flip > 0;
        x.save(); x.translate(d.x, d.y); x.rotate(d.rot); x.scale(Math.max(.08, Math.abs(flip)), 1);
        x.globalAlpha = Math.min(1, (1 - k) * 1.6);
        x.fillStyle = bright ? cfg.front : cfg.back;
        x.beginPath(); x.arc(0, 0, d.s, Math.PI * .05, Math.PI * .95); x.lineTo(0, -d.s * .6); x.closePath(); x.fill();
        if (bright) { x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.arc(-d.s * .3, d.s * .2, d.s * .25, 0, 6.283); x.fill(); }
        x.restore();
      }
      return z.items.length > 0;
    },
    // A handful of scales thrown in the air, flashing as they turn, then raining down.
    click(z, p) { for (let i = 0; i < 18; i++) { const a = -Math.PI / 2 + rnd(-1.1, 1.1), v = rnd(.14, .26); push(z.items, { x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .00045, ph: rnd(0, 6.28), spin: rnd(.015, .03), life: 0, max: rnd(1300, 1800), s: rnd(3.6, 5.6), rot: rnd(0, 6.28) }); } },
  }),
  confetti: cfg => ({
    move(z, p, prev, speed) { along(prev, p, count(speed, .8, 4), (x, y) => push(z.items, { x: x + rnd(-6, 6), y: y + rnd(0, 6), vy: rnd(-.02, .01), vx: rnd(-.03, .03), g: .00012, ph: rnd(0, 6.28), spin: rnd(.006, .016), rot: rnd(0, 6.28), vr: rnd(-.004, .004), life: 0, max: rnd(1100, 1800) * TR.L, s: rnd(4, 6.5), c: Math.floor(rnd(0, cfg.colors.length)) })); },
    draw(z, x, dt) {
      for (let i = z.items.length - 1; i >= 0; i--) {
        const d = z.items[i]; d.life += dt; const k = d.life / d.max;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        fly(d, dt, d.g, d.drag || 0); d.ph += d.spin * dt; d.rot += d.vr * dt;
        const f = Math.cos(d.ph);
        x.save(); x.translate(d.x, d.y); x.rotate(d.rot); x.scale(1, Math.max(.1, Math.abs(f)));
        x.globalAlpha = Math.min(1, (1 - k) * 2);
        x.fillStyle = cfg.colors[(d.c + (f < 0 ? 1 : 0)) % cfg.colors.length];
        x.beginPath(); x.moveTo(0, -d.s); x.lineTo(d.s * .9, d.s * .6); x.lineTo(-d.s * .9, d.s * .6); x.closePath(); x.fill();
        x.restore();
      }
      return z.items.length > 0;
    },
    // A party popper: a cone of paper shot upward that tumbles down.
    click(z, p) { for (let i = 0; i < 30; i++) { const a = -Math.PI / 2 + rnd(-.7, .7), v = rnd(.18, .34); push(z.items, { x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .0005, drag: .03, ph: rnd(0, 6.28), spin: rnd(.01, .025), rot: rnd(0, 6.28), vr: rnd(-.01, .01), life: 0, max: rnd(1500, 2100), s: rnd(4, 6.5), c: Math.floor(rnd(0, cfg.colors.length)) }); } },
  }),
  halftone: cfg => ({
    move(z, p, prev, speed, now) {
      z.travel = (z.travel || 0) + Math.hypot(p.x - prev.x, p.y - prev.y);
      while (z.travel > 6 / TR.D) { z.travel -= 6 / TR.D; push(z.items, { x: p.x, y: p.y, t: now }); }
    },
    draw(z, x, dt, now) {
      const life = 700 * TR.L;
      while (z.items.length && now - z.items[0].t > life) z.items.shift();
      for (const [col, ox, oy] of [[cfg.second, 1.6, 1.2], [z.light ? cfg.inkLight : cfg.ink, 0, 0]]) {
        x.fillStyle = col;
        for (const d of z.items) { const r = 5.2 * (1 - (now - d.t) / life); if (r > .3) { x.beginPath(); x.arc(d.x + ox, d.y + oy, r, 0, 6.283); x.fill(); } }
      }
      return z.items.length > 0;
    },
    // A rubber stamp: a disc of halftone dots printed in two inks, slightly off register.
    click(z, p, now) {
      z.fx.push({ t: now, dur: 1000, draw(x, k) {
        const shrink = k < .1 ? k / .1 : 1 - Math.max(0, k - .45) / .55;
        for (const [col, ox, oy] of [[cfg.second, 1.8, 1.4], [z.light ? cfg.inkLight : cfg.ink, 0, 0]]) {
          x.fillStyle = col;
          for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
            const dx = (i + (j % 2 ? .5 : 0)) * 4.6, dy = j * 4, d = Math.hypot(dx, dy); if (d > 28) continue;
            const r = (1 - d / 28) * 2.4 * shrink; if (r > .25) { x.beginPath(); x.arc(p.x + dx + ox, p.y + dy + oy, r, 0, 6.283); x.fill(); }
          }
        }
      } });
    },
  }),
  ink: cfg => ({
    move(z, p, prev, speed) { along(prev, p, count(speed, .7, 3), (x, y) => push(z.items, { x: x + rnd(-3, 3), y: y + rnd(-3, 3), vx: rnd(-.01, .01), vy: rnd(-.015, .005), r: rnd(3, 7), life: 0, max: rnd(1300, 2200) * TR.L })); },
    draw(z, x, dt) {
      const rgb = z.light ? cfg.dark : cfg.rgb;
      for (let i = z.items.length - 1; i >= 0; i--) {
        const d = z.items[i]; d.life += dt; const k = d.life / d.max;
        if (k >= 1) { z.items.splice(i, 1); continue; }
        fly(d, dt);
        const r = d.r * (1 + k * 2.4), a = (k < .08 ? k / .08 : 1 - k) * (z.light ? .22 : .2);
        const g = x.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
        g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.6, `rgba(${rgb},${a * .55})`); g.addColorStop(1, `rgba(${rgb},0)`);
        x.fillStyle = g; x.beginPath(); x.arc(d.x, d.y, r, 0, 6.283); x.fill();
      }
      return z.items.length > 0;
    },
    // A splash of ink: a ragged blot that spreads fast, droplets around it, then it dilutes.
    click(z, p, now) {
      const lobes = Array.from({ length: 16 }, () => rnd(.7, 1.3)), drops = Array.from({ length: 8 }, () => ({ a: rnd(0, 6.283), d: rnd(17, 28), r: rnd(1, 3) }));
      z.fx.push({ t: now, dur: 1700, draw(x, k) {
        const rgb = z.light ? cfg.dark : cfg.rgb, grow = easeOut(Math.min(1, k * 4)), R0 = 11 * grow * (1 + k * .5), a = (z.light ? .6 : .45) * (1 - k);
        x.fillStyle = `rgba(${rgb},${a})`; x.beginPath();
        for (let i = 0; i <= 32; i++) { const t = i / 32 * 6.283, l = lobes[Math.floor(i / 2) % 16], rr = R0 * (l + Math.sin(t * 5) * .08); i ? x.lineTo(p.x + Math.cos(t) * rr, p.y + Math.sin(t) * rr) : x.moveTo(p.x + Math.cos(t) * rr, p.y + Math.sin(t) * rr); }
        x.closePath(); x.fill();
        for (const d of drops) { x.beginPath(); x.arc(p.x + Math.cos(d.a) * d.d * grow, p.y + Math.sin(d.a) * d.d * grow, d.r * grow, 0, 6.283); x.fill(); }
      } });
    },
  }),
};

function drawBubble(x, bx, by, r, a, cfg, light, now, hue, big = false) {
  const rim = cfg.prism ? `hsla(${(hue + now * .05) % 360},90%,${light ? 40 : 75}%,${.85 * a})` : `rgba(${light ? cfg.rimLight : cfg.rim},${.8 * a})`;
  const g = x.createRadialGradient(bx, by, r * .2, bx, by, r);
  g.addColorStop(0, `rgba(${cfg.fill},0)`); g.addColorStop(.8, `rgba(${cfg.fill},${(big ? .1 : .06) * a})`); g.addColorStop(1, `rgba(${cfg.fill},${.22 * a})`);
  x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, 6.283); x.fill();
  x.lineWidth = Math.max(.8, r * .12); x.strokeStyle = rim; x.stroke();
  x.beginPath(); x.arc(bx, by, r * .62, Math.PI * 1.1, Math.PI * 1.45); x.lineWidth = Math.max(.7, r * .14); x.strokeStyle = `rgba(255,255,255,${.85 * a})`; x.stroke();
}
function drawStar(x, sx, sy, s, a, cfg, light) {
  if (a <= 0) return;
  x.globalAlpha = a;
  if (!light) { const r = s * 5; x.drawImage(glowSprite(cfg.glow), sx - r, sy - r, r * 2, r * 2); }
  x.fillStyle = `rgb(${light ? cfg.dark : cfg.core})`; x.save(); x.translate(sx, sy); starPath(x, s * 2.2, s * .4); x.fill(); x.restore();
  x.globalAlpha = 1;
}
function ribbonColor(cfg, a, light, now, i) {
  if (cfg.prism) return `hsla(${(now * .2 + i * 9) % 360},95%,${light ? 45 : 65}%,${1 - a})`;
  return `rgba(${mix(cfg.stops, a).join(',')},${(1 - a) * (light ? .9 : .85)})`;
}
function drawRipple(x, rx, ry, R0, a, cfg, light) {
  for (const [m, w] of [[1, 1.4], [.62, 1]]) { x.beginPath(); x.ellipse(rx, ry, Math.max(.1, R0 * m), Math.max(.1, R0 * m * .55), 0, 0, 6.283); x.lineWidth = w; x.strokeStyle = `rgba(${light ? cfg.dark : cfg.rgb},${Math.max(0, a) * .75})`; x.stroke(); }
}
function drawPearl(x, px, py, r, cfg, hue) {
  const g = x.createRadialGradient(px - r * .35, py - r * .4, r * .1, px, py, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(.45, cfg.pearl ? `hsl(${hue},70%,90%)` : cfg.mid); g.addColorStop(1, cfg.edge);
  x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
}
function drawFish(x, f, z, cfg) {
  x.save(); x.translate(f.x, f.y); x.rotate(f.a); x.scale(f.s, f.s); x.globalAlpha = z.fade;
  const wag = Math.sin(f.ph) * .45;
  x.fillStyle = z.light ? cfg.bodyLight : cfg.body;
  x.beginPath(); x.ellipse(0, 0, 6, 3.2, 0, 0, 6.283); x.fill();
  x.save(); x.translate(-5.2, 0); x.rotate(wag); x.beginPath(); x.moveTo(0, 0); x.lineTo(-4.4, -3); x.lineTo(-3.6, 0); x.lineTo(-4.4, 3); x.closePath(); x.fill(); x.restore();
  x.strokeStyle = z.light ? cfg.bodyLight : cfg.body; x.lineWidth = .6; x.beginPath(); x.moveTo(3, -2.4); x.quadraticCurveTo(6.5, -6.5, 9, -4.2); x.stroke();
  if (!z.light) { x.globalCompositeOperation = 'lighter'; x.drawImage(glowSprite(cfg.lure), 4, -9.2, 10, 10); x.globalCompositeOperation = 'source-over'; }
  x.fillStyle = z.light ? `rgb(${cfg.lureDark})` : '#ffffff'; x.beginPath(); x.arc(9, -4.2, .9, 0, 6.283); x.fill();
  x.fillStyle = z.light ? '#fff' : '#03191a'; x.beginPath(); x.arc(3.2, -.6, .7, 0, 6.283); x.fill();
  x.restore();
}

// The 26 trails, by the ids of Trail.cs.
const KINDS = {
  'bubbles-gold': ['bubbles', { fill: '255,214,120', rim: '255,226,160', rimLight: '150,100,20', dust: true }],
  'bubbles-abyss': ['bubbles', { fill: '46,217,198', rim: '170,255,244', rimLight: '8,80,86' }],
  'bubbles-pearl': ['bubbles', { fill: '255,245,225', rim: '255,250,240', rimLight: '150,120,70' }],
  'bubbles-prism': ['bubbles', { fill: '170,150,255', prism: true }],
  'bubbles-soap': ['bubbles', { fill: '200,255,250', prism: true }],
  'plankton-abyss': ['plankton', { glow: '80,255,235', dark: '8,90,96' }],
  'plankton-gold': ['plankton', { glow: '255,200,90', dark: '150,100,20' }],
  'plankton-berry': ['plankton', { glow: '170,130,255', dark: '80,50,150' }],
  'constellation': ['constellation', { glow: '255,140,80', core: '255,230,210', dark: '120,50,20' }],
  'sparkles-gold': ['sparkles', { glow: '255,200,90', core: '#fff3cf', dark: '#a87412' }],
  'sparkles-silver': ['sparkles', { glow: '200,225,235', core: '#ffffff', dark: '#5b666b' }],
  'sparkles-rose': ['sparkles', { glow: '255,170,150', core: '#fff0ea', dark: '#9a5141' }],
  'school': ['school', { body: '#3faea4', bodyLight: '#0b3a3c', lure: '80,255,235', lureDark: '15,157,143' }],
  'ribbon-lagoon': ['ribbon', { width: 7, add: true, stops: [[0, [200, 255, 248]], [.3, [46, 217, 198]], [.7, [13, 93, 112]], [1, [8, 26, 54]]] }],
  'ribbon-sunset': ['ribbon', { width: 7, add: true, stops: [[0, [255, 241, 201]], [.3, [255, 179, 92]], [.7, [194, 65, 107]], [1, [42, 15, 58]]] }],
  'ripples': ['ripples', { rgb: '150,190,255', dark: '27,47,122' }],
  'snow': ['snow', {}],
  'neon-pink': ['neon', { tube: '#ff4fd8' }],
  'neon-teal': ['neon', { tube: '#2ED9C6' }],
  'comet': ['ribbon', { width: 6, prism: true, add: true }],
  'pearls': ['pearls', { pearl: true, edge: '#9aa6b0' }],
  'pearls-gold': ['pearls', { mid: '#e8b64c', edge: '#7a4d0e' }],
  'sequins': ['sequins', { front: '#4fe3d2', back: '#178f85' }],
  'confetti': ['confetti', { colors: ['#78f5e6', '#1EBBAA', '#0b6b66', '#c9fff7'] }],
  'halftone': ['halftone', { ink: 'rgba(30,187,170,.9)', inkLight: 'rgba(8,23,26,.85)', second: 'rgba(255,79,139,.55)' }],
  'ink': ['ink', { rgb: '120,240,226', dark: '8,23,26' }],
};

// Turns an element holding a canvas into a live preview: a still stroke at rest, the real trail under the pointer,
// the click effect on a press. Nothing runs while the pointer is away; reduced motion keeps the still only.
function zone(el, kind) {
  const def = KINDS[kind];
  if (!def) return null;
  const recipe = R[def[0]](def[1]);
  const cv = el.querySelector('canvas'), x = cv.getContext('2d');
  const z = { el, items: [], pops: [], extra: [], fish: [], path: [], fx: [], light: false, lastMove: 0, running: false, prev: 0, W: 0, H: 0, recipe, x };
  const fit = () => {
    const r = el.getBoundingClientRect(), dpr = devicePixelRatio || 1, w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    z.W = r.width; z.H = r.height;
    if (!w || !h || (cv.width === w && cv.height === h)) return false;
    cv.width = w; cv.height = h; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };
  z.frame = (now, dt) => {
    x.clearRect(0, 0, z.W, z.H);
    let alive = recipe.draw(z, x, dt, now);
    for (let i = z.fx.length - 1; i >= 0; i--) { const f = z.fx[i], k = (now - f.t) / f.dur; if (k >= 1) { z.fx.splice(i, 1); continue; } x.save(); f.draw(x, Math.max(0, k)); x.restore(); alive = true; }
    return alive;
  };
  // At rest: the stroke of a quick S across the well, drawn image by image, then left as a picture.
  const still = () => {
    if (!z.W) return;
    for (const k of ['items', 'pops', 'extra', 'fish', 'path', 'fx']) z[k] = [];
    z.travel = 0; z.attract = null;
    const base = performance.now() - 8000;
    let prev = null;
    for (let i = 0; i < 63; i++) {
      const now = base + i * 16, k = Math.min(1, i / 60);
      const p = { x: 16 + k * (z.W * .72), y: z.H * .55 + Math.sin(k * 7) * z.H * .2, t: now };
      if (i <= 60) { if (prev) recipe.move(z, p, prev, Math.hypot(p.x - prev.x, p.y - prev.y) / 16, now); z.lastMove = now; prev = p; }
      z.frame(now, 16);
    }
  };
  const ro = new ResizeObserver(() => { if (fit() && !z.running) still(); });
  ro.observe(el);
  z.stop = () => ro.disconnect();
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let last = null;
  const at = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
  const start = () => { if (!z.running) { z.running = true; z.prev = performance.now(); requestAnimationFrame(tick); } };
  function tick() {
    const now = performance.now(), dt = Math.min(50, Math.max(0, now - z.prev));
    z.prev = now;
    const alive = z.frame(now, dt);
    if (el.isConnected && (alive || now - z.lastMove < 600 || (z.attract && now - z.attract.t < 1500))) requestAnimationFrame(tick);
    else { z.running = false; still(); }
  }
  el.addEventListener('pointerleave', () => { last = null; });
  el.addEventListener('pointermove', e => { if (calm.matches) return; const p = at(e); if (last) recipe.move(z, p, last, Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, p.t - last.t), p.t); last = p; z.lastMove = p.t; start(); });
  el.addEventListener('pointerdown', e => { if (calm.matches) return; const p = at(e); recipe.click(z, p, p.t); start(); });
  return z;
}

window.TrailPreview = { kinds: Object.keys(KINDS), zone, settings: TR };
})();
