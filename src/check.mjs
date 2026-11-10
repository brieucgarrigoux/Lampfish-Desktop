import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logFile = process.argv[2] || join(tmpdir(), 'lampfish-check.log');
const shown = 8;
let failed = false;

const read = file => {
  const text = readFileSync(join(root, file), 'utf8');
  return (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text).replace(/\r\n/g, '\n');
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\r\n/g, '\n');
// New files count before their first commit, so a check run before committing sees them too.
const tracked = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(f => f && existsSync(join(root, f)));
const ui = file => /^app\/ui\/[^/]+$/.test(file);

function step(name, run) {
  const problems = run();
  appendFileSync(logFile, `\n[${name}] ${problems.length} problem(s)\n${problems.join('\n')}\n`);
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${name}`);
  for (const p of problems.slice(0, shown)) console.log(`      ${p}`);
  if (problems.length > shown) console.log(`      and ${problems.length - shown} more`);
  if (problems.length) failed = true;
}

const scratch = mkdtempSync(join(tmpdir(), 'lampfish-check-'));

// node --check names the first error only, which is enough: the next run finds the next one.
function syntax(source) {
  const file = join(scratch, 'script.js');
  writeFileSync(file, source);
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (run.status === 0) return null;
  const lines = run.stderr.split('\n');
  const at = lines.find(l => l.includes('script.js:'));
  return { line: at ? Number(/:(\d+)\s*$/.exec(at)?.[1]) : 0, message: lines.find(l => /Error/.test(l)) || 'syntax error' };
}

const pageScripts = page => [...read(page).matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
const pages = tracked.filter(f => ui(f) && f.endsWith('.html') && pageScripts(f).length);

// The scripts of a page share one scope, so they are parsed together: a const declared twice stops the whole page.
step('scripts of each page, parsed together', () => {
  const problems = [];
  for (const page of pages) {
    const parts = pageScripts(page).map(src => `app/ui/${src.replace(/^\.?\//, '')}`);
    const missing = parts.filter(p => !existsSync(join(root, p)));
    if (missing.length) { problems.push(...missing.map(p => `${page}: ${p} does not exist`)); continue; }
    let line = 1, joined = '';
    const starts = parts.map(file => {
      const text = read(file) + '\n';
      const start = line;
      joined += text;
      line += text.split('\n').length - 1;
      return { file, start };
    });
    const error = syntax(joined);
    if (error) {
      const part = starts.filter(s => s.start <= error.line).at(-1) || { file: page, start: 1 };
      problems.push(`${page}: ${part.file}:${error.line - part.start + 1} ${error.message}`);
    }
  }
  return problems;
});

step('scripts outside a page and inline scripts', () => {
  const problems = [];
  const used = new Set(pages.flatMap(page => pageScripts(page).map(src => `app/ui/${src.replace(/^\.?\//, '')}`)));
  for (const file of tracked.filter(f => ui(f) && f.endsWith('.js') && !used.has(f))) {
    const error = syntax(read(file));
    if (error) problems.push(`${file}:${error.line} ${error.message}`);
  }
  for (const file of tracked.filter(f => f.endsWith('.html'))) {
    for (const m of read(file).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const error = syntax(m[1]);
      if (error) problems.push(`${file}: inline script, ${error.message}`);
    }
  }
  return problems;
});

function braces(text) {
  const opened = [];
  let line = 1, quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') line++;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    }
    else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return `${line}: comment never closed`;
      line += text.slice(i, end).split('\n').length - 1;
      i = end + 1;
    }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '{') opened.push(line);
    else if (c === '}' && !opened.pop()) return `${line}: closing brace with nothing open`;
  }
  return opened.length ? `${opened.at(-1)}: brace never closed` : null;
}

step('braces of the stylesheets', () => tracked.filter(f => f.endsWith('.css')).flatMap(file => {
  const problem = braces(read(file));
  return problem ? [`${file}:${problem}`] : [];
}));

let french = {};
step('French translation file', () => {
  try { french = JSON.parse(read('app/ui/locales/fr.json')); return []; }
  catch (e) { return [`app/ui/locales/fr.json: ${e.message}`]; }
});

const unescape = text => text.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

