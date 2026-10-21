'use strict';

(function () {
  let network = null, stats = null, shown = false, timer = 0, keyWallpaper = '', map = null, weather = null, tasks = null;
  const images = new Map(), appIcons = new Map();

  const ROWS = [
    ['processor', 'Processor', 'hardware', '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>'],
    ['memory', 'Memory', 'hardware', '<rect x="3.5" y="7" width="17" height="9.5" rx="1.5"/><path d="M7.5 10.5v2.5M11 10.5v2.5M14.5 10.5v2.5M6 16.5v2.5M18 16.5v2.5"/>'],
    ['disk', 'Disk', 'files', '<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><path d="M6.5 12h6"/><circle cx="16.5" cy="12" r="1.2"/>'],
    ['power', 'Battery', 'hardware', '<rect x="3.5" y="8" width="15" height="8" rx="1.5"/><path d="M21 11v2M11.5 9.5 9 12.5h3l-2.5 3"/>'],
    ['network', 'Network', 'network', '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r="1.1"/>'],
  ];
  const SHORTCUTS = [
    ['icons', 'Icons', '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m12 7.8 1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z"/>'],
    ['arrange', 'Arrange', '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/>'],
    ['mouse', 'Mouse', '<path d="M6 3.5 18 12.3l-5.6.8-3.2 4.9z"/><path d="m12.4 13.1 3.6 6.4"/>'],
    ['station', 'Sounds', '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>'],
    ['tasks', 'Tasks', '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M6.5 13h2.5l1.5-4 3 7 1.5-3h2.5"/>'],
  ];
  const ARRANGEMENTS = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom', frame: 'Frame', center: 'Center', corners: 'Corners', blocks: 'Blocks' };
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return o.toLocaleString(LOCALE, { maximumFractionDigits: o >= 100 || i === 0 ? 0 : 1 }) + ' ' + UNITS[i];
  }

  const tiles = {};
  const glyph = icon => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
  for (const [key, name, view, icon] of ROWS) {
    const b = document.createElement('button');
    b.className = 'h-row';
    b.innerHTML = `${glyph(icon)}<span class="h-row__what"><span class="h-row__name"></span><span class="h-detail"></span></span><span class="h-visual"></span><span class="h-value"></span>`;
    b.querySelector('.h-row__name').textContent = tr(name);
    b.addEventListener('click', () => key === 'memory' && tiles.memory.high ? dockTo('tasks') : showView(view));
    $('h-rows').append(b);
    tiles[key] = { el: b, name: b.querySelector('.h-row__name'), value: b.querySelector('.h-value'), detail: b.querySelector('.h-detail'), visual: b.querySelector('.h-visual') };
  }
  for (const [view, name, icon] of SHORTCUTS) {
    const b = document.createElement('button');
    b.className = 'h-tile';
    b.innerHTML = `<header>${glyph(icon)}<span class="h-name"></span></header><span class="h-value"></span><span class="h-visual"></span>`;
    b.querySelector('.h-name').textContent = tr(name);
    b.dataset.view = view;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => dockTo(view));
    $('h-tiles').append(b);
    tiles[view] = { el: b, value: b.querySelector('.h-value'), detail: null, visual: b.querySelector('.h-visual') };
  }
  const set = (key, value, detail, alert) => {
    const t = tiles[key];
    t.value.textContent = value || '–';
    if (t.detail) t.detail.textContent = detail || '';
    t.el.title = t.detail ? '' : detail || '';
    t.el.classList.toggle('alert', !!alert);
  };

  const visual = (key, html) => { const v = tiles[key].visual; if (v.dataset.key !== html) { v.dataset.key = html; v.innerHTML = html; } };
  const bar = part => `<span class="h-bar"><i style="width:${Math.max(0, Math.min(100, part)).toFixed(1)}%"></i></span>`;
  const urlIcon = a => `/app/icon-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`;
  const urlCursor = a => `/app/cursor-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`;
  $('h-wallpaper').dataset.dockTo = 'wallpaper';
  $('h-wallpaper').addEventListener('click', () => dockTo('wallpaper'));
  $('h-display').addEventListener('click', () => dockTo('display'));
  const CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  $('h-previous').addEventListener('click', () => send('previous'));
  $('h-pause').addEventListener('click', () => send('pause'));
  $('h-next').addEventListener('click', () => send('next'));

  const renderPower = Quick.bind({
    warmOn: 'warm-on', warm: 'warm-strength', night: 'night-light', group: 'h-quick',
    saver: 'saver-on', saverDetail: 'saver-detail', saverRow: 'h-saver',
    screenAc: 'screen-ac', screenDc: 'screen-dc', sleepAc: 'sleep-ac', sleepDc: 'sleep-dc',
  });
  function renderQuick(e) {
    renderPower(e);
    const p = e.power;
    if (!p) return;
    const battery = p.battery && e.onBattery, screen = battery ? p.screenDc : p.screenAc, sleep = battery ? p.sleepDc : p.sleepAc;
    $('power-summary').textContent = screen < 0 ? '' : tr(battery ? 'On battery: screen {0}, sleep {1}' : 'Plugged in: screen {0}, sleep {1}', Quick.timeout(screen).toLowerCase(), Quick.timeout(sleep).toLowerCase());
  }
  $('power-more').addEventListener('click', () => {
    const open = $('power-more').getAttribute('aria-expanded') !== 'true';
    reveal($('power-rows'), open);
    $('power-more').setAttribute('aria-expanded', String(open));
  });

  function duration(s) {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? tr('{0} h {1}', h, String(m).padStart(2, '0')) : `${m} min`;
  }

  function render() {
    const e = Bramble.state;
    $('h-date').textContent = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('h-time').textContent = new Date().toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    if (!e) return;

    const primary = (e.displays || []).find(d => d.primary);
    const wallpaper = primary ? wallpaperFor(primary.key) : e.wallpapers && e.wallpapers.find(f => f.name === e.current);
    const key = (wallpaper ? wallpaper.name + '@' + wallpaper.stamp : '') + '|' + e.light + '|' + e.speed + '|' + e.fit;
    if (key !== keyWallpaper) {
      keyWallpaper = key;
      const zone = $('h-wallpaper-preview');
      zone.replaceChildren();
      if (wallpaper) {
        const m = livePreview(wallpaper, $('h-wallpaper'));
        if (m.tagName === 'VIDEO') { m.autoplay = true; m.play().catch(() => { }); }
        zone.append(m);
      }
    }
    const paused = !!(e.paused || e.onBattery);
    $('h-wallpaper').classList.toggle('paused', paused);
    $('h-wallpaper').classList.toggle('fit', e.fit === 'fit');
    $('h-now-name').textContent = wallpaper ? wallpaper.name.replace(/\.[^.]+$/, '') : tr('No wallpaper selected');
    $('h-now-type').textContent = wallpaper ? TYPES[wallpaper.type] : '';
    $('h-pause').textContent = tr(e.paused ? 'Resume' : 'Pause');
    $('h-pause').setAttribute('aria-pressed', String(!!e.paused));
    $('h-next').disabled = $('h-previous').disabled = !e.wallpapers || e.wallpapers.length < 2;
    renderQuick(e);

    const s = e.station;
    if (s) {
      const active = s.events.filter(x => x.active).length;
      const on = s.active && !s.silence;
      set('station', tr(!on ? 'Sounds off' : active === 1 ? '1 event on' : '{0} events on', active));
      visual('station', '<span class="h-leds">' + s.events.map(x => `<i class="${x.active && on ? 'on' : ''}"></i>`).join('') + '</span>');
    }

    if (network) {
      const t = network.history && network.history[0];
      const sig = network.wifi && network.signal >= 0 ? network.signal : network.connected ? 100 : 0;
      set('network', !network.connected ? tr('Offline') : network.wifi ? sig + ' %' : tr('Cable'),
        [network.connected && network.wifi ? network.network || 'Wi-Fi' : '', t ? '↓ ' + Math.round(t.down) + ' Mbit/s' : ''].filter(Boolean).join(' · '), !network.connected);
      visual('network', '<span class="h-signal">' + [1, 2, 3, 4].map(i => `<i class="${sig > (i - 1) * 25 ? 'on' : ''}"></i>`).join('') + '</span>');
    }

    if (stats) {
      const ram = stats.memory.used / stats.memory.total * 100, t = stats.temperature;
      set('processor', Math.round(stats.processor.total) + ' %', t != null ? Math.round(t) + ' °C' : stats.processor.threads.length ? tr('{0} threads', stats.processor.threads.length) : '');
      tiles.processor.visual.innerHTML = '<span class="h-threads">' + stats.processor.threads.slice(0, 16).map(v => `<i style="--h:${Math.max(8, Math.min(100, v)).toFixed(0)}%"></i>`).join('') + '</span>';
      tiles.memory.high = ram >= 80;
      tiles.memory.el.classList.toggle('act', tiles.memory.high);
      set('memory', Math.round(ram) + ' %', tiles.memory.high ? tr('Free up memory') : tr('{0} of {1}', size(stats.memory.used).replace(/ \S+$/, ''), size(stats.memory.total)), ram >= 90);
      visual('memory', bar(ram));

      const b = stats.battery;
      if (b) {
        tiles.power.name.textContent = tr('Battery');
        set('power', b.charge + ' %', b.mains ? tr('Plugged in') : b.remaining > 0 ? tr('{0} left', duration(b.remaining)) : tr('On battery'), b.charge <= 15 && !b.mains);
        visual('power', '<span class="h-cell">' + Array.from({ length: 5 }, (_, i) => `<i class="${i < Math.ceil(b.charge / 20) ? (b.charge <= 15 && !b.mains ? 'low' : 'on') : ''}"></i>`).join('') + '</span><span class="h-tip"></span>');
      } else {
        tiles.power.name.textContent = tr('Power');
        set('power', tr('Plugged in'), '');
        visual('power', '');
      }
    }

    const fi = e.files;
    if (fi && fi.disks && fi.disks[0]) {
      const d = fi.disks[0];
      tiles.disk.name.textContent = tr('Disk {0}', (d.path || '').slice(0, 2));
      set('disk', Math.round((d.size - d.free) / d.size * 100) + ' %', tr('{0} free of {1}', size(d.free), size(d.size)), d.free / d.size < 0.1);
      visual('disk', bar((d.size - d.free) / d.size * 100));
    }

    const a = e.icons;
    if (a) {
      set('icons', tr(a.customized.length > 1 ? '{0} customized folders' : a.customized.length ? '1 customized folder' : 'No customized folder', a.customized.length));
      visual('icons', '<span class="h-images">' + a.customized.filter(x => x.preview).slice(0, 4).map(x => `<img src="${urlIcon(x.preview)}" class="${x.preview.retro ? 'retro' : ''}" alt="">`).join('') + '</span>');
    }

    const r = e.arrange;
    if (r) {
      set('arrange', tr(ARRANGEMENTS[r.arrangement] || 'Left'), tr(r.layouts.length > 1 ? '{0} saved layouts' : r.layouts.length ? '1 saved layout' : 'No saved layout', r.layouts.length));
      if (Bramble.arrange && Bramble.arrange.thumbnail) visual('arrange', '<span class="h-thumbnail">' + Bramble.arrange.thumbnail(r.arrangement || 'left') + '</span>');
    }

    const so = e.mouse;
    if (so) {
      set('mouse', tr(so.themeTitle), tr('{0} px pointer', so.settings.size === 0 ? 16 : 32 + (so.settings.size - 1) * 16));
      visual('mouse', '<span class="h-images">' + ['Arrow', 'Hand', 'IBeam', 'Wait'].map(id => so.roles.find(x => x.id === id)).filter(x => x && x.preview).map(x => `<img src="${urlCursor(x.preview)}" class="${x.preview.retro ? 'retro' : ''}" alt="">`).join('') + '</span>');
    }

    renderMoods(e.moods || []);

    if (tasks) {
      const apps = tasks.items.filter(t => t.kind === 'app').sort((a, b) => b.memory - a.memory), top = apps[0];
      set('tasks', tr(apps.length > 1 ? '{0} apps open' : apps.length ? '1 app open' : 'No app open', apps.length), top ? tr('Busiest: {0}', top.name) + ' · ' + size(top.memory) : '');
      visual('tasks', '<span class="h-images">' + apps.filter(t => appIcons.get(t.id)).slice(0, 4).map(t => `<img src="${appIcons.get(t.id)}" alt="">`).join('') + '</span>');
    }
  }

  function renderMoods(moods) {
    const zone = $('h-moods');
    const key = moods.map(m => m.id + (m.current ? '*' : '') + m.name + m.icon).join('|');
    if (zone.dataset.key === key && zone.children.length) return;
    zone.dataset.key = key;
    const title = document.createElement('button');
    title.className = 'h-title-link h-modes__title';
    title.dataset.dockTo = 'modes';
    title.setAttribute('aria-pressed', String(document.body.dataset.dock === 'modes'));
    title.innerHTML = CHEVRON;
    title.prepend(tr('Themes'));
    title.addEventListener('click', () => dockTo('modes'));
    const more = document.createElement('button');
    more.className = 'link h-modes__more';
    more.textContent = tr('Save the current setup as a theme');
    more.hidden = moods.length > 0;
    more.addEventListener('click', () => { if (Bramble.moods) Bramble.moods.startNew(); });
    zone.replaceChildren(title, ...moods.slice(0, 4).map(m => {
      const b = document.createElement('button');
      b.className = 'tool-chip';
      b.setAttribute('aria-pressed', String(!!m.current));
      if (Bramble.moods) b.insertAdjacentHTML('beforeend', Bramble.moods.icon(m.icon));
      b.append(Object.assign(document.createElement('span'), { textContent: m.name, translate: false }));
      b.title = m.current ? tr('Active') : tr('Apply');
      b.addEventListener('click', () => { if (!m.current) send('moods.apply', { id: m.id }); });
      return b;
    }), more);
  }

  function time(code) {
    if (code === 0) return ['Clear sky', 'sun'];
    if (code <= 2) return ['Partly cloudy', 'partly'];
    if (code === 3) return ['Overcast', 'cloud'];
    if (code === 45 || code === 48) return ['Fog', 'fog'];
    if (code >= 51 && code <= 57) return ['Drizzle', 'rain'];
    if (code >= 61 && code <= 67) return ['Rain', 'rain'];
    if (code >= 71 && code <= 77) return ['Snow', 'snow'];
    if (code >= 80 && code <= 82) return ['Showers', 'rain'];
    if (code === 85 || code === 86) return ['Snow showers', 'snow'];
    if (code >= 95) return ['Thunderstorm', 'storm'];
    return ['Cloudy', 'cloud'];
  }
  const CLOUD = '<path class="m-cloud" d="M15 36h19a8 8 0 0 0 .8-16A11 11 0 0 0 14 22.5 7 7 0 0 0 15 36z"/>';
  function drawing(kind, day) {
    const orb = day
      ? '<g class="m-sun"><circle cx="18" cy="17" r="6"/><path d="M18 5v3M18 26v3M6 17h3M27 17h3M9.5 8.5l2 2M24.5 23.5l2 2M26.5 8.5l-2 2M11.5 23.5l-2 2"/></g>'
      : '<path class="m-moon" d="M24 8a10 10 0 1 0 8 15A9 9 0 0 1 24 8z"/>';
    switch (kind) {
      case 'sun': return day ? '<g class="m-sun"><circle cx="24" cy="24" r="8"/><path d="M24 8v4M24 36v4M8 24h4M36 24h4M12.7 12.7l2.8 2.8M32.5 32.5l2.8 2.8M35.3 12.7l-2.8 2.8M15.5 32.5l-2.8 2.8"/></g>' : '<path class="m-moon" d="M28 10a13 13 0 1 0 10 20A12 12 0 0 1 28 10z"/>';
      case 'partly': return orb + CLOUD;
      case 'fog': return CLOUD + '<path class="m-stroke" d="M10 41h28M14 45h20"/>';
      case 'rain': return CLOUD + '<path class="m-drop" d="M18 40l-2 4M25 40l-2 4M32 40l-2 4"/>';
      case 'snow': return CLOUD + '<g class="m-flake"><circle cx="17" cy="42" r="1.4"/><circle cx="24" cy="44" r="1.4"/><circle cx="31" cy="42" r="1.4"/></g>';
      case 'storm': return CLOUD + '<path class="m-lightning" d="M25 36l-4 6h5l-3 5"/>';
      default: return CLOUD;
    }
  }
  function renderWeather() {
    if (!weather || !weather.ok) { $('h-weather').hidden = true; return; }
    const [what, kind] = time(weather.code);
    $('h-weather').hidden = false;
    $('h-weather-icon').innerHTML = drawing(kind, weather.day);
    $('h-weather-temp').textContent = weather.temperature + ' °C';
    $('h-weather-what').textContent = tr(what);
    $('h-weather-city').textContent = weather.city || '';
    $('h-weather-details').textContent = [tr('{0} / {1} °C', weather.min, weather.max), tr('wind {0} km/h', weather.wind), weather.rain >= 0 ? tr('rain {0} %', weather.rain) : ''].filter(Boolean).join(' · ');
    $('h-weather').title = tr('Feels like {0} °C · humidity {1} %', weather.feels, weather.humidity);
  }

  let screenSize = null;
  function fitPreview() {
    const wallpaper = $('h-wallpaper');
    if (!screenSize || !wallpaper.clientWidth) return;
    wallpaper.style.setProperty('--vw', screenSize.w.toFixed(1));
    wallpaper.style.setProperty('--vh', screenSize.h.toFixed(1));
    wallpaper.style.setProperty('--k', (wallpaper.clientWidth / screenSize.w).toFixed(5));
  }
  new ResizeObserver(fitPreview).observe($('h-wallpaper'));

  function renderDesktop() {
    const zone = $('h-desktop'), wallpaper = $('h-wallpaper');
    if (!map || !map.screens.length) return;
    const e = map.screens.find(x => x.primary) || map.screens[0];

    wallpaper.style.setProperty('--ratio', e.w + ' / ' + e.h);
    wallpaper.style.setProperty('--ratio-n', (e.w / e.h).toFixed(4));
    screenSize = { w: e.w / (e.scale || 1), h: e.h / (e.scale || 1) };
    fitPreview();

    const width = (map.caseW / e.w * 100).toFixed(3) + '%', height = (map.caseH / e.h * 100).toFixed(3) + '%';
    const dpi = e.scale || 1, iconPx = (map.iconSize || 48) * dpi, lead = 5, shift = Math.max(0, (map.caseW - iconPx) / 2);
    const image = Math.min(100, iconPx / map.caseW * 100).toFixed(1) + '%';
    const seen = new Set();
    for (const el of map.elements) {
      if (el.icon) images.set(el.id, el.icon);
      if (el.x < e.x || el.x >= e.x + e.w || el.y < e.y || el.y >= e.y + e.h) continue;
      seen.add(el.id);
      let b = zone.querySelector(`[data-id="${CSS.escape(el.id)}"]`);
      if (!b) {
        b = document.createElement('span');
        b.className = 'h-icon';
        b.dataset.id = el.id;
        b.innerHTML = '<img alt=""><i></i>';
        zone.append(b);
      }
      const img = b.querySelector('img');
      if (images.has(el.id) && img.src !== images.get(el.id)) img.src = images.get(el.id);
      b.querySelector('i').textContent = el.name;
      b.style.left = ((el.x - e.x - shift) / e.w * 100).toFixed(3) + '%';
      b.style.top = ((el.y + lead - e.y) / e.h * 100).toFixed(3) + '%';
      b.style.width = width;
      b.style.height = height;
      img.style.width = image;
    }
    const bars = JSON.stringify([e.x, e.y, e.w, e.h, e.tx, e.ty, e.tw, e.th]);
    if (zone.dataset.bars !== bars) {
      zone.dataset.bars = bars;
      zone.querySelectorAll('.taskbar').forEach(b => b.remove());
      zone.prepend(...taskbars(e));
    }
    for (const b of [...zone.children]) if (!b.classList.contains('taskbar') && !seen.has(b.dataset.id)) b.remove();
    zone.classList.toggle('hidden', !!map.hidden);
  }

  function event(m) {
    if (m.type === 'home.weather') { weather = m; renderWeather(); return; }
    if (m.type === 'arrange.map') { map = m; if (shown) renderDesktop(); return; }
    if (m.type === 'network.infos' || (m.type === 'network.test' && m.step === 'end')) {
      if (m.type === 'network.infos') network = m;
      else if (network) network.history = m.history;
    } else if (m.type === 'hardware.stats') stats = m;
    else if (m.type === 'tasks.list') { tasks = m; for (const t of m.items) if (t.info && t.info.icon) appIcons.set(t.id, t.info.icon); }
    else return;
    if (shown) render();
  }

  function visible(yes) {
    shown = yes;
    clearInterval(timer);
    if (!yes) return;
    render();
    send('network.infos');
    send('hardware.stats');
    send('home.weather');
    send('arrange.map', { full: images.size === 0 });
    send('tasks.list', { fresh: appIcons.size === 0 });
    let turn = 0;
    timer = setInterval(() => {
      if (!shown || document.visibilityState !== 'visible') return;
      send('hardware.stats');
      render();
      if (++turn % 5 === 0) { send('arrange.map'); send('tasks.list'); }
      if (turn % 450 === 0) send('home.weather');
    }, 2000);
  }

  Bramble.home = { state: () => { if (shown) render(); }, event, visible };
})();
