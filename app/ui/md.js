'use strict';

// Markdown to page elements, built node by node: the text of a note never goes through innerHTML, so a note that came
// from a shared vault cannot run anything in lampfish. Covers what Obsidian users write most: titles, lists, tasks, quotes,
// code, tables, links, [[links]], images and ![[embeds]], highlights. Single line breaks are kept, as in Obsidian.
const Markdown = (function () {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // Earliest inline token first; text in between stays text.
  const INLINE = [
    ['code', /`([^`]+)`/],
    ['embed', /!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/],
    ['image', /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/],
    ['wiki', /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/],
    ['link', /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/],
    ['url', /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/],
    ['bold', /\*\*([^*]+?)\*\*|__([^_]+?)__/],
    ['strike', /~~([^~]+?)~~/],
    ['mark', /==([^=]+?)==/],
    ['italic', /\*([^*\s][^*]*?)\*|(?:^|(?<=\W))_([^_\s][^_]*?)_(?=\W|$)/],
  ];

  function inline(text, o, into) {
    while (text) {
      let best = null;
      for (const [kind, re] of INLINE) {
        const m = re.exec(text);
        if (m && (!best || m.index < best.m.index)) best = { kind, m };
      }
      if (!best) { into.append(text); return; }
      const { kind, m } = best;
      if (m.index) into.append(text.slice(0, m.index));
      text = text.slice(m.index + m[0].length);
      if (kind === 'code') into.append(el('code', null, m[1]));
      else if (kind === 'bold') inline(m[1] || m[2], o, into.appendChild(el('strong')));
      else if (kind === 'italic') inline(m[1] || m[2], o, into.appendChild(el('em')));
      else if (kind === 'strike') inline(m[1], o, into.appendChild(el('s')));
      else if (kind === 'mark') inline(m[1], o, into.appendChild(el('mark')));
      else if (kind === 'wiki') {
        const a = el('a', 'md-wiki', m[2] || m[1].trim());
        a.href = '#';
        a.addEventListener('click', e => { e.preventDefault(); o.note(m[1].trim()); });
        into.append(a);
      } else if (kind === 'link' || kind === 'url') {
        const href = kind === 'url' ? m[0] : m[2];
        const a = el('a', null);
        if (kind === 'url') a.textContent = href; else inline(m[1], o, a);
        a.href = '#';
        a.title = href;
        a.addEventListener('click', e => { e.preventDefault(); if (/^https?:\/\//i.test(href)) o.link(href); else o.note(decodeURIComponent(href).replace(/\.md$/i, '')); });
        into.append(a);
      } else {
        const src = o.image(kind === 'embed' ? m[1].trim() : m[2]);
        if (src) { const img = el('img'); img.src = src; img.alt = kind === 'embed' ? '' : m[1]; img.loading = 'lazy'; into.append(img); }
        else into.append(m[0]);
      }
    }
  }

  // Lines of a paragraph keep their breaks.
  function lines(list, o, into) {
    list.forEach((line, i) => { if (i) into.append(el('br')); inline(line, o, into); });
    return into;
  }

  const LIST = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/;
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  function render(text, o) {
    const root = document.createDocumentFragment();
    const all = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let i = 0, task = 0;
    // Properties at the top (Obsidian front matter) are not shown in the reading view.
    if (all[0] === '---') { const end = all.indexOf('---', 1); if (end > 0) i = end + 1; }
    while (i < all.length) {
      const line = all[i];
      let m;
      if (!line.trim()) { i++; continue; }
      if ((m = /^\s*(```|~~~)/.exec(line))) {
        const code = [];
        for (i++; i < all.length && !all[i].trim().startsWith(m[1]); i++) code.push(all[i]);
        i++;
        root.appendChild(el('pre')).append(el('code', null, code.join('\n')));
        continue;
      }
      if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { inline(m[2], o, root.appendChild(el('h' + m[1].length))); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { root.append(el('hr')); i++; continue; }
      if (/^\s*>/.test(line)) {
        const quote = [];
        for (; i < all.length && /^\s*>/.test(all[i]); i++) quote.push(all[i].replace(/^\s*>\s?/, ''));
        const box = root.appendChild(el('blockquote'));
        box.append(render(quote.join('\n'), Object.assign({}, o, { task: null })));
        continue;
      }
      if (line.includes('|') && i + 1 < all.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(all[i + 1])) {
        const table = root.appendChild(el('table')), head = table.appendChild(el('thead')).appendChild(el('tr'));
        cells(line).forEach(c => inline(c, o, head.appendChild(el('th'))));
        const body = table.appendChild(el('tbody'));
        for (i += 2; i < all.length && all[i].includes('|') && all[i].trim(); i++) {
          const row = body.appendChild(el('tr'));
          cells(all[i]).forEach(c => inline(c, o, row.appendChild(el('td'))));
        }
        continue;
      }
      if (LIST.test(line)) {
        // Nested lists follow the indent; each task box knows its rank in the note to write the tick back.
        const stack = [];
        for (; i < all.length && (m = LIST.exec(all[i])); i++) {
          const depth = m[1].replace(/\t/g, '    ').length, ordered = /\d/.test(m[2]);
          while (stack.length && depth < stack[stack.length - 1].depth) stack.pop();
          if (!stack.length || depth > stack[stack.length - 1].depth) {
            const list = el(ordered ? 'ol' : 'ul');
            (stack.length ? stack[stack.length - 1].list.lastChild || stack[stack.length - 1].list : root).append(list);
            stack.push({ depth, list });
          }
          const item = stack[stack.length - 1].list.appendChild(el('li'));
          if (m[3]) {
            const rank = task++, box = el('input');
            box.type = 'checkbox';
            box.checked = /x/i.test(m[3]);
            item.className = 'md-task' + (box.checked ? ' is-done' : '');
            if (o.task) box.addEventListener('change', () => o.task(rank, box.checked)); else box.disabled = true;
            item.append(box);
          }
          inline(m[4], o, item);
        }
        continue;
      }
      const para = [];
      for (; i < all.length && all[i].trim() && !/^(#{1,6}\s|\s*>|\s*(```|~~~))/.test(all[i]) && !LIST.test(all[i]); i++) para.push(all[i]);
      if (!para.length) { para.push(all[i]); i++; }
      lines(para, o, root.appendChild(el('p')));
    }
    return root;
  }

  // The rank-th task line of the text, ticked or not.
  function tick(text, rank, done) {
    let n = 0, fence = null;
    return String(text).split('\n').map(line => {
      const f = /^\s*(```|~~~)/.exec(line);
      if (f) { fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]; return line; }
      if (fence) return line;
      return line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/, (all, lead) => n++ === rank ? lead + (done ? '[x]' : '[ ]') : all);
    }).join('\n');
  }

  return { render, tick };
})();
