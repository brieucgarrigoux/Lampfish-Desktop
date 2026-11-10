'use strict';

// Drawing on a capture: each mark is kept apart in the coordinates of the image, so Undo removes the last one and the image is redrawn.
// A crop is a mark too: the last one sets the part of the image that is shown and exported.
(function () {
  const canvas = $('an-canvas'), ctx = canvas.getContext('2d'), input = $('an-text'), stage = $('an-stage');
  const name = new URLSearchParams(location.search).get('name') || '';
  const marks = [];
  let base = null, tool = 'arrow', color = '#0F9D8F', size = 1, current = null;

  const TOOLS = [
    ['pen', 'Pen', 'P', 'pen', 'Draw freely'],
    ['line', 'Line', 'L', 'line-segment', 'Drag to draw a line, Shift keeps it straight'],
    ['arrow', 'Arrow', 'A', 'arrow-up-right', 'Drag from the tail to the tip, Shift keeps it straight'],
    ['box', 'Frame', 'F', 'rectangle', 'Drag to frame a part'],
    ['ellipse', 'Ellipse', 'E', 'lf-ellipse', 'Drag to circle a part'],
    ['marker', 'Highlighter', 'H', 'highlighter', 'Drag over text to highlight it'],
    ['number', 'Number', 'N', 'number-circle-one', 'Click to place 1, 2, 3… in order'],
    ['text', 'Text', 'T', 'text-t', 'Click where the text goes, Enter to place it'],
    ['pixelate', 'Pixelate', 'X', 'checkerboard', 'Drag over what must not be read'],
    ['crop', 'Crop', 'C', 'crop', 'Drag the part to keep'],
  ];
  for (const [id, label, key, symbol] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.tool = id;
    b.title = tr(label) + ' (' + key + ')';
    b.setAttribute('aria-label', tr(label));
    b.innerHTML = icon(symbol);
    b.addEventListener('click', () => pickTool(id));
    $('an-tools').append(b);
  }
  function pickTool(id) {
    commitText();
    tool = id;
    for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-checked', String(b.dataset.tool === id));
    const t = TOOLS.find(x => x[0] === id);
    $('an-hint').textContent = tr(t[1]) + ' · ' + tr(t[4]);
  }
  function pick(group, attr, value) { for (const b of document.querySelectorAll(`${group} [${attr}]`)) b.setAttribute('aria-checked', String(b.getAttribute(attr) === value)); }
  for (const b of document.querySelectorAll('[data-color]')) { b.style.setProperty('--swatch', b.dataset.color); b.addEventListener('click', () => { color = b.dataset.color; pick('.an-colors', 'data-color', color); }); }
  for (const b of document.querySelectorAll('[data-size]')) b.addEventListener('click', () => { size = Number(b.dataset.size); pick('.an-sizes', 'data-size', b.dataset.size); });

  const view = () => { for (let i = marks.length - 1; i >= 0; i--) if (marks[i].tool === 'crop') return marks[i]; return base ? { x: 0, y: 0, w: base.naturalWidth, h: base.naturalHeight } : { x: 0, y: 0, w: 1, h: 1 }; };
  const scale = () => canvas.width / canvas.getBoundingClientRect().width;
  const at = e => { const r = canvas.getBoundingClientRect(), k = scale(), v = view(); return { x: (e.clientX - r.left) * k + v.x, y: (e.clientY - r.top) * k + v.y }; };
  const line = () => Math.max(3, Math.round(view().w / 400)) * size;
  const box = m => ({ x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) });

  // Shift keeps a line on the nearest eighth of a turn.
  function straight(m, e) {
    if (!e.shiftKey) return;
    const dx = m.x2 - m.x1, dy = m.y2 - m.y1, len = Math.hypot(dx, dy), a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    m.x2 = m.x1 + Math.cos(a) * len; m.y2 = m.y1 + Math.sin(a) * len;
  }

  function draw(m) {
    const v = view();
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = m.color;
    ctx.lineWidth = m.width;
    ctx.lineCap = ctx.lineJoin = 'round';
    if (m.tool === 'arrow' || m.tool === 'line') {
      const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), head = m.width * 4.5, back = m.tool === 'arrow' ? head * .6 : 0;
      ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2 - Math.cos(angle) * back, m.y2 - Math.sin(angle) * back); ctx.stroke();
      if (m.tool === 'arrow') {
        ctx.beginPath(); ctx.moveTo(m.x2, m.y2);
        ctx.lineTo(m.x2 - head * Math.cos(angle - .45), m.y2 - head * Math.sin(angle - .45));
        ctx.lineTo(m.x2 - head * Math.cos(angle + .45), m.y2 - head * Math.sin(angle + .45));
        ctx.closePath(); ctx.fill();
      }
    } else if (m.tool === 'box') {
      const b = box(m); ctx.strokeRect(b.x, b.y, b.w, b.h);
    } else if (m.tool === 'ellipse') {
      const b = box(m); ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (m.tool === 'pen' || m.tool === 'marker') {
      if (m.tool === 'marker') { ctx.globalAlpha = .38; ctx.lineWidth = m.width * 5; ctx.lineCap = 'butt'; }
      ctx.beginPath(); m.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    } else if (m.tool === 'number') {
      const r = m.width * 5;
      ctx.beginPath(); ctx.arc(m.x1, m.y1, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, m.width / 2); ctx.strokeStyle = 'rgba(0, 0, 0, .35)'; ctx.stroke();
      ctx.fillStyle = m.color.toLowerCase() === '#ffffff' ? '#111' : '#fff';
      ctx.font = `700 ${Math.round(r * 1.15)}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(m.n), m.x1, m.y1 + r * .06);
    } else if (m.tool === 'text') {
      ctx.font = `600 ${m.width * 7}px "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = m.width * 1.4; ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
      ctx.strokeText(m.text, m.x1, m.y1); ctx.fillText(m.text, m.x1, m.y1);
    } else if (m.tool === 'pixelate') {
      // Big blocks hide the text for good, where a light blur can sometimes be read back. The canvas is read in its own pixels.
      const b = box(m), x = Math.round(b.x), y = Math.round(b.y), w = Math.round(b.w), h = Math.round(b.h);
      if (w > 1 && h > 1) {
        const block = Math.max(8, Math.round(v.w / 120)), small = document.createElement('canvas');
        small.width = Math.max(1, Math.ceil(w / block)); small.height = Math.max(1, Math.ceil(h / block));
        small.getContext('2d').drawImage(canvas, x - v.x, y - v.y, w, h, 0, 0, small.width, small.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
      }
    } else if (m.tool === 'crop' && m === current) {
      // While a crop is drawn, what will go is dimmed.
      const b = box(m);
      ctx.fillStyle = 'rgba(0, 0, 0, .55)';
      ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.rect(b.x, b.y, b.w, b.h); ctx.fill('evenodd');
      ctx.setLineDash([m.width * 2, m.width * 2]); ctx.lineWidth = Math.max(2, m.width / 2); ctx.strokeStyle = '#fff';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
  }

  function fit() {
    if (!base) return;
    const v = view(), r = stage.getBoundingClientRect(), room = { w: r.width - 32, h: r.height - 16 };
    const k = Math.min(1 / devicePixelRatio, room.w / v.w, room.h / v.h);
    canvas.style.width = Math.max(1, v.w * k) + 'px';
    canvas.style.height = Math.max(1, v.h * k) + 'px';
  }
  new ResizeObserver(fit).observe(stage);

  function paint() {
    if (!base) return;
    const v = view();
    if (canvas.width !== Math.round(v.w) || canvas.height !== Math.round(v.h)) { canvas.width = Math.round(v.w); canvas.height = Math.round(v.h); fit(); }
    ctx.setTransform(1, 0, 0, 1, -v.x, -v.y);
    ctx.drawImage(base, 0, 0);
    for (const m of marks) if (m.tool !== 'crop') draw(m);
    if (current) draw(current);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    $('an-undo').disabled = !marks.length;
  }

  canvas.addEventListener('pointerdown', e => {
    if (!base || e.button !== 0) return;
    const p = at(e);
    if (tool === 'text') { place(p, e); return; }
    if (tool === 'number') { marks.push({ tool, color, width: line(), x1: p.x, y1: p.y, n: marks.filter(m => m.tool === 'number').length + 1 }); paint(); return; }
    canvas.setPointerCapture(e.pointerId);
    current = { tool, color, width: line(), x1: p.x, y1: p.y, x2: p.x, y2: p.y, points: [p] };
  });
  canvas.addEventListener('pointermove', e => {
    if (!current) return;
    const p = at(e), v = view();
    current.x2 = Math.max(v.x, Math.min(v.x + v.w, p.x)); current.y2 = Math.max(v.y, Math.min(v.y + v.h, p.y));
    if (current.tool === 'line' || current.tool === 'arrow') straight(current, e);
    if (current.tool === 'pen' || current.tool === 'marker') current.points.push(p);
    paint();
  });
  canvas.addEventListener('pointerup', () => {
    if (!current) return;
    const m = current;
    current = null;
    if (m.tool === 'crop') {
      const b = box(m);
      if (b.w > 8 && b.h > 8) marks.push({ tool: 'crop', x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
    } else if (Math.hypot(m.x2 - m.x1, m.y2 - m.y1) > 3 || m.points.length > 2) marks.push(m);
    paint();
  });

  function place(p, e) {
    const r = stage.getBoundingClientRect();
    input.hidden = false;
    input.value = '';
    input.style.left = e.clientX - r.left + 'px';
    input.style.top = e.clientY - r.top + 'px';
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

  function undo() { marks.pop(); paint(); fit(); }
  function done() { commitText(); paint(); send('annotate.save', { data: canvas.toDataURL('image/png') }); }
  $('an-undo').addEventListener('click', undo);
  $('an-done').addEventListener('click', done);
  $('an-close').addEventListener('click', () => send('annotate.close'));
  $('an-delete').addEventListener('click', () => send('annotate.delete'));
  addEventListener('keydown', e => {
    if (!input.hidden) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey && (e.key.toLowerCase() === 's' || e.key === 'Enter')) { e.preventDefault(); done(); }
    else if (e.key === 'Escape') send('annotate.close');
    else if (!e.ctrlKey && !e.altKey) { const t = TOOLS.find(x => x[2] === e.key.toUpperCase()); if (t) pickTool(t[0]); }
  });

  // The capture comes as data from lampfish, so the canvas can be written back as a PNG.
  webview.addEventListener('message', e => {
    const m = e.data;
    if (m.type !== 'annotate.image') return;
    const img = new Image();
    img.onload = () => { base = img; canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; fit(); paint(); };
    img.src = m.data;
  });
  pickTool('arrow');
  document.title = tr('Annotate') + ' · ' + name;
  send('annotate.load', { name });
})();
