'use strict';

(function () {
  const ZONES = ['.contents', '.panel', 'document'];

  for (const sel of ZONES) {
    const whole = sel === 'document';
    const zone = whole ? document.scrollingElement : document.querySelector(sel);
    if (!zone) continue;
    if (!whole) zone.classList.add('scrollable');
    const rail = document.createElement('div');
    rail.className = 'rail-scrollable';
    rail.innerHTML = '<i class="thumb-scrollable"></i>';
    document.body.append(rail);
    const thumb = rail.firstChild;
    let frame = 0;

    const box = () => whole ? { top: 0, right: innerWidth, width: innerWidth, height: innerHeight } : zone.getBoundingClientRect();
    function place() {
      frame = 0;
      const r = box();
      const rest = zone.scrollHeight - zone.clientHeight;
      if (r.width === 0 || r.height === 0 || rest <= 1) { rail.hidden = true; return; }
      rail.hidden = false;
      const up = r.height - 8;
      rail.style.left = (r.right - 14) + 'px';
      rail.style.top = (r.top + 4) + 'px';
      rail.style.height = up + 'px';
      const h = Math.max(32, up * zone.clientHeight / zone.scrollHeight);
      thumb.style.height = h + 'px';
      thumb.style.transform = `translateY(${((up - h) * zone.scrollTop / rest).toFixed(1)}px)`;
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

    (whole ? window : zone).addEventListener('scroll', () => { schedule(); rail.classList.add('active'); clearTimeout(rail.timer); rail.timer = setTimeout(() => rail.classList.remove('active'), 900); }, { passive: true });
    new ResizeObserver(schedule).observe(whole ? document.body : zone);
    new MutationObserver(schedule).observe(whole ? document.body : zone, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    addEventListener('resize', schedule);

    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'style'] });

    let grip = null;
    thumb.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      thumb.setPointerCapture(e.pointerId);
      grip = { y: e.clientY, up: zone.scrollTop };
      rail.classList.add('dragging');
    });
    thumb.addEventListener('pointermove', e => {
      if (!grip) return;
      const up = rail.clientHeight, h = thumb.offsetHeight;
      zone.scrollTop = grip.up + (e.clientY - grip.y) * (zone.scrollHeight - zone.clientHeight) / Math.max(1, up - h);
    });
    const release = () => { grip = null; rail.classList.remove('dragging'); };
    thumb.addEventListener('pointerup', release);
    thumb.addEventListener('pointercancel', release);

    rail.addEventListener('pointerdown', e => {
      if (e.target !== rail) return;
      const p = thumb.getBoundingClientRect();
      zone.scrollBy({ top: (e.clientY < p.top ? -1 : 1) * zone.clientHeight * 0.9, behavior: 'smooth' });
    });

    rail.addEventListener('wheel', e => { zone.scrollTop += e.deltaY; }, { passive: true });
    schedule();
  }
})();
