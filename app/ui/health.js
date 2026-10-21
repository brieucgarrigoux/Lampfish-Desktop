'use strict';

(function () {
  let report = null, shown = false, checking = false;
  const TITLES = {
    antivirus: 'Antivirus', firewall: 'Firewall', updates: 'Windows updates', restart: 'Restart', encryption: 'Disk encryption',
    secureBoot: 'Secure Boot', uac: 'Account control', space: 'Disk space', startup: 'Startup',
  };
  const ACTIONS = { 'view:files': 'Open Folders', 'view:tasks': 'Open Tasks', 'view:hardware': 'Open Hardware', free: 'Free up memory' };
  const STATES = { ok: 'Fine', warn: 'Be careful', bad: 'Risky', unknown: 'Not reported' };

  function act(action) {
    if (action.startsWith('view:')) showView(action.slice(5));
    else if (action === 'free') { if (Bramble.tasks) Bramble.tasks.free(); else showView('tasks'); }
    else send('health.open', { target: action });
  }

  function row(level, title, detail, value, action) {
    const r = document.createElement('div');
    r.className = 'row health-row check--' + (level === 'unknown' ? 'neutral' : level);
    r.innerHTML = '<span class="jewel" role="img"></span><span class="health-row__what"><span class="health-row__title"></span><small></small></span>';
    r.querySelector('.jewel').setAttribute('aria-label', tr(STATES[level] || STATES.unknown));
    r.querySelector('.health-row__title').textContent = title;
    r.querySelector('small').textContent = detail || '';
    if (value) r.append(Object.assign(document.createElement('span'), { className: 'health-row__value', textContent: value }));
    if (action) {
      const b = Object.assign(document.createElement('button'), { className: 'button', textContent: tr(ACTIONS[action] || 'Open') });
      b.addEventListener('click', () => act(action));
      r.append(b);
    }
    return r;
  }

  function render() {
    $('health-again').disabled = checking;
    if (checking && !report) return;
    if (!report || report.failed) {
      $('health-slow').replaceChildren(Object.assign(document.createElement('div'), { className: 'row empty', textContent: tr('Windows could not be read, check again') }));
      $('health-radar').replaceChildren();
      return;
    }
    $('health-when').textContent = checking ? tr('Checking…') : tr('Checked at {0}', report.when);
    $('health-slow').replaceChildren(...report.slow.map(f => row(f.level, f.title, f.detail, null, f.action)));
    $('health-radar').replaceChildren(...report.checks.map(c => row(c.level, tr(TITLES[c.id] || c.id), c.detail, c.value, c.level === 'ok' && c.id !== 'startup' ? null : c.action)));
  }

  function event(m) {
    if (m.type === 'health.scanning') { checking = true; render(); return; }
    if (m.type !== 'health.report') return;
    checking = false;
    report = m;
    render();
  }

  function visible(yes) {
    shown = yes;
    if (yes) send('health.scan', { again: false });
  }

  $('health-again').addEventListener('click', () => send('health.scan', { again: true }));
  Bramble.health = { event, visible };
})();
