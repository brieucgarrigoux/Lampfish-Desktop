'use strict';

// Home keeps the warm screen and power settings as shortcuts, so both pages share these controls.
const Quick = (() => {
  const TIMEOUTS = [60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 7200, 0];
  const timeout = s => s === 0 ? tr('Never') : s < 3600 ? tr('{0} min', s / 60) : s === 3600 ? tr('1 hour') : tr('{0} hours', s / 3600);
  function fillTimeout(select, value) {
    const values = TIMEOUTS.includes(value) || value < 0 ? TIMEOUTS : [...TIMEOUTS.slice(0, -1), value, 0].sort((a, b) => (a || 1e9) - (b || 1e9));
    const key = values.join() + '|' + LANGUAGE;
    if (select.dataset.key !== key) {
      select.dataset.key = key;
      select.replaceChildren(...values.map(v => Object.assign(document.createElement('option'), { value: v, textContent: timeout(v) })));
    }
    if (document.activeElement !== select) select.value = String(value);
  }

  function bind(ids) {
    const el = k => $(ids[k]);
    for (const [k, action, battery] of [['screenAc', 'screen', false], ['screenDc', 'screen', true], ['sleepAc', 'sleep', false], ['sleepDc', 'sleep', true]])
      el(k).addEventListener('change', e => send('power.' + action, { battery, value: Number(e.target.value) }));
    el('saver').addEventListener('change', e => send('power.saver', { value: e.target.checked }));
    const warmth = live => send('display.warm', { on: el('warmOn').checked, strength: Number(el('warm').value), live });
    const shown = () => { fill(el('warm')); if (ids.output) el('output').textContent = el('warm').value + ' %'; };
    el('warmOn').addEventListener('change', () => warmth(false));
    const warmLive = throttle(() => warmth(true), 80);
    el('warm').addEventListener('input', () => { shown(); if (el('warmOn').checked) warmLive(); });
    el('warm').addEventListener('change', () => { if (el('warmOn').checked) warmth(false); });
    el('night').addEventListener('click', () => send('display.nightLight'));
    return e => {
      const d = e.display, p = e.power;
      if (d) {
        el('warmOn').checked = d.warmOn;
        if (document.activeElement !== el('warm')) el('warm').value = d.warm;
        el('warm').disabled = !d.warmOn;
        shown();
      }
      if (!p) return;
      el('group').classList.toggle('no-battery', !p.battery);
      el('saverRow').hidden = !p.battery;
      el('saver').checked = p.saver;
      el('saverDetail').textContent = p.saverOn ? tr('On right now') : p.saver ? tr('Always on when on battery') : tr('Turns on below {0} % on battery', p.threshold);
      fillTimeout(el('screenAc'), p.screenAc); fillTimeout(el('screenDc'), p.screenDc);
      fillTimeout(el('sleepAc'), p.sleepAc); fillTimeout(el('sleepDc'), p.sleepDc);
    };
  }

  return { bind, timeout };
})();

