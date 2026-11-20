// Run: node test/core.test.js  (Node 20+)
const assert = require('assert');
require('../src/brand.js'); // interface text; sets globalThis.CCE_I18N
const CCE = require('../src/core.js');
const R = require('../src/render.js');

const mkId = (n) => `${String(n).padStart(8, '0')}-2222-3333-4444-555555555555`;
function mkConv(n, extra = {}) {
  const msgs = []; let parent = '0';
  const add = (sender, content) => { const id = `c${n}m${msgs.length}`; msgs.push({ uuid: id, parent_message_uuid: parent, sender, created_at: '2026-11-01T10:00:00Z', content, attachments: [], files_v2: [] }); parent = id; };
  add('human', [{ type: 'text', text: `سلام ${n} <script>alert(1)</script>` }]);
  add('assistant', [
    { type: 'text', text: '# عنوان\n\nیک **متن** با `کد` و [لینک](https://example.com)\n\n- الف\n- ب\n\n```py\nprint("<b>")\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |' },
    { type: 'tool_use', name: 'artifacts', input: { id: 'a1', command: 'create', type: 'text/html', title: 'App', content: '<h1>v1</h1>' } },
    { type: 'tool_use', name: 'create_file', input: { path: '/mnt/user-data/outputs/a.py', file_text: 'print(1)' } },
  ]);
  add('human', [{ type: 'text', text: 'ادامه' }]);
  add('assistant', [{ type: 'text', text: 'تمام' }]);
  return Object.assign({ uuid: mkId(n), name: `چت ${n}`, model: 'claude-x', created_at: '2026-11-01T10:00:00Z', updated_at: `2026-11-0${n}T10:00:00Z`, chat_messages: msgs, current_leaf_message_uuid: parent }, extra);
}
const convs = [1, 2, 3].map((n) => mkConv(n));
const fetchFn = async (url) => {
  const ok = (b) => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => b, arrayBuffer: async () => new ArrayBuffer(0) });
  if (url.endsWith('/api/organizations')) return ok([{ uuid: 'org1' }]);
  if (/chat_conversations\?limit=100&offset=0/.test(url)) return ok(convs.map(({ chat_messages, ...c }) => c));
  if (/chat_conversations\?limit/.test(url)) return ok([]);
  const m = url.match(/chat_conversations\/([0-9a-f-]{36})/);
  if (m) { const c = convs.find((x) => x.uuid === m[1]); return c ? ok(c) : { ok: false, status: 404 }; }
  return { ok: false, status: 404 };
};
const read = async (z, pred) => new TextDecoder().decode(await z.read(z.names.find(pred)));

