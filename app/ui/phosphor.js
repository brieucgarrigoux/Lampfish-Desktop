'use strict';

// Controls drawn without an icon get one from Phosphor here, in one place. A label is matched in English and in its translation,
// so a button made later by a page gets its icon too.
(function () {
  const LABELS = {
    'Add files': 'plus', 'Add more': 'plus', 'Add this theme': 'plus', 'Add to Notes': 'plus', 'Auto': 'magic-wand',
    'Back': 'arrow-left', 'Back to original': 'clock-counter-clockwise', 'Browse': 'folder-open',
    'Cancel': 'x', 'Capture': 'selection', 'Check now': 'arrows-clockwise', 'Choose': 'check', 'Choose a logo': 'image', 'Choose files': 'files', 'Clean up': 'broom', 'Close': 'x',
    'Convert': 'arrows-left-right', 'Convert more files': 'arrows-left-right', 'Copy and close': 'copy', 'Create the wallpaper': 'magic-wand',
    'Details in Settings': 'info', 'Discard': 'x', 'Done': 'check', 'End': 'x-circle', 'Forget': 'trash', 'Free up memory': 'memory', 'Hide': 'caret-up',
    'Keep mine': 'check', 'Load the pair': 'download-simple', 'Load theirs': 'download-simple', 'Make main screen': 'monitor', 'New theme': 'plus', 'Next': 'skip-forward', 'Night light': 'moon-stars',
    'Open': 'arrow-square-out', 'Open Windows Settings': 'gear', 'Pause': 'pause', 'Previous': 'skip-back', 'Privacy settings of Windows': 'lock-key',
    'Remove': 'trash', 'Reset': 'arrow-counter-clockwise', 'Reset Home': 'arrow-counter-clockwise', 'Reset to default': 'arrow-counter-clockwise', 'Restore': 'arrow-counter-clockwise', 'Resume': 'play',
    'Save as a new wallpaper': 'floppy-disk', 'Save as a theme': 'floppy-disk', 'Save as…': 'floppy-disk', 'Save the current setup as a theme': 'floppy-disk', 'See what takes space': 'chart-pie',
    'Show': 'caret-down', 'Show in File Explorer': 'folder-open', 'Skip': 'arrow-right', 'Start a new one': 'plus', 'Startup apps of Windows': 'rocket-launch',
    'Turn it on': 'power', 'Undo': 'arrow-u-up-left', 'Update': 'arrows-clockwise', 'Write a note': 'note-pencil',
  };
  // A place decides before its label: the same word can mean two things.
  const PLACES = { '#welcome-next': 'arrow-right', '#station-choose': 'plugs', '#c-go': 'arrow-square-out', '#n-more': 'caret-down', '#s-update': 'arrows-clockwise', '.a-keys': 'keyboard', '[data-companion-key] .button': 'keyboard' };
  const TABS = { dashboard: 'squares-four', quick: 'sliders', claude: 'gauge', note: 'note-pencil', capture: 'selection', shelf: 'tray', audio: 'speaker-high', notes: 'notebook', convert: 'arrows-left-right', desktop: 'monitor' };
  const LINES = { '#claude-row .caption': 'gauge' };
  const draw = (name, extra) => `<svg class="ph${extra || ''}" viewBox="0 0 256 256" aria-hidden="true">${PHOSPHOR[name]}</svg>`;

  let words = null, marker = '';
  function table() {
    if (words && marker === tr('Close')) return words;
    marker = tr('Close');
    words = new Map();
    for (const [label, name] of Object.entries(LABELS)) { words.set(label, name); words.set(tr(label), name); }
    return words;
  }

  function pick(el) {
    for (const [place, name] of Object.entries(PLACES)) if (el.matches(place)) return name;
    if (el.dataset.tab && el.classList.contains('tool-chip')) return TABS[el.dataset.tab];
    return table().get(el.textContent.trim());
  }

  function dress() {
    for (const el of document.querySelectorAll('.button, .link, .chip, .tool-chip, .task__end')) {
      if (el.querySelector('svg, img')) continue;
      const name = pick(el);
      if (!name || !PHOSPHOR[name]) continue;
      el.classList.add('has-ph');
      el.insertAdjacentHTML('afterbegin', draw(name));
    }
    for (const [place, name] of Object.entries(LINES)) {
      const line = document.querySelector(place);
      if (line && !line.querySelector('svg')) line.insertAdjacentHTML('afterbegin', draw(name, ' glyph'));
    }
  }

  let waiting = false;
  new MutationObserver(() => {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => { waiting = false; dress(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  dress();
})();
