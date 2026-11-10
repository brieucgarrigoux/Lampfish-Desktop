'use strict';

// The guided help (HELP_BOT of help-bot.js): a conversation where every choice is a tile with its icon and gray line. Once a
// tile is chosen the others go away, the question shows on the right and the answer under it, and the newest answer carries the
// next tiles. helpChat draws it in a page; the page gives how to run an action, what it knows (facts) and the avatar.
function helpChat({ log, run, can, facts, avatar }) {
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const node = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text || '' });

  const reach = el => requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' }));
  function keep(el) {
    log.append(el);
    while (log.children.length > 40) log.firstElementChild.remove();
    reach(el);
    return el;
  }

  function bot(text, actions) {
    const row = node('div', 'hb-row');
    const bubble = node('div', 'hb-bot');
    bubble.append(node('p', '', text));
    const buttons = (actions || []).filter(can).slice(0, 2).map((a, i) => {
      const b = node('button', i ? 'button' : 'button button--accent');
      b.type = 'button';
      b.innerHTML = icon(a.icon);
      b.append(tr(a.label));
      b.addEventListener('click', () => run(a));
      return b;
    });
    if (buttons.length) { const act = node('div', 'hb-act'); act.append(...buttons); bubble.append(act); }
    const face = node('span', 'hb-face');
    const picture = avatar && avatar();
    if (picture) face.append(picture);
    row.append(face, bubble);
    return keep(row);
  }

  const me = text => keep(node('div', 'hb-me', text));

  // A tile shows the icon of the first thing its answer does, and the gray line of the topic when it has one.
  function tile(id) {
    const t = HELP_BOT.topics[id];
    const b = node('button', 'hb-tile');
    b.type = 'button';
    b.innerHTML = icon((t.do && t.do[0] && t.do[0].icon) || 'question', 'glyph');
    const words = node('span', 'hb-tile__q', tr(t.q));
    if (t.hint) words.append(node('small', '', tr(t.hint)));
    b.append(words);
    b.addEventListener('click', () => topic(id));
    return b;
  }
  function link(iconName, label, go) {
    const b = node('button', 'link hb-link');
    b.type = 'button';
    b.innerHTML = icon(iconName);
    b.append(label);
    b.addEventListener('click', go);
    return b;
  }
  function choices(ids, pages, end) {
    const box = node('div', 'hb-choices');
    if (ids.length) { const grid = node('div', 'hb-tiles'); grid.append(...ids.map(tile)); box.append(grid); }
    if (pages) {
      const row = node('div', 'hb-chips');
      row.append(...Object.entries(HELP_BOT.pages).map(([view, name]) => { const c = node('button', 'hb-chip', tr(name)); c.type = 'button'; c.addEventListener('click', () => run({ view })); return c; }));
      box.append(row);
    }
    box.append(end);
    return keep(box);
  }

  function topic(id) {
    const t = HELP_BOT.topics[id];
    if (!t) return;
    for (const box of log.querySelectorAll('.hb-choices')) box.remove();
    me(tr(t.q));
    const live = t.live && HELP_LIVE[t.live] ? HELP_LIVE[t.live](facts() || {}) : '';
    bot([live, tr(t.a)].filter(Boolean).join(' '), t.do);
    choices(t.next || [], t.pages, link('arrow-counter-clockwise', tr('Start over'), start));
  }

  function start() {
    log.replaceChildren();
    bot(tr(HELP_BOT.greeting));
    choices(HELP_BOT.start, false, link('list', tr(HELP_BOT.topics.other.q), () => topic('other')));
  }

  start();
  return { start, topic };
}

// The fish of the newest answer is alive (mark.js); when a new answer comes, the one before keeps a still copy of it.
function liveAvatar(log) {
  const live = log.querySelector('.hp-live');
  if (!live) return null;
  live.remove();
  return () => {
    if (live.isConnected) { const still = live.cloneNode(true); still.classList.remove('hp-live'); live.replaceWith(still); }
    return live;
  };
}

// The Help page of the main window.
(function () {
  if (!$('help-log')) return;
  // Calls an action can name: each one does what an existing button of the app does.
  const HELP_CALLS = {
    'free-memory': () => { if (Lampfish.tasks) Lampfish.tasks.free(); },
    'new-theme': () => { if (Lampfish.moods) Lampfish.moods.startNew(); },
    'new-note': () => { showView('notes'); setTimeout(() => { const b = $('n-new'); if (b) b.click(); }, 60); },
    'zoom-in': () => zoomBy(1),
    'zoom-out': () => zoomBy(-1),
    'transparency': () => {
      showView('settings');
      const fold = document.querySelector('.tr-fold');
      if (fold) { fold.open = true; fold.scrollIntoView({ block: 'start' }); }
    },
  };

  // Help reads nothing itself: the last load of the PC that Home or Health asked for, while it is recent.
  let stats = null, statsAt = 0;
  webview.addEventListener('message', e => { if (e.data && e.data.type === 'hardware.stats') { stats = e.data; statsAt = Date.now(); } });
  function facts() {
    const s = Lampfish.state || {}, fresh = stats && Date.now() - statsAt < 120000;
    return {
      memory: fresh && stats.memory && stats.memory.total ? Math.round(stats.memory.used / stats.memory.total * 100) : null,
      battery: fresh ? stats.battery : null,
      paused: s.paused, onBattery: s.onBattery, startup: s.startup, zoom: s.zoom,
      notes: s.notes ? s.notes.count : null,
    };
  }

  const run = a => {
    if (a.call) HELP_CALLS[a.call]();
    else if (a.send) send(a.send, a.args || {});
    else if (a.view) showView(a.view);
  };
  helpChat({ log: $('help-log'), run, can: a => !!(a.call || a.send || a.view), facts, avatar: liveAvatar($('help-log')) });

})();
