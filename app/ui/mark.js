'use strict';

// The moving mark. Every img[data-live-mark] becomes the official mark drawn as one path that bends, with the swim of
// mark-swim.js. The pointer on the mark starts a gesture at once; while something loads (.loading) the gestures come more
// often. data-live-mark="swim" also floats, "bare" is the fish alone in the color of the text with its lamp lit.
// Still when Windows asks for less motion; the image stays when the data is missing.
(function () {
  if (!MarkSwim) return;
  const D = MarkSwim.D, middle = MarkSwim.middle;
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const inner = s => `${D.inner}${s}</g>`;
  let busy = false;

  const marks = [];
  for (const img of document.querySelectorAll('img[data-live-mark]')) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('class', img.getAttribute('class') || '');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.aspectRatio = '1';
    const bare = img.dataset.liveMark === 'bare';
    if (bare) svg.classList.add('mark-bare');
    svg.innerHTML = `${bare ? '' : D.plate}<g class="mark-swim"><path class="mark-body" fill="#FFFFFF" fill-rule="evenodd"/>${inner(D.mouth)}<g class="mark-dots">${inner(D.eye)}</g>`
      + `<g class="mark-lamp"><g class="mark-glow">${inner(D.halos)}</g>${inner(D.tip + D.lamp)}</g></g>`;
    if (bare) {
      for (const e of svg.querySelectorAll('[fill="#FFFFFF"]')) e.setAttribute('fill', 'currentColor');
      for (const e of svg.querySelectorAll('.mark-lamp circle, .mark-glow circle')) e.setAttribute('fill', 'var(--lit, #2ED9C6)');
    }
    img.replaceWith(svg);
    const m = { svg, fish: MarkSwim.swimmer(), swims: img.dataset.liveMark === 'swim', body: svg.querySelector('.mark-body'), dots: svg.querySelector('.mark-dots'),
      lamp: svg.querySelector('.mark-lamp'), glow: svg.querySelector('.mark-glow'), swim: svg.querySelector('.mark-swim'), seen: true };
    // Only the mark itself reacts, not the whole button around it: one lively gesture, then rest.
    svg.addEventListener('pointerenter', () => m.fish.poke());
    m.body.setAttribute('d', MarkSwim.path(MarkSwim.still));
    marks.push(m);
  }
  if (!marks.length) return;
  // A mark out of sight (a hidden page, an answer scrolled away) keeps its pose and costs nothing.
  const sight = new IntersectionObserver(list => { for (const e of list) { const m = marks.find(x => x.svg === e.target); if (m) m.seen = e.isIntersecting; } });
  for (const m of marks) sight.observe(m.svg);

  // A wait anywhere in the window (the spinning .loading) makes the fish move openly, as if it worked too.
  // Only a wait that shows counts: hidden pages keep their placeholders marked .loading.
  setInterval(() => { busy = [...document.querySelectorAll('.loading')].some(e => e.checkVisibility()); }, 400);

  let last = null;
  function frame(now) {
    if (reduce.matches) { for (const m of marks) m.body.setAttribute('d', MarkSwim.path(MarkSwim.still)); last = null; return; }
    requestAnimationFrame(frame);
    const dt = last === null ? 0 : (now - last) / 1000;
    last = now;
    for (const m of marks) {
      if (!m.seen) continue;
      const pose = m.fish.step(dt, busy);
      m.body.setAttribute('d', MarkSwim.path(pose));
      m.dots.setAttribute('transform', `translate(0 ${D.lid}) scale(1 ${pose.lid.toFixed(3)}) translate(0 ${-D.lid})`);
      m.dots.setAttribute('opacity', pose.eye.toFixed(2));
      m.lamp.setAttribute('transform', `rotate(${(pose.rod * 180 / Math.PI).toFixed(2)} ${D.root[0]} ${D.root[1]})`);
      m.glow.setAttribute('transform', `translate(${D.light[0]} ${D.light[1]}) scale(${pose.glow.toFixed(3)}) translate(${-D.light[0]} ${-D.light[1]})`);
      m.swim.setAttribute('transform', (m.swims ? `translate(0 ${(Math.sin(pose.t * 2 * Math.PI / 5.5) * 4).toFixed(2)}) ` : '') + `rotate(${pose.rock.toFixed(2)} ${middle[0].toFixed(1)} ${middle[1].toFixed(1)})`);
    }
  }
  requestAnimationFrame(frame);
  reduce.addEventListener('change', () => { if (!reduce.matches) requestAnimationFrame(frame); });
})();
