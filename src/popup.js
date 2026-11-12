const ext = typeof browser !== 'undefined' ? browser : chrome;
const B = window.CCE_BRAND;
const $ = (i) => document.getElementById(i);
const st = $('st'), go = $('go'), bar = $('bar'), trk = $('trk');
const say = (t, err) => { st.textContent = t; st.className = err ? 'err' : ''; };

$('hmark').replaceWith(B.mark(36));
$('fmark').replaceWith(B.mark(18));
$('sub').textContent = `${B.name} · نسخه ${B.version}`;
$('fname').textContent = B.nameFa || B.name;
$('flink').appendChild(B.link('noiatis.ir'));

const DEF = { transfer: true, includeProject: true, redact: false, viewer: true, note: false, aiSummary: false, incremental: false, includeThinking: true, includeToolOutput: true, allBranches: false, tokenBudget: 120000 };
const MAP = { transfer: 'transfer', viewer: 'viewer', note: 'note', aiSummary: 'aiSummary', incremental: 'incremental', project: 'includeProject', redact: 'redact', think: 'includeThinking', tools: 'includeToolOutput', branches: 'allBranches' };

const readOpts = () => { const o = { tokenBudget: Number($('budget').value) }; for (const id in MAP) o[MAP[id]] = $(id).checked; return o; };
const saveAll = async () => { try { await ext.storage.local.set({ cce: readOpts() }); } catch (e) {} };

(async () => {
  let o = DEF, sched = 'off', last = null;
  try {
    const r = await ext.storage.local.get(['cce', 'cceSched', 'cceState']);
    o = Object.assign({}, DEF, r.cce || {});
    sched = (r.cceSched && r.cceSched.every) || 'off';
    last = r.cceState && r.cceState.lastBackup;
  } catch (e) {}
  for (const id in MAP) { $(id).checked = !!o[MAP[id]]; $(id).onchange = saveAll; }
  $('budget').value = String(o.tokenBudget); $('budget').onchange = saveAll;
  $('sched').value = sched;
  $('sched').onchange = async () => {
    try { await ext.storage.local.set({ cceSched: { every: $('sched').value } }); await ext.runtime.sendMessage({ type: 'schedule' }); } catch (e) {}
  };
  if (last) {
    const d = new Date(last.at).toLocaleString('fa-IR');
    $('last').textContent = last.error ? `آخرین تلاش: ${d}. خطا: ${last.error}` : `آخرین پشتیبان: ${d} — ${last.ok} چت${last.failed ? ` (${last.failed} ناموفق)` : ''}${last.note ? ' — ' + last.note : ''}`;
  }
})();

ext.runtime.onMessage.addListener((m) => {
  if (!m || m.type !== 'progress') return;
  const i = m.info || {};
  if (i.log) return;
  say(m.text);
  trk.style.display = 'block';
  if (i.total && !i.bulk) bar.style.width = Math.round(((i.current || 0) / i.total) * 100) + '%';
});

// اگر تب claude.ai قبل از نصب یا به‌روزرسانی افزونه باز شده باشد، اسکریپت صفحه را ندارد.
// به‌جای اینکه کاربر مجبور به رفرش شود، همین‌جا تزریقش می‌کنیم.
async function claudeTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/claude\.ai\//.test(tab.url || '')) throw new Error('این تب، claude.ai نیست.');
  try {
    await ext.tabs.sendMessage(tab.id, { type: 'ping' });
  } catch (e) {
    await ext.scripting.executeScript({ target: { tabId: tab.id }, files: ['render.js', 'core.js', 'brand.js', 'content.js'] });
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
  say('در حال شروع…');
  try {
    const tab = await claudeTab();
    const options = readOpts();
    await saveAll();
    const r = await ext.tabs.sendMessage(tab.id, { type: 'export', options });
    if (!r) throw new Error('صفحه را رفرش کنید و دوباره امتحان کنید.');
    if (!r.ok) throw new Error(r.error === 'NOT_A_CHAT' ? 'اول یک چت را باز کنید (آدرس /chat/…).' : r.error);
    bar.style.width = '100%';
    say(r.filename ? 'ذخیره شد: ⁦' + r.filename + '⁩' : 'از آخرین خروجی چیز تازه‌ای نیست.');
  } catch (e) {
    say(e.message, true);
  } finally {
    go.disabled = false;
  }
};
