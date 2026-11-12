// اجرا: node test/core.test.js  (Node 20 به بالا)
const assert = require('assert');
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
  // تبدیل مارک‌داون نباید HTML خام رد کند
  const h = R.mdToHtml('<img src=x onerror=1> **b** `<i>`');
  assert(!h.includes('<img'), 'html must be escaped');

  // خروجی تکی: viewer و note
  let res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { note: true, brand: { name: 'Noiatis', nameFa: 'نویاتیس', url: 'https://example.com' } } });
  let z = await CCE.unzip(res.data);
  const viewer = await read(z, (n) => n.endsWith('/viewer.html'));
  assert(viewer.includes('&lt;script&gt;alert(1)'), 'script escaped in viewer');
  assert(!/<script>alert/.test(viewer));
  assert(viewer.includes('نویاتیس'));
  const note = await read(z, (n) => n.endsWith('/چت 1.md'));
  assert(note.startsWith('---\ntitle:') && note.includes('tags: [claude-chat]'));
  assert.strictEqual(res.lastMessageUuid, 'c1m3');

  // خروجی افزایشی
  res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { sinceMessageUuid: 'c1m1' } });
  assert(res.filename.endsWith('_new.zip'));
  z = await CCE.unzip(res.data);
  assert(!z.names.some((n) => n.includes('/transfer/')), 'no transfer pack for partial');
  assert.strictEqual(res.meta.messages, 2);
  await assert.rejects(CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { sinceMessageUuid: 'c1m3' } }), /NOTHING_NEW/);

  // پرامپت خلاصه‌ی پروژه
  res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(2), options: { aiSummary: true } });
  z = await CCE.unzip(res.data);
  assert((await read(z, (n) => n.endsWith('transfer/HANDOFF.md'))).includes('reusable project brief'));

  // فهرست و خروجی گروهی (سقف حجم ۱ بایت تا چند تکه شود)
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

  // فونت و لوگو: یک بار در ریشه‌ی ZIP، نه تکرار در هر چت
  const assets = { 'Ahang-Regular.woff2': new Uint8Array([1, 2]), 'Ahang-DemiBold.woff2': new Uint8Array([3, 4]), 'logo.png': new Uint8Array([5]) };
  const withFont = [];
  await CCE.exportMany({ fetchFn, origin: 'https://claude.ai', org, chats, options: { assets }, onPart: async (p) => withFont.push(p) });
  const zf = await CCE.unzip(withFont[0].data);
  assert.strictEqual(zf.names.filter((n) => n.endsWith('Ahang-Regular.woff2')).length, 1);
  assert((await read(zf, (n) => n === 'index.html')).includes('assets/Ahang-Regular.woff2'));
  assert((await read(zf, (n) => n.endsWith('/viewer.html'))).includes('../assets/Ahang-Regular.woff2'));
  res = await CCE.exportChat({ fetchFn, origin: 'https://claude.ai', pathname: '/chat/' + mkId(1), options: { assets, brand: { name: 'Noiatis', url: 'https://noiatis.ir/' } } });
  z = await CCE.unzip(res.data);
  assert(z.names.some((n) => n.endsWith('/assets/Ahang-DemiBold.woff2')));
  assert((await read(z, (n) => n.endsWith('/viewer.html'))).includes('assets/logo.png'), 'logo in viewer');

  // فایل خروجی Claude که با bash ساخته شده: اگر دانلود شد ذخیره شود، اگر نشد در HANDOFF بیاید
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

  // آپلود از نوع blob: آدرس معمول فایل ۴۰۴ می‌دهد ولی مسیر sandbox جواب می‌دهد
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

  // فایل بزرگ: اگر فشرده شد zip، اگر نشد تکه‌تکه؛ هیچ‌کدام رد نشود
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

  // تصویر WebP با نام .png باید پسوند درست بگیرد
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

  // ایموجی در خروجی نباید باشد
  const md1 = await read(z, (n) => n.endsWith('/conversation.md'));
  assert(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(md1), 'no emoji in conversation.md');
  for (const p of got) assert(p.data.length > 100);
  console.log('ALL OK — parts:', got.map((p) => p.filename + ' (' + p.chats + ')').join(', '));
})().catch((e) => { console.error(e); process.exit(1); });
