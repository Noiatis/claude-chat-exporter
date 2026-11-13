const ext = typeof browser !== 'undefined' ? browser : chrome;
const ALARM = 'cce-backup';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Automatic backup of new or changed chats
async function applySchedule() {
  try {
    const r = await ext.storage.local.get('cceSched');
    const every = (r && r.cceSched && r.cceSched.every) || 'off';
    const period = every === 'daily' ? 1440 : every === 'weekly' ? 10080 : 0;
    const existing = await ext.alarms.get(ALARM);
    if (!period) { if (existing) await ext.alarms.clear(ALARM); return; }
    if (!existing || existing.periodInMinutes !== period) {
      await ext.alarms.create(ALARM, { delayInMinutes: 5, periodInMinutes: period });
    }
  } catch (e) { console.warn('[CCE] schedule error', e); }
}

function waitLoaded(tabId, timeout = 45000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { ext.tabs.onUpdated.removeListener(l); resolve(); }, timeout);
    function l(id, info) {
      if (id === tabId && info.status === 'complete') { clearTimeout(timer); ext.tabs.onUpdated.removeListener(l); resolve(); }
    }
    ext.tabs.onUpdated.addListener(l);
    ext.tabs.get(tabId).then((t) => { if (t && t.status === 'complete') { clearTimeout(timer); ext.tabs.onUpdated.removeListener(l); resolve(); } }).catch(() => {});
  });
}

async function runAuto() {
  try {
    const tabs = await ext.tabs.query({ url: 'https://claude.ai/*' });
    let tab = tabs[0], created = false;
    if (!tab) {
      tab = await ext.tabs.create({ url: 'https://claude.ai/recents', active: false });
      created = true;
      await waitLoaded(tab.id);
    }
    // Remember the tab so we can close it afterwards if we opened it ourselves
    await ext.storage.local.set({ cceAuto: { tabId: tab.id, created, at: Date.now() } });
    for (let i = 0; i < 40; i++) {
      try { const r = await ext.tabs.sendMessage(tab.id, { type: 'bulk-run', auto: true }); if (r && r.ok) return; } catch (e) { /* the content script is not ready yet; retry */ }
      await sleep(1500);
    }
    throw new Error('content script did not respond');
  } catch (e) {
    console.warn('[CCE] auto backup failed to start', e);
  }
}

ext.alarms.onAlarm.addListener((a) => { if (a && a.name === ALARM) runAuto(); });
ext.runtime.onInstalled.addListener(applySchedule);
ext.runtime.onStartup.addListener(applySchedule);

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'schedule') { applySchedule().then(() => sendResponse({ ok: true })); return true; }
  if (msg.type === 'auto-done') {
    (async () => {
      const r = await ext.storage.local.get('cceAuto');
      const a = r && r.cceAuto;
      if (a && a.created && a.tabId != null) { try { await ext.tabs.remove(a.tabId); } catch (e) {} }
      await ext.storage.local.remove('cceAuto');
    })();
    return;
  }
  if (msg.type !== 'download') return;
  (async () => {
    try {
      const blob = new Blob([msg.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      let id;
      try {
        id = await ext.downloads.download({ url, filename: msg.filename, saveAs: false });
      } catch (e) {
        id = await ext.downloads.download({ url, filename: 'claude-chat.zip', saveAs: false });
      }
      const onChanged = (d) => {
        if (d.id === id && d.state && d.state.current !== 'in_progress') {
          ext.downloads.onChanged.removeListener(onChanged);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      };
      ext.downloads.onChanged.addListener(onChanged);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true;
});
