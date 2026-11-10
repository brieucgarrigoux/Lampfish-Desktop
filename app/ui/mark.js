'use strict';

// The moving mark. Every img[data-live-mark] becomes the official mark drawn as one path that bends: the tail sways and makes a
// gesture now and then, the rod bends like a fishing rod and the lamp follows it, the little fin waves on its own, the eye blinks,
// the glow breathes. The tail is still between its gestures, as a fish at rest. The pointer on the mark starts a gesture at once;
// while something loads (.loading) the gestures come more often. data-live-mark="swim" also floats.
// Still when Windows asks for less motion; the image stays when the data is missing.
(function () {
  if (typeof MARK_DATA === 'undefined') return;
  const D = MARK_DATA;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const deg = Math.PI / 180;
  const rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
  const ease = k => .5 - Math.cos(Math.max(0, Math.min(1, k)) * Math.PI) / 2;
  const keys = (list, step) => u => { const i = Math.floor(u / step), k = u / step - i; return i < 0 || i >= list.length - 1 ? 0 : list[i] + (list[i + 1] - list[i]) * ease(k); };
  const inner = s => `${D.inner}${s}</g>`;

  function path(tail, rod, lid, fin) {
    let d = '';
    for (const ring of D.rings) {
      d += 'M';
      for (let i = 0; i < ring.length; i++) {
        let [x, y, k, w] = ring[i];
        if (k === 1 && w) [x, y] = rot(x, y, D.tail[0], D.tail[1], tail(w) * w);
        else if (k === 2 && w) [x, y] = rot(x, y, D.root[0], D.root[1], rod * w);
        else if (k === 3 && lid !== 1) y = D.lid + (y - D.lid) * lid;
        else if (k === 4 && fin) [x, y] = rot(x, y, D.fin[0], D.fin[1], fin);
        d += (i ? 'L' : '') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      d += 'Z';
    }
    return d;
  }

  // The gestures of the tail, as a fish never makes the same one twice.
  const MOVES = [
    { w: 3, len: 1.1, f: keys([0, 9, -7, 6, -3, 0], .2) },
    { w: 2, len: 1.5, f: u => 11 * Math.sin(Math.PI * Math.min(1, u / 1.5)) },
    { w: 2, len: .8, f: u => 3.2 * Math.sin(2 * Math.PI * u / .13) * (1 - u / .8) },
    { w: 2, len: 1, f: keys([0, 14, -5, 2, 0], .24) },
    { w: 1, len: 1.6, f: u => 8 * (u < .4 ? ease(u / .4) : u < 1.1 ? 1 : 1 - ease((u - 1.1) / .5)) },
  ];
  const pick = () => { let r = Math.random() * MOVES.reduce((s, m) => s + m.w, 0); for (const m of MOVES) if ((r -= m.w) < 0) return m; return MOVES[0]; };
  // One clock and one throw of the dice for every mark of the page.
  const S = { move: null, nextMove: 1.5, blinkAt: -9, nextBlink: 2.5, start: null, busy: false };

  const marks = [];
  for (const img of document.querySelectorAll('img[data-live-mark]')) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('class', img.getAttribute('class') || '');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.aspectRatio = '1';
    svg.innerHTML = `${D.plate}<g class="mark-swim"><path class="mark-body" fill="#FFFFFF" fill-rule="evenodd"/>${inner(D.mouth)}<g class="mark-dots">${inner(D.eye)}</g>`
      + `<g class="mark-lamp"><g class="mark-glow">${inner(D.halos)}</g>${inner(D.tip + D.lamp)}</g></g>`;
    img.replaceWith(svg);
    const m = { svg, swims: img.dataset.liveMark === 'swim', body: svg.querySelector('.mark-body'), dots: svg.querySelector('.mark-dots'), lamp: svg.querySelector('.mark-lamp'),
      glow: svg.querySelector('.mark-glow'), swim: svg.querySelector('.mark-swim'), own: null, lit: 0 };
    // Only the mark itself reacts, not the whole button around it: one lively gesture, then rest.
    svg.addEventListener('pointerenter', () => { if (S.start !== null && !m.own) m.own = { m: MOVES[Math.random() < .5 ? 0 : 3], at: performance.now() / 1000 - S.start, s: Math.random() < .5 ? -1 : 1 }; });
    m.body.setAttribute('d', path(() => 0, 0, 1, 0));
    marks.push(m);
  }
  if (!marks.length) return;

  // A wait anywhere in the window (the spinning .loading) makes the fish move openly, as if it worked too.
  // Only a wait that shows counts: hidden pages keep their placeholders marked .loading.
  setInterval(() => { S.busy = [...document.querySelectorAll('.loading')].some(e => e.checkVisibility()); }, 400);

  let last = 0;
  function frame(now) {
    if (reduce.matches) { for (const m of marks) m.body.setAttribute('d', path(() => 0, 0, 1, 0)); return; }
    requestAnimationFrame(frame);
    // 30 images a second are enough for a small mark, and half the work.
    if (now - last < 32) return;
    last = now;
    if (S.start === null) S.start = now / 1000;
    const t = now / 1000 - S.start;
    if (!S.move && t >= S.nextMove) S.move = { m: pick(), at: t, s: Math.random() < .5 ? -1 : 1 };
    if (S.move && t - S.move.at > S.move.m.len + .3) { S.move = null; S.nextMove = t + (S.busy ? .5 + Math.random() : 3 + Math.random() * 5); }
    if (t >= S.nextBlink) { S.blinkAt = t; S.nextBlink = t + 3 + Math.random() * 4 + (Math.random() < .25 ? -2.8 : 0); }
    const b = (t - S.blinkAt) / .26, lid = b >= 0 && b < 1 ? Math.max(.08, Math.abs(1 - 2 * b)) : 1;
    const fin = (Math.sin(t * 2 * Math.PI / 3.3) * 3.6 + Math.sin(t * 2 * Math.PI / 1.9 + 1.3) * 1.4) * deg;
    const float = Math.sin(t * 2 * Math.PI / 9) * 1.5;
    const ru = (t % 7) - 5.6, rodAuto = ru < 0 || ru > 1.4 ? 0 : keys([0, -5, 3, -1, 0], .28)(ru);
    const gesture = (g, w) => g ? g.s * g.m.f(t - g.at - .12 * w) : 0;
    for (const m of marks) {
      if (m.own && t - m.own.at > m.own.m.len + .3) m.own = null;
      // The lamp swings with a gesture of the pointer and glows a little more meanwhile.
      const own = m.own ? Math.sin(Math.PI * Math.min(1, (t - m.own.at) / m.own.m.len)) : 0;
      m.lit += (own - m.lit) * .2;
      const tail = w => (gesture(S.move, w) + gesture(m.own, w)) * deg;
      const rod = (float + rodAuto - own * 4 * Math.sin((t - (m.own ? m.own.at : 0)) * 2 * Math.PI / 1.1)) * deg;
      m.body.setAttribute('d', path(tail, rod, lid, fin));
      m.dots.setAttribute('transform', `translate(0 ${D.lid}) scale(1 ${lid.toFixed(3)}) translate(0 ${-D.lid})`);
      m.dots.setAttribute('opacity', Math.max(0, Math.min(1, (lid - .6) / .25)).toFixed(2));
      m.lamp.setAttribute('transform', `rotate(${(rod / deg).toFixed(2)} ${D.root[0]} ${D.root[1]})`);
      const g = 1 + .05 * Math.sin(t * 2 * Math.PI / 3.6) + .1 * m.lit;
      m.glow.setAttribute('transform', `translate(${D.light[0]} ${D.light[1]}) scale(${g.toFixed(3)}) translate(${-D.light[0]} ${-D.light[1]})`);
      if (m.swims) m.swim.setAttribute('transform', `translate(0 ${(Math.sin(t * 2 * Math.PI / 5.5) * 4).toFixed(2)})`);
    }
  }
  requestAnimationFrame(frame);
  reduce.addEventListener('change', () => { if (!reduce.matches) requestAnimationFrame(frame); });
})();
