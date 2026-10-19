'use strict';

const Chart = (function () {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  const guide = document.createElement('div');
  guide.className = 'chart-guide';
  guide.hidden = true;
  document.body.append(guide, tip);
  const dots = [];

  function hide() {
    tip.hidden = guide.hidden = true;
    for (const d of dots) d.hidden = true;
  }

  function dot(i) {
    if (!dots[i]) {
      dots[i] = document.createElement('i');
      dots[i].className = 'chart-dot';
      document.body.append(dots[i]);
    }
    return dots[i];
  }

  function show(el, info) {
    const r = el.getBoundingClientRect();
    const x = r.left + info.at * r.width;
    guide.hidden = false;
    guide.style.cssText = `left:${x.toFixed(1)}px;top:${r.top.toFixed(1)}px;height:${r.height.toFixed(1)}px`;
    info.lines.forEach((l, i) => {
      const d = dot(i);
      d.hidden = false;
      d.style.cssText = `left:${x.toFixed(1)}px;top:${(r.top + l.y * r.height).toFixed(1)}px;background:${l.color}`;
      d.classList.toggle('hot', !!l.hot);
    });
    for (let i = info.lines.length; i < dots.length; i++) dots[i].hidden = true;

    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'chart-tip__head';
    const title = document.createElement('b');
    title.textContent = info.title;
    const when = document.createElement('span');
    when.textContent = info.when;
    head.append(title, when);
    tip.append(head);
    if (info.note) {
      const p = document.createElement('p');
      p.textContent = info.note;
      tip.append(p);
    }
    for (const l of info.lines) {
      const row = document.createElement('div');
      row.className = 'chart-tip__line' + (l.hot ? ' hot' : '');
      const swatch = document.createElement('i');
      swatch.style.background = l.color;
      const name = document.createElement('span');
      name.textContent = l.label;
      const value = document.createElement('em');
      value.textContent = l.value;
      row.append(swatch, name, value);
      tip.append(row);
    }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = r.top - h - 8;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top < 8) top = r.bottom + 8;
    tip.style.cssText = `left:${Math.max(8, left).toFixed(1)}px;top:${Math.max(8, top).toFixed(1)}px`;
  }

  function bind(el, resolve) {
    if (!el) return;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const info = resolve(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
      if (info) show(el, info); else hide();
    });
    el.addEventListener('pointerleave', hide);
  }

  function ago(seconds) {
    return seconds <= 0 ? tr('now') : tr('{0} s ago', seconds);
  }

  return { bind, hide, ago };
})();