(function () {
  let screens = null, chosen = null, shown = false, keyDisplays = '', later = 0, panels = null;
  const renderQuick = Quick.bind({
    warmOn: 'd-warm-on', warm: 'd-warm', output: 'd-warm-value', night: 'd-night-light', group: 'd-power',
    saver: 'd-saver-on', saverDetail: 'd-saver-detail', saverRow: 'd-saver-row',
    screenAc: 'd-screen-ac', screenDc: 'd-screen-dc', sleepAc: 'd-sleep-ac', sleepDc: 'd-sleep-dc',
  });
  const name = s => s.name || tr('Screen {0}', s.n);

  function renderMap() {
    const zone = $('d-map'), list = screens || [];
    if (!list.length || !zone.clientWidth) return;
    if (!list.some(s => s.key === chosen)) chosen = (list.find(s => s.primary) || list[0]).key;
    const left = Math.min(...list.map(s => s.x)), top = Math.min(...list.map(s => s.y));
    const right = Math.max(...list.map(s => s.x + s.w)), bottom = Math.max(...list.map(s => s.y + s.h));
    const k = Math.min((zone.clientWidth - 48) / (right - left), 150 / (bottom - top));
    const key = JSON.stringify([list, chosen, Math.round(k * 1e4), LANGUAGE]);
    if (zone.dataset.key === key) return;
    zone.dataset.key = key;
    const stage = document.createElement('div');
    stage.className = 'd-stage';
    stage.style.width = (right - left) * k + 'px';
    stage.style.height = (bottom - top) * k + 'px';
    for (const s of list) {
      const b = document.createElement('button');
      b.className = 'd-screen';
      b.setAttribute('aria-pressed', String(s.key === chosen));
      Object.assign(b.style, { left: (s.x - left) * k + 3 + 'px', top: (s.y - top) * k + 3 + 'px', width: s.w * k - 6 + 'px', height: s.h * k - 6 + 'px' });
      b.innerHTML = '<b></b><span></span>';
      b.firstChild.textContent = s.n;
      b.lastChild.textContent = s.primary ? tr('Main') : '';
      b.title = name(s);
      b.addEventListener('click', () => { chosen = s.key; renderMap(); renderChosen(); });
      stage.append(b);
    }
    zone.replaceChildren(stage);
  }

  function renderChosen() {
    const s = (screens || []).find(x => x.key === chosen);
    if (!s) return;
    $('d-name').textContent = name(s);
    $('d-specs').textContent = [`${s.w} × ${s.h}`, s.scale + ' %', s.hz ? s.hz + ' Hz' : '', s.inches ? tr('{0} in', s.inches.toLocaleString(LOCALE)) : '', s.port].filter(Boolean).join(' · ');
    $('d-main').hidden = !s.primary;
    $('d-primary').hidden = s.primary || screens.length < 2;
    $('d-help').textContent = screens.length < 2 ? tr('With a second screen plugged in, Bramble can choose which one is the main screen') : tr('The main screen shows the Start menu and opens new windows');
  }

  $('d-primary').addEventListener('click', () => {
    const s = (screens || []).find(x => x.key === chosen);
    if (!s || s.primary) return;
    send('display.primary', { key: s.key });
    clearTimeout(later);
    later = setTimeout(() => send('display.screens'), 1500);
  });

  function state() {
    const e = Bramble.state;
    if (!e) return;
    renderQuick(e);
    const key = (e.displays || []).map(d => d.key + (d.primary ? '*' : '')).join('|');
    if (key !== keyDisplays) { keyDisplays = key; if (shown) { send('display.screens'); send('display.brightness'); } else screens = null; }
  }

  const SUN = '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>';
  function renderBrightness() {
    const zone = $('d-bright'), list = panels || [];
    $('d-bright-title').hidden = zone.hidden = !list.length;
    if (!list.length) return;
    const key = list.map(p => p.key).join('|') + LANGUAGE;
    if (zone.dataset.key !== key) {
      zone.dataset.key = key;
      zone.replaceChildren(...list.map((p, i) => {
        const row = document.createElement('div');
        row.className = 'setting';
        row.innerHTML = `<label for="d-bright-${i}"><span class="caption"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${SUN}</svg><span><span class="d-bright__name" translate="no"></span><small></small></span></span><output></output></label><input type="range" id="d-bright-${i}" min="5" max="100" step="1">`;
        row.querySelector('.d-bright__name').textContent = p.builtin ? tr('Built-in screen') : p.name || tr('External screen');
        row.querySelector('small').textContent = tr('How bright this screen is');
        const input = row.querySelector('input'), output = row.querySelector('output');
        const send_ = throttle(() => send('display.setBrightness', { key: p.key, value: Number(input.value) }), 120);
        input.addEventListener('input', () => { output.textContent = input.value + ' %'; fill(input); send_(); });
        return row;
      }));
    }
    list.forEach((p, i) => {
      const input = $('d-bright-' + i);
      if (document.activeElement !== input) input.value = p.value;
      input.parentNode.querySelector('output').textContent = input.value + ' %';
      fill(input);
    });
  }

  function event(m) {
    if (m.type === 'display.brightness') { panels = m.screens; renderBrightness(); return; }
    if (m.type !== 'display.screens') return;
    screens = m.screens;
    renderMap();
    renderChosen();
  }

  function visible(yes) {
    shown = yes;
    if (!yes) return;
    if (screens) { renderMap(); renderChosen(); }
    send('display.screens');
    send('display.brightness');
  }

  addEventListener('resize', () => { if (shown) renderMap(); });
  Bramble.display = { state, event, visible };
})();
