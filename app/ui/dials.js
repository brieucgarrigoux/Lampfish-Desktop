'use strict';

// A bubble of details over an instrument, on hover or keyboard focus: a few more facts without opening its page.
const detailTip = Object.assign(document.createElement('div'), { className: 'chart-tip detail-tip', hidden: true });
document.body.append(detailTip);
let detailTimer = 0, detailFor = null;
function showDetails(el) {
  const d = typeof el._details === 'function' ? el._details() : el._details;
  if (!d) return;
  detailFor = el;
  const head = Object.assign(document.createElement('div'), { className: 'chart-tip__head' });
  head.append(Object.assign(document.createElement('b'), { textContent: d.title }));
  if (d.value) head.append(Object.assign(document.createElement('span'), { textContent: d.value }));
  const parts = [head];
  if (d.note) parts.push(Object.assign(document.createElement('p'), { textContent: d.note }));
  for (const [label, value] of d.lines || []) {
    if (value == null || value === '') continue;
    const line = Object.assign(document.createElement('div'), { className: 'chart-tip__line' });
    line.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('em'), { textContent: value, translate: false }));
    parts.push(line);
  }
  detailTip.replaceChildren(...parts);
  detailTip.hidden = false;
  const r = el.getBoundingClientRect(), t = detailTip.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
  const top = r.top - t.height - 8 >= 8 ? r.top - t.height - 8 : r.bottom + 8;
  detailTip.style.left = left.toFixed(1) + 'px';
  detailTip.style.top = top.toFixed(1) + 'px';
}
function hideDetails() { clearTimeout(detailTimer); detailTip.hidden = true; detailFor = null; }
function details(el, d) {
  el._details = d;
  if (el._detailsBound) return;
  el._detailsBound = true;
  const soon = () => { clearTimeout(detailTimer); detailTimer = setTimeout(() => showDetails(el), 250); };
  el.addEventListener('mouseenter', soon);
  el.addEventListener('focus', soon);
  el.addEventListener('mouseleave', hideDetails);
  el.addEventListener('blur', hideDetails);
  el.addEventListener('click', hideDetails);
}
addEventListener('scroll', hideDetails, true);

// The last minutes of each measure shown as rows, kept in memory only: nothing is written to the disk.
const meterHistory = new Map();
const METER_POINTS = 60;
function meterCurve(svg, points) {
  const w = 120, h = 32, n = points.length;
  const xy = points.map((p, i) => [(n < 2 ? 1 : i / (n - 1)) * w, h - 2 - Math.max(0, Math.min(100, p)) / 100 * (h - 4)]);
  if (n < 2) xy.unshift([0, xy[0][1]]);
  const line = 'M' + xy.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join(' L');
  svg.querySelector('.meter__line').setAttribute('d', line);
  svg.querySelector('.meter__area').setAttribute('d', line + ` L${w} ${h} L0 ${h} Z`);
}
function meters(zone, list) {
  const now = Date.now();
  list.forEach((g, i) => {
    let el = zone.children[i];
    if (!el || el.tagName !== (g.action ? 'BUTTON' : 'DIV')) {
      const fresh = document.createElement(g.action ? 'button' : 'div');
      fresh.innerHTML = '<span class="meter__what"><span class="meter__label"></span><span class="meter__sub"></span></span><span class="meter__value"></span><span class="meter__track"><span class="meter__fill"></span></span><svg class="meter__curve" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true"><path class="meter__area"/><path class="meter__line"/></svg>';
      if (g.action) { fresh.type = 'button'; fresh.addEventListener('click', () => fresh._action()); }
      if (el) el.replaceWith(fresh); else zone.append(fresh);
      el = fresh;
    }
    el._action = g.action;
    el.className = 'meter security--' + (g.level || 'high');
    if (g.color) el.style.setProperty('--lamp', g.color); else el.style.removeProperty('--lamp');
    if (g.key) el.dataset.key = g.key;
    const part = Math.max(0, Math.min(100, g.part || 0));
    el.querySelector('.meter__fill').style.width = part.toFixed(1) + '%';
    const [number, unit] = String(g.value).split(/\s+(?=\S+$)/);
    el.querySelector('.meter__value').replaceChildren(unit ? number : String(g.value), ...(unit ? [Object.assign(document.createElement('small'), { textContent: unit })] : []));
    el.querySelector('.meter__label').textContent = g.label;
    el.querySelector('.meter__sub').textContent = el.querySelector('.meter__sub').title = g.sub || '';
    const id = (zone.id || zone.className) + '|' + (g.key || g.label);
    const h = meterHistory.get(id) || { at: 0, points: [] };
    if (now - h.at >= 900) { h.points.push(part); h.at = now; if (h.points.length > METER_POINTS) h.points.shift(); meterHistory.set(id, h); }
    meterCurve(el.querySelector('.meter__curve'), h.points);
    details(el, g.details || (g.title ? { title: g.title } : null));
    if (detailFor === el && g.details) showDetails(el);
  });
  while (zone.children.length > list.length) zone.lastChild.remove();
}

// A row of flat ring dials, the dashboard of the PC family. Dials are updated in place so their rings turn instead of jumping.
// A zone marked dials--rows shows the same measures as rows with a bar and the curve of the last minutes.
function dials(zone, list) {
  if (zone.classList.contains('dials--rows')) return meters(zone, list);
  list.forEach((g, i) => {
    let el = zone.children[i];
    if (!el || el.tagName !== (g.action ? 'BUTTON' : 'DIV')) {
      const fresh = document.createElement(g.action ? 'button' : 'div');
      fresh.innerHTML = '<span class="seal"><span class="seal__ring"></span><span class="seal__text"></span></span><span class="dial__label"></span><span class="dial__sub"></span>';
      if (g.action) { fresh.type = 'button'; fresh.addEventListener('click', () => fresh._action()); }
      if (el) el.replaceWith(fresh); else zone.append(fresh);
      el = fresh;
    }
    el._action = g.action;
    el.className = 'dial security--' + (g.level || 'high');
    if (g.color) { el.style.setProperty('--lamp', g.color); el.style.setProperty('--lamp-hi', `color-mix(in srgb, ${g.color} 45%, white)`); el.style.setProperty('--lamp-lo', `color-mix(in srgb, ${g.color} 55%, black)`); }
    else { el.style.removeProperty('--lamp'); el.style.removeProperty('--lamp-hi'); el.style.removeProperty('--lamp-lo'); }
    if (g.key) el.dataset.key = g.key;
    el.querySelector('.seal').style.setProperty('--part', Math.max(0, Math.min(100, g.part || 0)).toFixed(1));
    const [number, unit] = String(g.value).split(/\s+(?=\S+$)/);
    el.querySelector('.seal__text').classList.toggle('seal__text--long', (unit ? number : String(g.value)).length > 4);
    el.querySelector('.seal__text').replaceChildren(unit ? number : String(g.value), ...(unit ? [Object.assign(document.createElement('small'), { textContent: unit })] : []));
    el.querySelector('.dial__label').textContent = g.label;
    el.querySelector('.dial__sub').textContent = el.querySelector('.dial__sub').title = g.sub || '';
    el.removeAttribute('title');
    details(el, g.details || (g.title ? { title: g.title } : null));
    if (detailFor === el && g.details) showDetails(el);
  });
  while (zone.children.length > list.length) zone.lastChild.remove();
}
