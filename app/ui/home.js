'use strict';

(function () {
  let network = null, stats = null, shown = false, timer = 0, keyWallpaper = '', map = null, weather = null;
  const images = new Map();

  const SERVICES = [
    ['icons', 'Icons', '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m12 7.8 1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z"/>'],
    ['arrange', 'Arrange', '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/>'],
    ['mouse', 'Mouse', '<path d="M6 3.5 18 12.3l-5.6.8-3.2 4.9z"/><path d="m12.4 13.1 3.6 6.4"/>'],
    ['station', 'Sounds', '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>'],
    ['files', 'Folders', '<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-6.2l-2-2.5H5.5a2 2 0 0 0-2 2z"/>'],
    ['hardware', 'Hardware', '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>'],
    ['power', 'Power', '<rect x="3.5" y="8" width="15" height="8" rx="1.5"/><path d="M21 11v2M11.5 9.5 9 12.5h3l-2.5 3"/>'],
    ['network', 'Network', '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r="1.1"/>'],
  ];
  const ARRANGEMENTS = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom', frame: 'Frame', center: 'Center', corners: 'Corners', blocks: 'Blocks' };
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return o.toLocaleString(LOCALE, { maximumFractionDigits: o >= 100 || i === 0 ? 0 : 1 }) + ' ' + UNITS[i];
  }

  const grid = $('h-tiles');
  const tiles = {};
  for (const [view, name, icon] of SERVICES) {
    const b = document.createElement('button');
    b.className = 'h-tile';
    b.innerHTML = `<header><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span class="h-name"></span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></header>
      <span class="h-value"></span><span class="h-detail"></span><span class="h-visual"></span>`;
    b.querySelector('.h-name').textContent = name;

    b.addEventListener('click', () => showView(view === 'power' ? 'hardware' : view));
    grid.append(b);
    tiles[view] = { el: b, value: b.querySelector('.h-value'), detail: b.querySelector('.h-detail'), visual: b.querySelector('.h-visual') };
  }
  const set = (view, value, detail, part, alert) => {
    const t = tiles[view];
    t.value.textContent = value || '–';
    t.detail.textContent = detail || '';
    t.el.classList.toggle('alert', !!alert);
  };

  const visual = (view, html) => { const v = tiles[view].visual; if (v.dataset.key !== html) { v.dataset.key = html; v.innerHTML = html; } };
  const bar = part => `<span class="h-bar"><i style="width:${Math.max(0, Math.min(100, part)).toFixed(1)}%"></i></span>`;
  const urlIcon = a => `/app/icon-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`;
  const urlCursor = a => `/app/cursor-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`;
  $('h-wallpaper').addEventListener('click', () => showView('wallpaper'));

  function duration(s) {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? tr('{0} h {1}', h, String(m).padStart(2, '0')) : `${m} min`;
  }

  function render() {
    const e = Bramble.state;
    $('h-date').textContent = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('h-time').textContent = new Date().toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    if (!e) return;

    const wallpaper = e.wallpapers && e.wallpapers.find(f => f.name === e.current);
    const key = (wallpaper ? wallpaper.name : '') + '|' + e.light + '|' + e.speed + '|' + e.fit;
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
    $('h-wallpaper').classList.toggle('paused', !!(e.paused || e.onBattery));
    $('h-wallpaper').classList.toggle('fit', e.fit === 'fit');

    const s = e.station;
    if (s) {
      const active = s.events.filter(x => x.active).length;
      const last = s.log && s.log[0];
      const label = last && (s.events.find(x => x.id === last.type) || {}).label;
      set('station', tr(!s.active ? 'Sounds off' : s.silence ? 'Silent' : '{0} events on', active),
        last ? tr('Last: {0} at {1}', tr(label || last.type), new Date(last.when).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })) : '');

      visual('station', '<span class="h-leds">' + s.events.map(x => `<i class="${x.active && s.active ? 'on' : ''}" title="${x.label}"></i>`).join('') + '</span>');
    }

    if (network) {
      const t = network.history && network.history[0];
      set('network', !network.connected ? tr('No connection') : network.wifi ? (network.network || 'Wi-Fi') : tr('Cable'),
        [network.ipv4, t ? tr('last test ↓ {0} Mbit/s', Math.round(t.down)) : ''].filter(Boolean).join(' · '), null, !network.connected);
      const sig = network.wifi && network.signal >= 0 ? network.signal : network.connected ? 100 : 0;
      visual('network', '<span class="h-signal">' + [1, 2, 3, 4].map(i => `<i class="${sig > (i - 1) * 25 ? 'on' : ''}"></i>`).join('') + '</span>');
    }

    if (stats) {
      const ram = stats.memory.used / stats.memory.total * 100;
      set('hardware', tr('Processor {0} %', Math.round(stats.processor.total)), tr('Memory {0} %', Math.round(ram)), ram, ram >= 90);

      tiles.hardware.visual.innerHTML = '<span class="h-threads">' + stats.processor.threads.map(v => `<i style="--h:${Math.max(6, Math.min(100, v)).toFixed(0)}%"></i>`).join('') + '</span>';

      const b = stats.battery, t = stats.temperature;
      const hot = t != null ? ' · ' + Math.round(t) + ' °C' : '';
      if (b) visual('power', '<span class="h-cell">' + Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.ceil(b.charge / 10) ? (b.charge <= 15 && !b.mains ? 'low' : 'on') : ''}"></i>`).join('') + '</span><span class="h-tip"></span>');
      if (b) set('power', tr('Battery {0} %', b.charge),
        (b.mains ? tr('Plugged in') : b.remaining > 0 ? tr('{0} left', duration(b.remaining)) : tr('On battery')) + hot, b.charge, b.charge <= 15 && !b.mains);
      else set('power', tr('Plugged in'), t != null ? tr('Temperature {0} °C', Math.round(t)) : '', null, false);
    }

    const r = e.arrange;
    if (r && Bramble.arrange && Bramble.arrange.thumbnail) visual('arrange', '<span class="h-thumbnail">' + Bramble.arrange.thumbnail(r.arrangement || 'left') + '</span>');
    if (r) set('arrange', tr(ARRANGEMENTS[r.arrangement] || 'Left'), tr(r.layouts.length > 1 ? '{0} saved layouts' : r.layouts.length ? '1 saved layout' : 'No saved layout', r.layouts.length));

    const so = e.mouse;
    if (so) set('mouse', tr(so.themeTitle), tr('{0} px pointer', 32 + (so.settings.size - 1) * 16));

    if (so) visual('mouse', '<span class="h-images">' + ['Arrow', 'Hand', 'IBeam', 'Wait'].map(id => so.roles.find(x => x.id === id)).filter(x => x && x.preview).map(x => `<img src="${urlCursor(x.preview)}" class="${x.preview.retro ? 'retro' : ''}" alt="">`).join('') + '</span>');

    const a = e.icons;

    if (a) visual('icons', '<span class="h-images">' + a.customized.filter(x => x.preview).slice(0, 6).map(x => `<img src="${urlIcon(x.preview)}" class="${x.preview.retro ? 'retro' : ''}" alt="" title="${x.name}">`).join('') + '</span>');
    if (a) set('icons', tr(a.customized.length > 1 ? '{0} customized folders' : a.customized.length ? '1 customized folder' : 'No customized folder', a.customized.length), tr('Folder icons'));

    const fi = e.files;
    if (fi && fi.disks && fi.disks[0]) {
      const d = fi.disks[0];
      set('files', tr('{0} free', size(d.free)), tr('{0} of {1}', d.name, size(d.size)), null, d.free / d.size < 0.1);
      visual('files', bar((d.size - d.free) / d.size * 100));
    }
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
    const iconPx = 48 * (e.scale || 1), shift = Math.max(0, (map.caseW - iconPx) / 2);
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
      b.style.top = ((el.y - e.y) / e.h * 100).toFixed(3) + '%';
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
    let turn = 0;
    timer = setInterval(() => {
      if (!shown || document.visibilityState !== 'visible') return;
      send('hardware.stats');
      render();
      if (++turn % 5 === 0) send('arrange.map');
      if (turn % 450 === 0) send('home.weather');
    }, 2000);
  }

  Bramble.home = { state: () => { if (shown) render(); }, event, visible };
})();
