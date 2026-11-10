'use strict';

// The guided help: the bot greets, then everything goes through chips, action buttons and a local search (HELP_BOT of help-bot.js).
// helpChat draws it in a page; the page gives how to run an action, what it knows (facts) and the avatar.
function helpChat({ log, ask, found, run, can, facts, avatar }) {
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
    const picture = avatar();
    if (picture) face.append(picture);
    row.append(face, bubble);
    return keep(row);
  }

  const me = text => keep(node('div', 'hb-me', text));

  function chip(label, go) {
    const b = node('button', 'hb-chip', label);
    b.type = 'button';
    b.addEventListener('click', () => { b.closest('.hb-chips').classList.add('is-past'); b.setAttribute('aria-pressed', 'true'); go(); });
    return b;
  }
  function chips(list) {
    const row = node('div', 'hb-chips');
    row.append(...list);
    return keep(row);
  }
  const topicChip = id => chip(tr(HELP_BOT.topics[id].q), () => topic(id));
  const back = () => chip(tr('Back to the start'), start);

  function topic(id) {
    const t = HELP_BOT.topics[id];
    if (!t) return;
    me(tr(t.q));
    const live = t.live && HELP_LIVE[t.live] ? HELP_LIVE[t.live](facts() || {}) : '';
    bot([live, tr(t.a)].filter(Boolean).join(' '), t.do);
    const list = (t.next || []).map(topicChip);
    if (t.pages) list.push(...Object.entries(HELP_BOT.pages).map(([view, name]) => chip(tr(name), () => run({ view }))));
    chips([...list, back()]);
  }

  function start() {
    log.replaceChildren();
    bot(tr(HELP_BOT.greeting));
    chips(HELP_BOT.start.map(topicChip));
  }

  function search() {
    const query = ask.value.trim();
    found.hidden = !query;
    if (!query) { found.replaceChildren(); return []; }
    const ids = helpSearch(query);
    if (ids.length) found.replaceChildren(...ids.map(id => pick(tr(HELP_BOT.topics[id].q), id)));
    else found.replaceChildren(node('span', 'hb-none', tr('Nothing matches')), pick(tr(HELP_BOT.topics.other.q), 'other'));
    // The suggestions take room from the chat: its last message stays in sight.
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    return ids;
  }
  function pick(label, id) {
    const b = node('button', 'hb-chip', label);
    b.type = 'button';
    b.addEventListener('click', () => { ask.value = ''; search(); topic(id); });
    return b;
  }
  ask.addEventListener('input', search);
  ask.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const ids = search(); if (ask.value.trim()) { ask.value = ''; search(); topic(ids[0] || 'other'); } }
    else if (e.key === 'Escape' && ask.value) { e.preventDefault(); e.stopPropagation(); ask.value = ''; search(); }
  });

  start();
  return { start, topic, search };
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

  const avatar = () => {
    // The fish alone, without the turquoise plate of the logo.
    const mark = document.querySelector('.hp-head .help-avatar');
    if (!mark) return null;
    const copy = mark.cloneNode(true);
    copy.removeAttribute('class');
    return copy;
  };
  const run = a => {
    if (a.call) HELP_CALLS[a.call]();
    else if (a.send) send(a.send, a.args || {});
    else if (a.view) showView(a.view);
  };
  const chat = helpChat({ log: $('help-log'), ask: $('help-ask'), found: $('help-found'), run, can: a => !!(a.call || a.send || a.view), facts, avatar });

  $('help-often').replaceChildren(...HELP_BOT.often.map(id => {
    const t = HELP_BOT.topics[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row action';
    b.innerHTML = `<span class="caption"><span><span class="hp-q"></span><small></small></span></span>${icon('caret-right', 'chevron')}`;
    b.querySelector('.hp-q').textContent = tr(t.q);
    b.querySelector('small').textContent = tr(t.hint || '');
    b.addEventListener('click', () => chat.topic(id));
    return b;
  }));
  // The assistant has the same help as a tab, said only when the assistant is on.
  const state = () => { const c = Lampfish.state && Lampfish.state.companion; $('help-assistant').hidden = !(c && c.on); };
  Lampfish.help = { state };
})();
