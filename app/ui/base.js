'use strict';

// What every page of lampfish needs: the bridge to the app, the translation, and errors sent to the log.
const webview = window.chrome.webview;
const send = (action, data = {}) => webview.postMessage({ action, ...data });
const $ = id => document.getElementById(id);

addEventListener('error', e => { if (/ResizeObserver loop/.test(e.message)) return;  try { send('pageError', { text: e.message + ' · ' + (e.filename || '').replace(/^.*\//, '') + ':' + e.lineno }); } catch (x) { } });
addEventListener('unhandledrejection', e => { try { send('pageError', { text: String(e.reason) }); } catch (x) { } });

const LANGUAGE = window.LANGUAGE || 'en';
const LOCALE = LANGUAGE === 'fr' ? 'fr-FR' : 'en-US';
const DICT = window.TRANSLATION || {};
function tr(text, ...values) {
  let r = DICT[text] || text;
  values.forEach((v, i) => { r = r.split('{' + i + '}').join(v); });
  return r;
}
const ATTRIBUTES_TRANSLATED = ['title', 'aria-label', 'placeholder', 'alt'];
function translateAttributes(e) {
  if (!e.translate) return;
  for (const a of ATTRIBUTES_TRANSLATED) {
    const v = e.getAttribute(a), c = v && v.trim();
    if (c && DICT[c] && DICT[c] !== c) e.setAttribute(a, DICT[c]);
  }
}
function translateNode(n) {
  if (n.nodeType === 3) {
    if (n.parentElement && !n.parentElement.translate) return;
    const v = n.nodeValue, c = v.trim();
    if (c && DICT[c] && DICT[c] !== c) n.nodeValue = v.replace(c, DICT[c]);
    return;
  }
  if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || !n.translate) return;
  translateAttributes(n);
  for (const e of n.childNodes) translateNode(e);
}
if (LANGUAGE !== 'en') {
  document.documentElement.lang = LANGUAGE;
  translateNode(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else if (m.type === 'characterData') translateNode(m.target);
      else translateAttributes(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES_TRANSLATED });
}

// How long until a usage limit resets: minutes, then hours, then the day.
const resetIn = iso => {
  const minutes = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000));
  return minutes < 60 ? tr('{0} min', minutes) : minutes < 48 * 60 ? tr('{0} h {1}', Math.floor(minutes / 60), String(minutes % 60).padStart(2, '0')) : new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' });
};
