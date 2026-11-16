const ext = typeof browser !== 'undefined' ? browser : chrome;
const B = window.CCE_BRAND;
const I = window.CCE_I18N;
const t = (k, v) => I.t(k, v);
const $ = (i) => document.getElementById(i);
const st = $('st'), go = $('go'), bar = $('bar'), trk = $('trk');
const say = (t, err) => { st.textContent = t; st.className = err ? 'err' : ''; };

$('hmark').replaceWith(B.mark(36));
$('fmark').replaceWith(B.mark(18));
$('flink').appendChild(B.link('noiatis.ir'));

const O = window.CCE_OPTS;
const DEF = O.defaults();
let vals = Object.assign({}, DEF);
let lastInfo = null;
const saveAll = async () => { try { const r = await ext.storage.local.get('cce'); await ext.storage.local.set({ cce: Object.assign({}, r.cce || {}, vals) }); } catch (e) {} };
const readOpts = () => Object.assign({}, vals);

// Writes every text of the popup in the current language and builds the option rows again
function applyLang() {
  const en = I.lang === 'en';
  document.documentElement.lang = en ? 'en' : 'fa';
  document.documentElement.dir = en ? 'ltr' : 'rtl';
  document.querySelectorAll('[data-t]').forEach((e) => { e.textContent = t(e.dataset.t); });
  $('sub').textContent = `${B.name} · ${t('ver', { v: B.version })}`;
  $('fname').textContent = en ? B.name : (B.nameFa || B.name);
  $('lang').textContent = t('lang.switch');
  $('lang').title = t('lang.title');
  O.build($('opts'), () => true, vals, (k, v) => { vals[k] = v; saveAll(); }, true);
  showLast();
}
function showLast() {
  const last = lastInfo;
  if (!last) { $('last').textContent = ''; return; }
  const d = I.dateTime(last.at);
  $('last').textContent = last.error ? t('pop.last.err', { d, e: last.error }) : t('pop.last', { d, ok: last.ok, failed: last.failed, note: last.note });
}
$('lang').onclick = async () => {
  I.setLang(I.lang === 'en' ? 'fa' : 'en');
  try { const r = await ext.storage.local.get('cce'); await ext.storage.local.set({ cce: Object.assign({}, r.cce || {}, { lang: I.lang }) }); } catch (e) {}
  applyLang();
};

(async () => {
  let o = DEF, sched = 'off', last = null;
  try {
    const r = await ext.storage.local.get(['cce', 'cceSched', 'cceState']);
    o = Object.assign({}, DEF, r.cce || {});
    I.setLang(o.lang);
    vals = Object.assign({}, o);
    delete vals.lang;
    sched = (r.cceSched && r.cceSched.every) || 'off';
    last = r.cceState && r.cceState.lastBackup;
  } catch (e) {}
  lastInfo = last;
  applyLang();
  $('sched').value = sched;
  $('sched').onchange = async () => {
    try { await ext.storage.local.set({ cceSched: { every: $('sched').value } }); await ext.runtime.sendMessage({ type: 'schedule' }); } catch (e) {}
  };
})();

ext.runtime.onMessage.addListener((m) => {
  if (!m || m.type !== 'progress') return;
  const i = m.info || {};
  if (i.log) return;
  say(m.text);
  trk.style.display = 'block';
  if (i.total && !i.bulk) bar.style.width = Math.round(((i.current || 0) / i.total) * 100) + '%';
});

// If a claude.ai tab was opened before the extension was installed or updated, it has no content script.
// Inject it here so the user does not have to reload the page.
async function claudeTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/claude\.ai\//.test(tab.url || '')) throw new Error(t('pop.notab'));
  try {
    await ext.tabs.sendMessage(tab.id, { type: 'ping' });
  } catch (e) {
    await ext.scripting.executeScript({ target: { tabId: tab.id }, files: ['render.js', 'core.js', 'options.js', 'brand.js', 'content.js'] });
  }
  return tab;
}

$('all').onclick = async () => {
  try {
    const tab = await claudeTab();
    await ext.tabs.sendMessage(tab.id, { type: 'open-panel', tab: 'bulk' });
    window.close();
  } catch (e) {
    say(e.message, true);
  }
};

go.onclick = async () => {
  go.disabled = true;
  bar.style.width = '0';
  say(t('pop.starting'));
  try {
    const tab = await claudeTab();
    const options = readOpts();
    await saveAll();
    const r = await ext.tabs.sendMessage(tab.id, { type: 'export', options });
    if (!r) throw new Error(t('pop.reload'));
    if (!r.ok) throw new Error(r.error === 'NOT_A_CHAT' ? t('not.chat') : r.error);
    bar.style.width = '100%';
    say(r.filename ? t('pop.saved') + '⁦' + r.filename + '⁩' : t('pop.nonew'));
  } catch (e) {
    say(e.message, true);
  } finally {
    go.disabled = false;
  }
};
