'use strict';

(function () {
  const SPACE_CONTENTS = 480;

  for (const panel of document.querySelectorAll('[data-resizable]')) {
    const side = panel.dataset.resizable;
    const variable = panel.dataset.variable;
    const min = Number(panel.dataset.min || 260), max = Number(panel.dataset.max || 640);
    const initial = Number(panel.dataset.initial || 300);
    const key = 'width' + variable;

    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Panel width');
    document.body.append(handle);

    let width = initial;
    try { width = Number(localStorage.getItem(key)) || initial; } catch (e) { }

    function limit() {
      const c = document.querySelector('.contents');
      const layout = panel.getBoundingClientRect().width + (c ? c.getBoundingClientRect().width : 0) - SPACE_CONTENTS;
      return Math.max(min, Math.min(max, layout));
    }

    function apply(v, remember) {
      width = Math.round(Math.max(min, Math.min(v, limit())));
      document.body.style.setProperty(variable, width + 'px');
      handle.setAttribute('aria-valuenow', width);
      handle.setAttribute('aria-valuemin', min);
      handle.setAttribute('aria-valuemax', max);
      if (remember) try { localStorage.setItem(key, width); } catch (e) { }
      place();
    }

    function place() {
      const r = panel.getBoundingClientRect();
      handle.style.left = (side === 'left' ? r.left : r.right) - 4 + 'px';

      handle.hidden = r.width === 0 || r.top > 1;
    }

    let start = null;
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      handle.setPointerCapture(e.pointerId);
      start = { x: e.clientX, width };
      document.body.classList.add('resizing');
    });

    let target = null, image = 0;
    handle.addEventListener('pointermove', e => {
      if (!start) return;
      const d = e.clientX - start.x;
      target = start.width + (side === 'left' ? -d : d);
      if (!image) image = requestAnimationFrame(() => { image = 0; if (target !== null) apply(target, false); });
    });
    const release = () => {
      if (!start) return;
      start = null;
      if (target !== null) { width = target; target = null; }
      document.body.classList.remove('resizing');
      apply(width, true);
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
    handle.addEventListener('dblclick', () => apply(initial, true));
    handle.addEventListener('keydown', e => {
      const step = e.shiftKey ? 64 : 16, direction = side === 'left' ? -1 : 1;
      const v = { ArrowLeft: width - step * direction, ArrowRight: width + step * direction, Home: min, End: max }[e.key];
      if (v === undefined) return;
      e.preventDefault();
      apply(v, true);
    });

    new ResizeObserver(place).observe(panel);
    addEventListener('resize', () => apply(width, false));
    apply(width, false);
  }
})();