(async () => {
  // Markdown conversion must not pass raw HTML through
  const h = R.mdToHtml('<img src=x onerror=1> **b** `<i>`');
  assert(!h.includes('<img'), 'html must be escaped');

  // Single export: viewer and note
  let res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { note: true, brand: { name: 'Noiatis', nameFa: 'نویاتیس', url: 'https://example.com' } } });
  let z = await CCE.unzip(res.data);
  const viewer = await read(z, (n) => n.endsWith('/viewer.html'));
  assert(viewer.includes('&lt;script&gt;alert(1)'), 'script escaped in viewer');
  assert(!/<script>alert/.test(viewer));
  assert(viewer.includes('نویاتیس'));
  const note = await read(z, (n) => n.endsWith('/چت 1.md'));
  assert(note.startsWith('---\ntitle:') && note.includes('tags: [claude-chat]'));
  assert.strictEqual(res.lastMessageUuid, 'c1m3');

  // Incremental export
  res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { sinceMessageUuid: 'c1m1' } });
  assert(res.filename.endsWith('_new.zip'));
  z = await CCE.unzip(res.data);
  assert(!z.names.some((n) => n.includes('/transfer/')), 'no transfer pack for partial');
  assert.strictEqual(res.meta.messages, 2);
  await assert.rejects(CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { sinceMessageUuid: 'c1m3' } }), /NOTHING_NEW/);

  // Project summary prompt
  res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(2), options: { aiSummary: true } });
  z = await CCE.unzip(res.data);
  assert((await read(z, (n) => n.endsWith('transfer/HANDOFF.md'))).includes('reusable project brief'));

  // Chat list and bulk export (1-byte cap forces several parts)
  const { org, chats } = await CCE.listChats({ fetchFn, origin: 'https://claude.ai', cookie: '' });
  assert.strictEqual(chats.length, 3);
  assert.strictEqual(chats[0].name, 'چت 3'); // newest first
  const got = [];
  const out = await CCE.exportMany({ fetchFn, origin: 'https://claude.ai', org, chats, options: { note: true }, maxZipBytes: 1, onPart: async (p) => got.push(p) });
  assert.strictEqual(out.failed.length, 0);
  assert.strictEqual(out.done.length, 3);
  assert(got.length >= 2, 'size-limited parts');
  const zb = await CCE.unzip(got[0].data);
  assert(zb.names.includes('index.html') && zb.names.includes('index.json'));
  const idx = await read(zb, (n) => n === 'index.html');
  assert(idx.includes('viewer.html'));

  // Font and logo: once at the ZIP root, not repeated per chat
  const assets = { 'Vazirmatn-Regular.woff2': new Uint8Array([1, 2]), 'Vazirmatn-SemiBold.woff2': new Uint8Array([3, 4]), 'logo.png': new Uint8Array([5]) };
  const withFont = [];
  await CCE.exportMany({ fetchFn, origin: 'https://claude.ai', org, chats, options: { assets }, onPart: async (p) => withFont.push(p) });
  const zf = await CCE.unzip(withFont[0].data);
  assert.strictEqual(zf.names.filter((n) => n.endsWith('Vazirmatn-Regular.woff2')).length, 1);
  assert((await read(zf, (n) => n === 'index.html')).includes('assets/Vazirmatn-Regular.woff2'));
  assert((await read(zf, (n) => n.endsWith('/viewer.html'))).includes('../assets/Vazirmatn-Regular.woff2'));
  res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { assets, brand: { name: 'Noiatis', url: 'https://noiatis.ir/' } } });
  z = await CCE.unzip(res.data);
  assert(z.names.some((n) => n.endsWith('/assets/Vazirmatn-SemiBold.woff2')));
  assert((await read(z, (n) => n.endsWith('/viewer.html'))).includes('assets/logo.png'), 'logo in viewer');

  // Claude output file created with bash: saved if downloadable, otherwise listed in HANDOFF
  const pc = mkConv(4);
  pc.chat_messages[1].content.push({ type: 'tool_use', name: 'present_files', input: { filepaths: ['/mnt/user-data/outputs/ok.zip', '/mnt/user-data/outputs/gone.zip'] } });
  const pf = async (url, o) => {
    if (url.includes('wiggle/download-file') && url.includes('ok.zip')) return { ok: true, headers: { get: () => 'application/zip' }, arrayBuffer: async () => new Uint8Array([80, 75, 5, 6]).buffer };
    if (url.includes('wiggle')) return { ok: false, status: 404 };
    if (/chat_conversations\/[0-9a-f-]{36}/.test(url)) return { ok: true, headers: { get: () => 'application/json' }, json: async () => pc };
    return fetchFn(url, o);
  };
  res = await CCE.exportChat({ fetchFn: pf, origin: 'https://claude.ai', pathname: '/chat/' + mkId(4), options: {} });
  z = await CCE.unzip(res.data);
  assert(z.names.some((n) => n.endsWith('/outputs/ok.zip')), 'presented zip saved');
  assert(!z.names.some((n) => n.endsWith('/outputs/gone.zip')));
  assert((await read(z, (n) => n.endsWith('transfer/HANDOFF.md'))).includes('gone.zip'), 'missing file listed in HANDOFF');

  // Blob upload: the usual file URL returns 404 but the sandbox path works
  const bc = mkConv(5);
  bc.chat_messages[0].files = [{ file_kind: 'blob', file_uuid: 'b-1', file_name: 'data.csv', path: '/mnt/user-data/uploads/data.csv' }];
  const bf = async (url, o) => {
    if (url.includes('wiggle/download-file') && url.includes('data.csv')) return { ok: true, headers: { get: () => 'text/csv' }, arrayBuffer: async () => new TextEncoder().encode('a,b\n1,2').buffer };
    if (/chat_conversations\/[0-9a-f-]{36}/.test(url)) return { ok: true, headers: { get: () => 'application/json' }, json: async () => bc };
    return fetchFn(url, o);
  };
  res = await CCE.exportChat({ fetchFn: bf, origin: 'https://claude.ai', pathname: '/chat/' + mkId(5), options: {} });
  z = await CCE.unzip(res.data);
  assert(z.names.some((n) => n.endsWith('/files/data.csv')), 'blob upload saved via sandbox path');

  // Big file: zipped if possible, otherwise split; none is skipped
  const big = mkConv(6);
  big.chat_messages[0].files = [
    { file_kind: 'blob', file_uuid: 'z-1', file_name: 'zeros.bin', path: '/mnt/user-data/uploads/zeros.bin' },
    { file_kind: 'blob', file_uuid: 'z-2', file_name: 'noise.bin', path: '/mnt/user-data/uploads/noise.bin' },
  ];
  const noise = new Uint8Array(6000); let sd = 7; for (let i = 0; i < noise.length; i++) { sd = (sd * 1103515245 + 12345) >>> 0; noise[i] = sd >>> 24; }
  const gf = async (url, o) => {
    if (url.includes('wiggle/download-file') && url.includes('zeros.bin')) return { ok: true, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => new Uint8Array(5000).buffer };
    if (url.includes('wiggle/download-file') && url.includes('noise.bin')) return { ok: true, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => noise.buffer };
    if (/chat_conversations\/[0-9a-f-]{36}/.test(url)) return { ok: true, headers: { get: () => 'application/json' }, json: async () => big };
    return fetchFn(url, o);
  };
  res = await CCE.exportChat({ fetchFn: gf, origin: 'https://claude.ai', pathname: '/chat/' + mkId(6), options: { maxFileBytes: 2500 } });
  z = await CCE.unzip(res.data);
  assert(z.names.some((n) => n.endsWith('/transfer/files/zeros.bin.zip')), 'compressible file zipped');
  assert(z.names.filter((n) => /\/transfer\/files\/noise\.bin\.zip\.\d{3}$/.test(n)).length >= 2, 'incompressible file split');
  const man = JSON.parse(await read(z, (n) => n.endsWith('transfer/manifest.json')));
  assert(man.skipped.length === 0, 'nothing skipped');

  // A WebP image named .png must get the right extension
  const wc = mkConv(8);
  wc.chat_messages[0].files = [{ file_kind: 'image', file_uuid: 'w-1', file_name: 'shot.png', preview_url: '/img/w1' }];
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const wf = async (url, o) => {
    if (url.includes('/img/w1')) return { ok: true, headers: { get: () => 'image/webp' }, arrayBuffer: async () => webp.buffer };
    if (/chat_conversations\/[0-9a-f-]{36}/.test(url)) return { ok: true, headers: { get: () => 'application/json' }, json: async () => wc };
    return fetchFn(url, o);
  };
  res = await CCE.exportChat({ fetchFn: wf, origin: 'https://claude.ai', pathname: '/chat/' + mkId(8), options: {} });
  z = await CCE.unzip(res.data);
  assert(z.names.some((n) => n.endsWith('/files/shot.webp')) && !z.names.some((n) => n.endsWith('/files/shot.png')), 'webp renamed');

  // ---- 2.9: token estimate, phone/e-mail redaction, image/media options, no duplicate files, shrink ladder ----
  assert(CCE.estTok('سلام دنیا سلام دنیا سلام') > CCE.estTok('hello world hello worl'), 'Persian costs more tokens per character');
  assert.strictEqual(CCE.redactPII('a@b.com 09123456789 ۰۹۱۲۳۴۵۶۷۸۹ +98 912 345 6789 v2.8.3 2026-11-15'), '[EMAIL] [PHONE] [PHONE] [PHONE] v2.8.3 2026-11-15');
  const pngOf = (w, h) => { const u = new Uint8Array(40); u.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); const dv = new DataView(u.buffer); dv.setUint32(16, w); dv.setUint32(20, h); return u; };
  assert.deepStrictEqual(CCE.imageDims(pngOf(800, 600)), [800, 600]);

  const mc = mkConv(9);
  mc.chat_messages[0].content[0].text = 'تماس: me@example.com یا 09123456789';
  mc.chat_messages[0].files = [
    { file_kind: 'image', file_uuid: 'i-1', file_name: 'a.png', preview_url: '/img/a' },
    { file_kind: 'image', file_uuid: 'i-2', file_name: 'b.png', preview_url: '/img/b' },
    { file_kind: 'blob', file_uuid: 'm-1', file_name: 'voice.mp3', path: '/mnt/user-data/uploads/voice.mp3' },
  ];
  const mf = async (url, o) => {
    if (url.includes('/img/')) return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => pngOf(800, 600).buffer };
    if (url.includes('voice.mp3')) return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new Uint8Array(3000).buffer };
    if (/chat_conversations\/[0-9a-f-]{36}/.test(url)) return { ok: true, headers: { get: () => 'application/json' }, json: async () => mc };
    return fetchFn(url, o);
  };
  const run9 = async (options) => { const r = await CCE.exportChat({ fetchFn: mf, origin: 'https://claude.ai', pathname: '/chat/' + mkId(9), options }); const zz = await CCE.unzip(r.data); return { r, zz, man: JSON.parse(await read(zz, (n) => n.endsWith('transfer/manifest.json'))) }; };
  let t9 = await run9({});
  const aEntry = t9.man.attach.find((a) => a.name === 'a.png');
  assert(aEntry && /^files\/a\.png$/.test(aEntry.ref), 'image attached by reference');
  assert(!t9.zz.names.some((n) => n.includes('/transfer/files/a.png')), 'image not stored twice');
  assert(t9.zz.names.some((n) => n.endsWith('/files/a.png')), 'original kept in files/');
  assert(t9.man.skipped.some((x) => x.name === 'voice.mp3'), 'audio skipped by default');
  assert(t9.man.breakdown.images > 0 && t9.man.estTokens >= t9.man.breakdown.text + t9.man.breakdown.images, 'images counted in the estimate');
  assert(JSON.parse(await read(t9.zz, (n) => n.endsWith('/conversation.json'))).cce_file_map.some((m) => m.original === 'a.png' && m.saved === 'files/a.png'), 'file name map');
  assert(t9.man.projectPrompt.includes('Project'), 'project prompt');
  t9 = await run9({ imageMode: 'none', includeMedia: true });
  assert(t9.man.skipped.some((x) => x.name === 'a.png') && !t9.man.skipped.some((x) => x.name === 'voice.mp3'), 'image option none / media option on');
  assert(t9.man.attach.some((a) => a.name === 'voice.mp3'));
  t9 = await run9({ redactPII: true });
  const ctx9 = await read(t9.zz, (n) => /transfer\/context-part-01/.test(n));
  assert(ctx9.includes('[EMAIL]') && ctx9.includes('[PHONE]') && !ctx9.includes('me@example.com'), 'PII redacted');

  // Shrink ladder: tool lines go first, then long older Claude replies; the user's own messages and the last 12 messages stay whole
  const lc = mkConv(10, { updated_at: '2026-11-10T10:00:00Z' }); lc.chat_messages = []; let lp = '0';
  const addL = (sender, content) => { const id = 'L' + lc.chat_messages.length; lc.chat_messages.push({ uuid: id, parent_message_uuid: lp, sender, created_at: '2026-11-01T10:00:00Z', content, attachments: [], files_v2: [] }); lp = id; };
  for (let i = 0; i < 30; i++) {
    addL('human', [{ type: 'text', text: `سوال ${i} ` + 'ب'.repeat(300) }]);
    addL('assistant', [
      { type: 'tool_use', name: 'web_search', input: { query: 'q' + i } },
      { type: 'tool_result', name: 'web_search', content: [{ url: 'https://e.com/' + i, title: 't' + i }] },
      { type: 'text', text: `پاسخ ${i} ` + 'ا'.repeat(6000) },
    ]);
  }
  lc.current_leaf_message_uuid = lp;
  const lf = async (url, o) => (/chat_conversations\/[0-9a-f-]{36}/.test(url) ? { ok: true, headers: { get: () => 'application/json' }, json: async () => lc } : fetchFn(url, o));
  const runL = async (tokenBudget) => { const r = await CCE.exportChat({ fetchFn: lf, origin: 'https://claude.ai', pathname: '/chat/' + mkId(10), options: { tokenBudget } }); const zz = await CCE.unzip(r.data); const man = JSON.parse(await read(zz, (n) => n.endsWith('transfer/manifest.json'))); let ctx = ''; for (const n of zz.names.filter((x) => /transfer\/context-part-/.test(x))) ctx += new TextDecoder().decode(await zz.read(n)); return { man, ctx }; };
  let L = await runL(1e9);
  assert.strictEqual(L.man.level, 0, 'no shrinking without a cap'); assert(L.ctx.includes('[sources]'));
  L = await runL(60000);
  assert(L.man.level >= 1 && L.man.level <= 4);
  assert(L.ctx.includes('سوال 0 ' + 'ب'.repeat(300)), 'human messages stay whole');
  assert(L.ctx.includes('پاسخ 29 ' + 'ا'.repeat(6000)), 'recent replies stay whole');
  L = await runL(30000);
  assert(L.man.level >= 3 && L.man.shortened > 0, 'long older replies shortened only when needed');
  assert(L.ctx.includes('سوال 0 ' + 'ب'.repeat(300)), 'human messages still whole at level 3');

  // ---- Interface language: Persian and English ----
  const fs = require('fs'), path = require('path');
  const I = globalThis.CCE_I18N, OPT = require('../src/options.js');
  const HAS_FA = /[\u0600-\u06FF]/;
  const srcOf = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
  // Every key used in code or markup exists in both languages
  const used = new Set();
  for (const f of ['content.js', 'core.js', 'popup.js', 'render.js', 'options.js']) for (const m of srcOf(f).matchAll(/\b[tT]\('([\w.]+)'/g)) used.add(m[1]);
  for (const f of ['content.js', 'popup.html']) for (const m of srcOf(f).matchAll(/data-t[pl]?="([\w.]+)"/g)) used.add(m[1]);
  for (const f of ['content.js']) for (const m of srcOf(f).matchAll(/SW\('pjclean', '([\w.]+)', '([\w.]+)'\)/g)) { used.add(m[1]); used.add(m[2]); }
  for (const o of OPT.OPTS) { used.add('opt.' + o.k); used.add('opt.' + o.k + '.h'); used.add(OPT.GROUPS[o.g]); for (const [, k] of o.choices || []) used.add(k); }
  for (const k of ['account', 'fetch', 'project', 'messages', 'transfer', 'hash', 'zip']) used.add('phase.' + k);
  const bag = Object.fromEntries(['n', 'm', 'f', 'a', 'g', 'k', 'i', 'v', 'd', 'e', 'ok', 'failed', 'note', 'file', 'mb', 'name', 'err', 'id', 'path', 'title', 'base', 'pieces', 'cap', 'level', 'shortened', 'N', 'att', 'est', 'img', 'text', 'files', 'ft', 'total', 'raw', 'z'].map((k) => [k, 3]));
  Object.assign(bag, { has: true, ins: true, project: true, what: ['a', 'b'] });
  for (const lang of ['fa', 'en']) {
    I.setLang(lang);
    for (const k of [...used].filter((x) => !x.endsWith('.'))) { // keys built from a prefix are covered below
      const v = I.t(k, bag);
      assert(v !== k, `missing ${lang} text for ${k}`);
      const s = [].concat(v).join('\n');
      assert(!/undefined|NaN|\{\w+\}/.test(s), `bad placeholder in ${lang}:${k}`);
      // The language switch names the other language, so it is the one Persian text allowed in English
      if (lang === 'en' && !k.startsWith('lang.')) assert(s.trim().length > 0 && !HAS_FA.test(s), `English text for ${k}`);
      if (lang === 'fa' && !k.startsWith('lang.')) assert(HAS_FA.test(s), `Persian text for ${k}`);
    }
  }
  // Switching back and forth gives the same text; an unknown language falls back to Persian
  I.setLang('en'); const enTxt = I.t('tab.single'); I.setLang('fa'); const faTxt = I.t('tab.single');
  assert(enTxt === 'This chat' && faTxt === 'این چت');
  I.setLang('xx'); assert.strictEqual(I.lang, 'fa');
  // Files created by the extension follow the language
  I.setLang('en');
  const seenEn = [];
  res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), onProgress: (x) => seenEn.push(x), options: { brand: { name: 'Noiatis', nameFa: 'نویاتیس', url: 'https://example.com/' } } });
  z = await CCE.unzip(res.data);
  const vEn = await read(z, (n) => n.endsWith('/viewer.html'));
  assert(vEn.includes('<html lang="en" dir="ltr">') && vEn.includes('Search this chat') && !vEn.includes('نویاتیس'));
  const howEn = await read(z, (n) => n.endsWith('transfer/HOW-TO-IMPORT.txt'));
  assert(howEn.includes('Automatic way') && !HAS_FA.test(howEn));
  assert(seenEn.length && seenEn.every((x) => !HAS_FA.test(x)), 'progress text is English');
  assert(CCE.PHASES[0][1] === 'Reading account info');
  const idxEn = R.indexHtml({ entries: [{ title: 'a', folder: 'a', messages: 2, viewer: true }], brand: { name: 'Noiatis' } });
  assert(idxEn.includes('<html lang="en" dir="ltr">') && idxEn.includes('Last changed'));
  I.setLang('fa');
  const vFa = R.indexHtml({ entries: [], brand: { name: 'Noiatis' } });
  assert(vFa.includes('<html lang="fa" dir="rtl">') && vFa.includes('آخرین تغییر'));
  assert(CCE.PHASES[0][1] === 'خواندن اطلاعات حساب');

  // Firefox content scripts: `window` and `globalThis` are different objects there (Xray wrapper vs sandbox),
  // so shared objects must be written and read through globalThis only. Chrome hides the difference.
  for (const f of fs.readdirSync(path.join(__dirname, '../src')).filter((n) => n.endsWith('.js'))) {
    assert(!/window\.CCE_/.test(srcOf(f)), f + ': use globalThis.CCE_*, not window.CCE_* (breaks in Firefox)');
  }

  // Bytes from page-owned objects are copied into the script's own memory (Firefox); the copy must be independent and equal
  const srcAb = new Uint8Array([1, 2, 3, 250]).buffer;
  const cp = CCE.ownBytes(srcAb);
  assert(cp instanceof ArrayBuffer && cp !== srcAb && new Uint8Array(cp).join() === '1,2,3,250', 'ownBytes copies the bytes');

  // No emoji in the output
  const md1 = await read(z, (n) => n.endsWith('/conversation.md'));
  assert(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(md1), 'no emoji in conversation.md');
  for (const p of got) assert(p.data.length > 100);
  console.log('ALL OK — parts:', got.map((p) => p.filename + ' (' + p.chats + ')').join(', '));
})().catch((e) => { console.error(e); process.exit(1); });
