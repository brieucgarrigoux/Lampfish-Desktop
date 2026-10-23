'use strict';

// Drawing on a capture: each mark is kept apart, so Undo removes the last one and the image is redrawn from the original.
(function () {
  const canvas = $('an-canvas'), ctx = canvas.getContext('2d'), input = $('an-text');
  const name = new URLSearchParams(location.search).get('name') || '';
  const marks = [];
  let base = null, tool = 'arrow', color = '#9561f3', current = null;

  function pick(group, attr, value) { for (const b of document.querySelectorAll(`[${attr}]`)) if (b.closest(group)) b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)); }
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => { tool = b.dataset.tool; pick('.an-tools', 'data-tool', tool); });
  for (const b of document.querySelectorAll('[data-color]')) { b.style.setProperty('--swatch', b.dataset.color); b.addEventListener('click', () => { color = b.dataset.color; pick('.an-colors', 'data-color', color); }); }

  const scale = () => canvas.width / canvas.getBoundingClientRect().width;
  const at = e => { const r = canvas.getBoundingClientRect(), k = scale(); return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
  const line = () => Math.max(3, Math.round(canvas.width / 400));

  function draw(m) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = m.color;
    ctx.lineWidth = m.width;
    ctx.lineCap = ctx.lineJoin = 'round';
    if (m.tool === 'arrow') {
      const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), head = m.width * 4.5;
      ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2 - Math.cos(angle) * head * .6, m.y2 - Math.sin(angle) * head * .6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.x2, m.y2);
      ctx.lineTo(m.x2 - head * Math.cos(angle - .45), m.y2 - head * Math.sin(angle - .45));
      ctx.lineTo(m.x2 - head * Math.cos(angle + .45), m.y2 - head * Math.sin(angle + .45));
      ctx.closePath(); ctx.fill();
    } else if (m.tool === 'box') {
      ctx.strokeRect(Math.min(m.x1, m.x2), Math.min(m.y1, m.y2), Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
    } else if (m.tool === 'marker') {
      ctx.globalAlpha = .38; ctx.lineWidth = m.width * 5; ctx.lineCap = 'butt';
      ctx.beginPath(); m.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    } else if (m.tool === 'text') {
      ctx.font = `600 ${m.width * 7}px "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = m.width * 1.4; ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
      ctx.strokeText(m.text, m.x1, m.y1); ctx.fillText(m.text, m.x1, m.y1);
    } else if (m.tool === 'pixelate') {
      // Big blocks hide the text for good, where a light blur can sometimes be read back.
      const x = Math.round(Math.min(m.x1, m.x2)), y = Math.round(Math.min(m.y1, m.y2)), w = Math.round(Math.abs(m.x2 - m.x1)), h = Math.round(Math.abs(m.y2 - m.y1));
      if (w > 1 && h > 1) {
        const block = Math.max(8, Math.round(canvas.width / 120)), small = document.createElement('canvas');
        small.width = Math.max(1, Math.ceil(w / block)); small.height = Math.max(1, Math.ceil(h / block));
        small.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
      }
    }
    ctx.restore();
  }

  function paint() {
    if (!base) return;
    ctx.drawImage(base, 0, 0);
    marks.forEach(draw);
    if (current) draw(current);
    $('an-undo').disabled = !marks.length;
  }

  canvas.addEventListener('pointerdown', e => {
    if (!base || e.button !== 0) return;
    const p = at(e);
    if (tool === 'text') { place(p, e); return; }
    canvas.setPointerCapture(e.pointerId);
    current = { tool, color, width: line(), x1: p.x, y1: p.y, x2: p.x, y2: p.y, points: [p] };
  });
  canvas.addEventListener('pointermove', e => {
    if (!current) return;
    const p = at(e);
    current.x2 = p.x; current.y2 = p.y;
    if (current.tool === 'marker') current.points.push(p);
    paint();
  });
  canvas.addEventListener('pointerup', () => {
    if (!current) return;
    if (Math.hypot(current.x2 - current.x1, current.y2 - current.y1) > 3 || current.points.length > 2) marks.push(current);
    current = null;
    paint();
  });

  function place(p, e) {
    const r = $('an-stage').getBoundingClientRect();
    input.hidden = false;
    input.value = '';
    input.style.left = e.clientX - r.left + $('an-stage').scrollLeft + 'px';
    input.style.top = e.clientY - r.top + $('an-stage').scrollTop + 'px';
    input.style.color = color;
    input.dataset.x = p.x; input.dataset.y = p.y;
    setTimeout(() => input.focus(), 0);
  }
  function commitText() {
    if (input.hidden) return;
    const text = input.value.trim();
    input.hidden = true;
    if (text) { marks.push({ tool: 'text', color, width: line(), x1: Number(input.dataset.x), y1: Number(input.dataset.y), text }); paint(); }
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } if (e.key === 'Escape') { e.stopPropagation(); input.hidden = true; } });
  input.addEventListener('blur', commitText);

  function undo() { marks.pop(); paint(); }
  function done() { commitText(); send('annotate.save', { data: canvas.toDataURL('image/png') }); }
  $('an-undo').addEventListener('click', undo);
  $('an-done').addEventListener('click', done);
  $('an-close').addEventListener('click', () => send('annotate.close'));
  $('an-delete').addEventListener('click', () => send('annotate.delete'));
  addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey && (e.key.toLowerCase() === 's' || e.key === 'Enter')) { e.preventDefault(); done(); }
    else if (e.key === 'Escape' && input.hidden) send('annotate.close');
  });

  // The capture comes as data from Bramble, so the canvas can be written back as a PNG.
  webview.addEventListener('message', e => {
    const m = e.data;
    if (m.type !== 'annotate.image') return;
    const img = new Image();
    img.onload = () => { base = img; canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; paint(); };
    img.src = m.data;
  });
  document.title = tr('Annotate') + ' · ' + name;
  send('annotate.load', { name });
})();