function visibleTexts() {
  const found = new Map();
  const add = (text, where) => { if (/\p{L}/u.test(text) && !text.includes('${') && !found.has(text)) found.set(text, where); };
  for (const file of tracked.filter(f => f.endsWith('.js') && ui(f))) {
    for (const m of read(file).matchAll(/\btr\(\s*(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`)/g)) add(unescape(m[1] ?? m[2] ?? m[3]), file);
  }
  for (const file of tracked.filter(f => f.startsWith('src/') && f.endsWith('.cs'))) {
    for (const m of read(file).matchAll(/Language\.T\(\s*"((?:\\.|[^"\\\n])*)"/g)) add(unescape(m[1]), file);
  }
  for (const file of tracked.filter(f => ui(f) && f.endsWith('.html'))) {
    const html = read(file).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const m of html.matchAll(/\b(?:title|aria-label|placeholder|alt)="([^"]+)"/g)) add(m[1], file);
    for (const m of html.replace(/<[^>]*\btranslate="no"[^>]*>[^<]*/g, ' ').matchAll(/>([^<>]+)</g)) add(m[1].replace(/\s+/g, ' ').trim(), file);
  }
  return found;
}

step('visible texts have a French translation', () => {
  const skip = new Set(read('src/check-names.txt').split('\n').map(l => l.trim()).filter(Boolean));
  return [...visibleTexts()].filter(([text]) => !(text in french) && !skip.has(text)).map(([text, file]) => `${file}: "${text}"`);
});

// Every icon comes from app/ui/icons.svg: a name used in a page must be one of its symbols, and no icon is drawn inline.
step('icons come from icons.svg', () => {
  const sheet = existsSync(join(root, 'app/ui/icons.svg')) ? read('app/ui/icons.svg') : '';
  const symbols = new Set([...sheet.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
  const problems = new Set();
  for (const file of tracked.filter(f => ui(f) && /\.(html|js)$/.test(f))) {
    const text = read(file);
    for (const m of text.matchAll(/icons\.svg#([a-z0-9-]+)|\bicon\('([a-z0-9-]+)'/g)) {
      if (!symbols.has(m[1] || m[2])) problems.add(`${file}: "${m[1] || m[2]}" is not in icons.svg, run src/icons.py`);
    }
    for (const m of text.matchAll(/<svg class="ph\b[^>]*>([\s\S]*?)<\/svg>/g)) {
      if (/<(path|circle|rect|ellipse|line|polyline|polygon|g)\b/.test(m[1])) problems.add(`${file}: drawing inside an icon, ${m[0].slice(0, 70)}`);
    }
  }
  return [...problems];
});

// Help answers with actions: each one must be something the app handles, and each text must have its French.
step('actions and texts of Help', () => {
  const problems = [];
  let bot;
  try { bot = runInNewContext(read('app/ui/help-bot.js') + '\n;({ HELP_BOT })', { tr: t => t }).HELP_BOT; }
  catch (e) { return [`app/ui/help-bot.js: ${e.message}`]; }
  const views = new Set(JSON.parse((/const VIEWS = (\[[^\]]*\])/.exec(read('app/ui/main.js')) || [, '[]'])[1].replace(/'/g, '"')));
  const calls = new Set([...((/const HELP_CALLS = \{([\s\S]*?)\n  \};/.exec(read('app/ui/help.js')) || [, ''])[1]).matchAll(/^\s+'([a-z-]+)':/gm)].map(m => m[1]));
  const csharp = tracked.filter(f => f.startsWith('src/') && f.endsWith('.cs')).map(read).join('\n');
  const literals = new Set([...csharp.matchAll(/"([A-Za-z.]+)"/g)].map(m => m[1]));
  const routed = new Set([...read('src/Program.cs').matchAll(/action\.StartsWith\("([a-z]+\.)"\)/g)].map(m => m[1]));
  const companion = read('src/Companion.cs');
  const shared = new Set([...((/HashSet<string> Shared = new HashSet<string>\s*\{([\s\S]*?)\};/.exec(companion) || [, ''])[1]).matchAll(/"([^"]+)"/g)].map(m => m[1]));
  const tabs = new Set([...((/string\[\] Tabs = \{([^}]*)\}/.exec(companion) || [, ''])[1]).matchAll(/"([^"]+)"/g)].map(m => m[1]));
  const tabNames = (/const TAB_NAMES = \{([^}]*)\}/.exec(read('app/ui/companion.js')) || [, ''])[1];
  const symbols = new Set([...read('app/ui/icons.svg').matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
  const handled = action => literals.has(action) || (action.includes('.') && routed.has(action.slice(0, action.indexOf('.') + 1)) && literals.has(action.slice(action.indexOf('.') + 1)));
  const text = (value, where) => { if (typeof value !== 'string' || !value) problems.push(`${where}: missing text`); else if (!(value in french)) problems.push(`${where}: "${value}" has no French`); };
  const topics = bot.topics || {};
  text(bot.greeting, 'greeting');
  for (const id of [...(bot.start || []), ...(bot.often || [])]) if (!topics[id]) problems.push(`start or often: no topic "${id}"`);
  for (const [view, name] of Object.entries(bot.pages || {})) { if (!views.has(view)) problems.push(`pages: "${view}" is not a view`); text(name, `pages.${view}`); }
  for (const [id, t] of Object.entries(topics)) {
    for (const key of ['q', 'a']) text(t[key], `${id}.${key}`);
    if ((bot.often || []).includes(id)) text(t.hint, `${id}.hint`);
    for (const next of t.next || []) if (!topics[next]) problems.push(`${id}: no topic "${next}" to follow`);
    if ((t.do || []).length > 2) problems.push(`${id}: more than two actions`);
    (t.do || []).forEach((a, i) => {
      const where = `${id}.do[${i}]`;
      text(a.label, where);
      if (!symbols.has(a.icon)) problems.push(`${where}: icon "${a.icon}" is not in icons.svg`);
      if ([a.view, a.send, a.call].filter(Boolean).length !== 1) problems.push(`${where}: needs exactly one of view, send or call`);
      if (a.view && !views.has(a.view)) problems.push(`${where}: "${a.view}" is not a view`);
      if (a.send && !handled(a.send)) problems.push(`${where}: no C# code handles "${a.send}"`);
      if (a.call && !calls.has(a.call)) problems.push(`${where}: "${a.call}" is not in HELP_CALLS of help.js`);
      const to = a.assistant;
      if (!to) return;
      if ([to.view, to.send, to.act, to.tab].filter(Boolean).length !== 1) problems.push(`${where}.assistant: needs exactly one of view, send, act or tab`);
      if (to.view && !views.has(to.view)) problems.push(`${where}.assistant: "${to.view}" is not a view`);
      if (to.send && !(to.send.startsWith('companion.') && companion.includes(`case "${to.send}"`))) problems.push(`${where}.assistant: Companion.cs does not handle "${to.send}"`);
      if (to.act && !shared.has(to.act)) problems.push(`${where}.assistant: "${to.act}" is not shared with the assistant`);
      if (to.tab && !(tabs.has(to.tab) && new RegExp(`\\b${to.tab}:`).test(tabNames))) problems.push(`${where}.assistant: "${to.tab}" is not a tab of the assistant`);
    });
  }
  return problems;
});

step('published versions of the changelog', () => {
  const tag = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n')[0];
  if (!tag) return [];
  const tail = text => text.slice(text.search(/^## \[\d/m));
  const published = tail(git('show', `${tag}:CHANGELOG.md`));
  const now = read('CHANGELOG.md');
  const from = now.indexOf(published.split('\n')[0]);
  if (from < 0) return [`the section ${published.split('\n')[0]} is gone`];
  if (now.slice(from) === published) return [];
  const before = published.split('\n'), after = now.slice(from).split('\n');
  const line = before.findIndex((l, i) => l !== after[i]);
  return [`changed since ${tag}, near: ${(after[line] ?? before[line]).slice(0, 90)}`];
});

step('paths named in the readme', () => {
  const readme = read('README.md');
  const names = new Set();
  for (const m of readme.matchAll(/`((?:src|app|brand|wallpapers|sounds|dist)[\\/][^`<>%*]*)`/g)) names.add(m[1]);
  for (const m of readme.matchAll(/^((?:app\\|src\\|brand\\|wallpapers\\|sounds\\)\S*)\s/gm)) names.add(m[1]);
  for (const m of readme.matchAll(/(?:src="|\]\()(?!https?:|#|\.\.\/)([^")#]+)/g)) names.add(m[1]);
  return [...names].map(n => n.replace(/\\/g, '/')).filter(n => !n.startsWith('dist/') && !existsSync(join(root, n))).map(n => `README.md: ${n} does not exist`);
});

rmSync(scratch, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
