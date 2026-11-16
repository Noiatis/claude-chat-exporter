/*
 * Core logic: reads chats from claude.ai's own API and builds the ZIP.
 * It has no DOM dependency, so the same file is unit-tested in Node.
 */
(function (root) {
  'use strict';

  const RENDER = root.CCE_RENDER || (typeof require === 'function' ? require('./render.js') : null);
  const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'yml', 'yaml', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'sql', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'r', 'lua', 'mmd', 'svg', 'toml', 'ini', 'log', 'tex']);
  const extOf = (n) => (String(n).split('/').pop().split('.').length > 1 ? String(n).split('.').pop().toLowerCase() : '');
  const isTextName = (n) => TEXT_EXT.has(extOf(n));
  const baseName = (p) => String(p).split('/').pop();

  const sanitize = (s, max = 80) =>
    String(s == null ? 'untitled' : s)
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, max) || 'untitled';

  const LANG_EXT = {
    python: 'py', javascript: 'js', typescript: 'ts', jsx: 'jsx', tsx: 'tsx', html: 'html', css: 'css',
    json: 'json', yaml: 'yml', bash: 'sh', shell: 'sh', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp',
    csharp: 'cs', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', swift: 'swift', kotlin: 'kt',
    markdown: 'md', xml: 'xml', r: 'r', lua: 'lua',
  };

  function artifactExt(a) {
    const t = a.type || '';
    if (t === 'text/html') return 'html';
    if (t === 'image/svg+xml') return 'svg';
    if (t === 'text/markdown') return 'md';
    if (t === 'application/vnd.ant.mermaid') return 'mmd';
    if (t === 'application/vnd.ant.react') return 'jsx';
    if (t === 'application/vnd.ant.code') return LANG_EXT[(a.language || '').toLowerCase()] || 'txt';
    return 'txt';
  }

  function extFromMime(m) {
    const map = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
      'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/json': 'json',
    };
    return map[(m || '').split(';')[0].trim()] || '';
  }

  function mimeFromName(n) {
    const e = extOf(n);
    const map = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
      pdf: 'application/pdf', csv: 'text/csv', json: 'application/json', html: 'text/html', md: 'text/markdown',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    if (map[e]) return map[e];
    return TEXT_EXT.has(e) ? 'text/plain' : 'application/octet-stream';
  }

  const fence = (text, lang = '') => {
    let f = '```';
    while (text.includes(f)) f += '`';
    return f + lang + '\n' + text + '\n' + f;
  };

  function toolResultText(content) {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === 'string' ? c : c.text != null ? c.text : '[' + (c.type || 'item') + ']'))
        .join('\n');
    }
    return JSON.stringify(content, null, 2);
  }

  // Patterns for common keys and tokens; applied only when the user turns redaction on
  // and it guarantees nothing, so still review important text yourself.
  const SECRET_RES = [
    /sk-ant-[A-Za-z0-9_\-]{20,}/g,
    /sk-[A-Za-z0-9]{32,}/g,
    /gh[pousr]_[A-Za-z0-9]{30,}/g,
    /github_pat_[A-Za-z0-9_]{40,}/g,
    /AKIA[0-9A-Z]{16}/g,
    /AIza[0-9A-Za-z_\-]{35}/g,
    /xox[baprs]-[A-Za-z0-9\-]{10,}/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /\b(Bearer\s+)[A-Za-z0-9._\-]{20,}/g,
  ];
  function redactText(s) {
    let out = s;
    for (const re of SECRET_RES) out = out.replace(re, (m, g1) => (typeof g1 === 'string' ? g1 : '') + '[REDACTED]');
    return out;
  }

  // Phone numbers (Iranian mobiles in Latin or Persian digits, and +international) and e-mail addresses.
  // Like redactText this is best-effort; review important text yourself.
  const D = '[0-9\u06F0-\u06F9]';
  const PII_RES = [
    [/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g, '[EMAIL]'],
    [new RegExp(`(?<!${D})(?:\\+98|0098|98|[0\\u06F0])?[\\s-]?[9\\u06F9]${D}{2}[\\s-]?${D}{3}[\\s-]?${D}{4}(?!${D})`, 'g'), '[PHONE]'],
    [new RegExp(`(?<![\\w+])\\+\\d{1,3}[\\s.-]?\\(?\\d{1,4}\\)?(?:[\\s.-]?\\d{2,4}){2,4}(?!\\d)`, 'g'), '[PHONE]'],
  ];
  function redactPII(s) {
    let out = s;
    for (const [re, to] of PII_RES) out = out.replace(re, to);
    return out;
  }

  // Token estimate. Persian/Arabic script costs about 0.6 token per character, Latin and code about 0.3,
  // other scripts and emoji about 0.8. It is an estimate (roughly +/-10%), not an exact count.
  function estTok(s) {
    let t = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      t += c < 128 ? 0.3 : (c >= 0x600 && c <= 0x6FF) || (c >= 0xFB50 && c <= 0xFEFF) ? 0.6 : c === 0x200C ? 0.1 : 0.8;
    }
    return Math.ceil(t);
  }
  // Image size from the file header (png, jpeg, gif, webp); Claude scales images down so the cost is capped near 1600 tokens
  function imageDims(h) {
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    try {
      if (h[0] === 0x89 && h[1] === 0x50) return [dv.getUint32(16), dv.getUint32(20)];
      if (h[0] === 0x47 && h[1] === 0x49) return [dv.getUint16(6, true), dv.getUint16(8, true)];
      if (h[0] === 0x52 && h[8] === 0x57) {
        const k = String.fromCharCode(h[12], h[13], h[14], h[15]);
        if (k === 'VP8X') return [1 + (h[24] | (h[25] << 8) | (h[26] << 16)), 1 + (h[27] | (h[28] << 8) | (h[29] << 16))];
        if (k === 'VP8 ') return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
        if (k === 'VP8L') { const b = dv.getUint32(21, true); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
      }
      if (h[0] === 0xff && h[1] === 0xd8) {
        for (let i = 2; i + 9 < h.length;) {
          if (h[i] !== 0xff) { i++; continue; }
          const m = h[i + 1];
          if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
          i += 2 + dv.getUint16(i + 2);
        }
      }
    } catch (e) { /* unknown size */ }
    return null;
  }
  function binTok(name, u8) {
    const ext = extOf(name);
    if (/^(png|jpe?g|gif|webp)$/.test(ext)) {
      const d = imageDims(u8.subarray(0, Math.min(u8.length, 65536)));
      return d && d[0] && d[1] ? Math.min(1600, Math.ceil((d[0] * d[1]) / 750)) : 1200;
    }
    if (ext === 'pdf') return Math.min(90000, Math.ceil(u8.length / 45));
    if (/^(docx|xlsx|pptx)$/.test(ext)) return Math.min(60000, Math.ceil(u8.length / 15));
    return 0;
  }
  const isMediaName = (n) => /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|mp4|mov|webm|mkv|avi|m4v)$/i.test(n);
  const isImageName = (n) => /\.(png|jpe?g|gif|webp)$/i.test(n);

  // No ZIP library, to keep the extension small and easy to get through store review.
  // Compression uses the browser CompressionStream; if it is missing, files are stored uncompressed.
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  async function pipeThrough(u8, stream) {
    const w = stream.writable.getWriter();
    w.write(u8).catch(() => {});
    w.close().catch(() => {});
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }
  const deflateRaw = (u8) => pipeThrough(u8, new CompressionStream('deflate-raw'));
  const inflateRaw = (u8) => pipeThrough(u8, new DecompressionStream('deflate-raw'));
  const NO_COMPRESS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'zip', 'docx', 'xlsx', 'pptx', 'mp4', 'mp3']);

  function makeZip() {
    const enc = new TextEncoder();
    const entries = [];
    const toU8 = (d) => typeof d === 'string' ? enc.encode(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
    const add = (path, data) => { const u8 = toU8(data); entries.push({ path, name: enc.encode(path), data: u8, crc: crc32(u8) }); };
    const mk = (prefix) => ({ file: (p, d) => add(prefix + p, d), folder: (n) => mk(prefix + n + '/') });
    const api = mk('');
    api.entries = entries;
    api.generate = async () => {
      const now = new Date();
      const dt = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
      const dd = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
      let canDeflate = typeof CompressionStream !== 'undefined' && typeof Response !== 'undefined';
      const items = [];
      for (const e of entries) {
        let body = e.data, method = 0;
        if (canDeflate && e.data.length > 256 && !NO_COMPRESS.has(extOf(e.path))) {
          try {
            const z = await deflateRaw(e.data);
            if (z.length < e.data.length) { body = z; method = 8; }
          } catch (err) { canDeflate = false; }
        }
        items.push({ e, body, method });
      }
      let size = 22;
      for (const it of items) size += 30 + it.e.name.length + it.body.length + 46 + it.e.name.length;
      if (size > 0xFFFFFFFF - 1024) throw new Error('حجم خروجی از ۴ گیگابایت بیشتر است (ZIP64 پشتیبانی نمی‌شود).');
      const out = new Uint8Array(size), v = new DataView(out.buffer);
      let p = 0;
      const offs = [];
      for (const { e, body, method } of items) {
        offs.push(p);
        v.setUint32(p, 0x04034b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 0x0800, true); v.setUint16(p + 8, method, true);
        v.setUint16(p + 10, dt, true); v.setUint16(p + 12, dd, true); v.setUint32(p + 14, e.crc, true);
        v.setUint32(p + 18, body.length, true); v.setUint32(p + 22, e.data.length, true);
        v.setUint16(p + 26, e.name.length, true); v.setUint16(p + 28, 0, true);
        out.set(e.name, p + 30); p += 30 + e.name.length;
        out.set(body, p); p += body.length;
      }
      const cdStart = p;
      items.forEach(({ e, body, method }, i) => {
        v.setUint32(p, 0x02014b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 20, true); v.setUint16(p + 8, 0x0800, true); v.setUint16(p + 10, method, true);
        v.setUint16(p + 12, dt, true); v.setUint16(p + 14, dd, true); v.setUint32(p + 16, e.crc, true);
        v.setUint32(p + 20, body.length, true); v.setUint32(p + 24, e.data.length, true);
        v.setUint16(p + 28, e.name.length, true); v.setUint16(p + 30, 0, true); v.setUint16(p + 32, 0, true);
        v.setUint16(p + 34, 0, true); v.setUint16(p + 36, 0, true); v.setUint32(p + 38, 0, true); v.setUint32(p + 42, offs[i], true);
        out.set(e.name, p + 46); p += 46 + e.name.length;
      });
      v.setUint32(p, 0x06054b50, true); v.setUint16(p + 8, items.length, true); v.setUint16(p + 10, items.length, true);
      v.setUint32(p + 12, p - cdStart, true); v.setUint32(p + 16, cdStart, true);
      return out;
    };
    return api;
  }

  async function unzip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) throw new Error('فایل ZIP معتبر نیست.');
    const n = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true);
    const dec = new TextDecoder();
    const ents = new Map();
    for (let i = 0; i < n; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP خراب است.');
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      const nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      const lo = v.getUint32(p + 42, true);
      ents.set(dec.decode(u8.subarray(p + 46, p + 46 + nl)), { method, csize, lo });
      p += 46 + nl + el + cl;
    }
    return {
      names: [...ents.keys()],
      async read(name) {
        const ent = ents.get(name);
        if (!ent) throw new Error('در ZIP پیدا نشد: ' + name);
        const nl = v.getUint16(ent.lo + 26, true), el = v.getUint16(ent.lo + 28, true);
        const start = ent.lo + 30 + nl + el;
        const raw = u8.subarray(start, start + ent.csize);
        if (ent.method === 0) return raw;
        if (ent.method === 8) return inflateRaw(raw);
        throw new Error('روش فشرده‌سازی پشتیبانی نمی‌شود: ' + ent.method);
      },
    };
  }

  const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function exportChat(deps) {
    const {
      fetchFn, origin, pathname, cookie = '', onProgress = () => {}, options = {},
    } = deps;
    const opt = Object.assign({
      includeThinking: false, includeToolOutput: false, allBranches: false, imageMode: 'all', includeMedia: false, redactPII: false,
      transfer: true, redact: false, includeProject: true, viewer: true, note: false, aiSummary: false,
      sinceMessageUuid: null, brand: null, assets: null,
      tokenBudget: 120000, inlineMax: 60000, partChars: 200000, tailMessages: 6,
      maxFileBytes: 30 * 1024 * 1024,
    }, options);
    const report = [];
    const log = (s) => { report.push(s); onProgress(s, { log: true }); };
    const R = (s) => {
      if (typeof s !== 'string') return s;
      if (opt.redact) s = redactText(s);
      if (opt.redactPII) s = redactPII(s);
      return s;
    };

    const shared = deps.shared || null;
    let convId = deps.convId;
    if (!convId) {
      const m = (pathname || '').match(/\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (!m) throw new Error('NOT_A_CHAT');
      convId = m[1];
    }

    const getJson = makeGetJson(fetchFn, origin);

    onProgress('در حال خواندن اطلاعات حساب…', { phase: 'account' });
    let orgIds;
    if (shared && shared.org) orgIds = [shared.org];
    else {
      const orgsRaw = await getJson('/api/organizations');
      orgIds = orgsRaw.map((o) => o.uuid || o.id).filter(Boolean);
      const last = (cookie.match(/lastActiveOrg=([0-9a-f-]{36})/) || [])[1];
      if (last) orgIds = [last, ...orgIds.filter((x) => x !== last)];
    }

    onProgress('در حال دریافت متن چت از سرور…', { phase: 'fetch' });
    let conv = null, org = null, lastErr = null;
    const queries = [
      '?tree=True&rendering_mode=messages&render_all_tools=true',
      '?tree=True&rendering_mode=messages',
      '',
    ];
    outer: for (const o of orgIds) {
      for (const q of queries) {
        try {
          conv = await getJson(`/api/organizations/${o}/chat_conversations/${convId}${q}`);
          org = o;
          break outer;
        } catch (e) { lastErr = e; }
      }
    }
    if (!conv) throw new Error('چت پیدا نشد: ' + (lastErr && lastErr.message));

    let msgs = conv.chat_messages || [];
    if (!opt.allBranches && conv.current_leaf_message_uuid) {
      const map = new Map(msgs.map((x) => [x.uuid, x]));
      const chain = [];
      const seen = new Set();
      let cur = map.get(conv.current_leaf_message_uuid);
      while (cur && !seen.has(cur.uuid)) { seen.add(cur.uuid); chain.push(cur); cur = map.get(cur.parent_message_uuid); }
      if (chain.length) msgs = chain.reverse();
    }

    let partial = false;
    if (opt.sinceMessageUuid) {
      const si = msgs.findIndex((x) => x.uuid === opt.sinceMessageUuid);
      if (si >= 0) { msgs = msgs.slice(si + 1); partial = true; }
    }
    if (partial && !msgs.length) throw new Error('NOTHING_NEW');
    const doTransfer = opt.transfer && !partial;

    const zip = shared ? shared.zip : makeZip();
    const title = conv.name || 'chat';
    const rootName = shared ? `${sanitize(title, 60)}_${convId.slice(0, 8)}` : sanitize(title);
    const dir = zip.folder(rootName);
    const put = (path, data) => dir.file(path, typeof data === 'string' ? R(data) : data);
    const used = new Set();
    const uniq = (path) => {
      let p = path, i = 1;
      while (used.has(p.toLowerCase())) {
        const dot = path.lastIndexOf('.');
        p = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}_${i}${path.slice(dot)}` : `${path}_${i}`;
        i++;
      }
      used.add(p.toLowerCase());
      return p;
    };

    // Everything that goes into the transfer pack: {kind, name, text?, buf?, lang}
    const items = [];

    // Project info has no official documentation; ignore any error and continue without it
    let project = null;
    const projectId = conv.project_uuid || (conv.project && conv.project.uuid);
    if (opt.includeProject && projectId) {
      onProgress('در حال دریافت دستورالعمل و فایل‌های Project…', { phase: 'project' });
      try {
        const p = await getJson(`/api/organizations/${org}/projects/${projectId}`);
        project = { name: p.name || 'project', instructions: p.prompt_template || '', description: p.description || '', docs: [] };
        try {
          const docs = await getJson(`/api/organizations/${org}/projects/${projectId}/docs`);
          for (const d of Array.isArray(docs) ? docs : []) {
            if (d && d.content != null) project.docs.push({ name: d.file_name || d.uuid || 'doc', content: d.content });
          }
        } catch (e) { log('پروژه: فایل‌های knowledge خوانده نشد (' + e.message + ')'); }
        if (project.instructions) put('project/instructions.md', project.instructions);
        for (const d of project.docs) {
          const pth = uniq('project/docs/' + sanitize(d.name, 100));
          put(pth, d.content);
          items.push({ kind: 'project-doc', name: 'Project knowledge: ' + d.name, text: d.content, lang: extOf(d.name), ref: pth });
        }
        log(`پروژه «${project.name}»: دستورالعمل ${project.instructions ? 'دارد' : 'ندارد'} | ${project.docs.length} سند`);
      } catch (e) {
        log('پروژه: خوانده نشد (' + e.message + ') — اگر چت داخل Project بود، دستورالعمل‌ها را دستی منتقل کنید.');
      }
    }

    const artifacts = new Map();
    const handleArtifact = (inp, n) => {
      if (!inp || !inp.id) return null;
      let a = artifacts.get(inp.id);
      const cmd = inp.command || 'create';
      if (!a) {
        a = { id: inp.id, title: inp.title || inp.id, type: inp.type, language: inp.language, versions: [] };
        a.path = uniq(`artifacts/${sanitize(a.title)}.${artifactExt(a)}`);
        artifacts.set(inp.id, a);
      }
      if (inp.title) a.title = inp.title;
      if (inp.type) a.type = inp.type;
      if (inp.language) a.language = inp.language;
      const prev = a.versions.length ? a.versions[a.versions.length - 1] : '';
      if (cmd === 'update') {
        const oldS = inp.old_str, newS = inp.new_str == null ? '' : inp.new_str;
        const idx = oldS != null ? prev.indexOf(oldS) : -1;
        if (idx >= 0) a.versions.push(prev.slice(0, idx) + newS + prev.slice(idx + oldS.length));
        else { a.versions.push(prev); log(`پیام ${n}: به‌روزرسانی آرتیفکت «${a.title}» اعمال نشد (old_str پیدا نشد)`); }
      } else {
        const content = inp.content != null ? inp.content : inp.new_str != null ? inp.new_str : '';
        a.versions.push(content);
      }
      return a;
    };

    // Files created or edited by Claude's own file tools; key = original path
    const gen = new Map();
    const genZipPath = (p) => 'generated_files/' + String(p).split('/').filter(Boolean).map((x) => sanitize(x, 100)).join('/');
    const norm = (p) => String(p).replace(/\/+/g, '/');
    function handleFileTool(name, inp, n) {
      if (!inp) return null;
      if (name === 'present_files') {
        const list = inp.filepaths || inp.paths || [];
        for (const f of list) { const g = gen.get(norm(f)); if (g) g.presented = true; else remotePresented.add(norm(f)); }
        return { kind: 'present', list };
      }
      let cmd, path = inp.path, text = inp.file_text, oldS = inp.old_str, newS = inp.new_str;
      if (name === 'create_file') cmd = 'create';
      else if (name === 'str_replace') cmd = 'str_replace';
      else if (name === 'str_replace_based_edit_tool' || name === 'str_replace_editor') cmd = inp.command;
      else return null;
      if (path == null || cmd === 'view') return null;
      path = norm(path);
      let g = gen.get(path);
      if (cmd === 'create') {
        if (!g) { g = { path, zipPath: uniq(genZipPath(path)), content: '', presented: false, edits: 0 }; gen.set(path, g); }
        g.content = text != null ? text : '';
      } else if (cmd === 'str_replace' || cmd === 'insert') {
        if (!g) { log(`پیام ${n}: ویرایش فایلی که در این چت ساخته نشده (${path}) — محتوای پایه در دسترس نیست`); return { kind: 'edit-failed', path }; }
        if (cmd === 'str_replace') {
          const idx = oldS != null ? g.content.indexOf(oldS) : -1;
          if (idx < 0) { log(`پیام ${n}: str_replace روی ${path} اعمال نشد (old_str پیدا نشد)`); return { kind: 'edit-failed', path }; }
          g.content = g.content.slice(0, idx) + (newS == null ? '' : newS) + g.content.slice(idx + oldS.length);
        } else {
          const lines = g.content.split('\n');
          lines.splice(Number(inp.insert_line) || 0, 0, newS == null ? '' : newS);
          g.content = lines.join('\n');
        }
        g.edits++;
      } else return null;
      return { kind: cmd === 'create' ? 'create' : 'edit', path, g };
    }

    const downloaded = new Map();
    // Original name -> name saved in the ZIP (they differ when claude.ai serves a .png upload as WebP)
    const fileMap = [];
    // Files we could not fetch; also written to HANDOFF so Claude in the new chat knows what is missing
    const missing = [];
    // Files shown by present_files but created with bash (e.g. a project zip); their text is not in the chat
    const remotePresented = new Set();
    const resolveUrl = (p) => (p ? (/^https?:/i.test(p) ? p : origin + p) : null);
    function sniffImageExt(h) {
      if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'png';
      if (h[0] === 0xff && h[1] === 0xd8) return 'jpg';
      if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46) return 'gif';
      if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45) return 'webp';
      return '';
    }
    async function downloadFile(f) {
      const id = f.file_uuid || f.uuid;
      if (downloaded.has(id)) return downloaded.get(id);
      const name = sanitize(f.file_name || id, 120);
      const isImg = f.file_kind === 'image';
      const cands = [];
      if (isImg) cands.push(f.image_asset && f.image_asset.url, f.preview_url, f.thumbnail_url);
      else cands.push(`/api/organizations/${org}/files/${id}/contents`, `/api/${org}/files/${id}/contents`, f.document_asset && f.document_asset.url);
      cands.push(`/api/organizations/${org}/files/${id}/contents`, `/api/${org}/files/${id}/contents`, f.preview_url, f.thumbnail_url);
      // "blob" files (uploads that live in Claude's sandbox: csv, ipynb, zip, ...) cannot be fetched with the usual file URL,
      // but their path (/mnt/user-data/uploads/...) works with the same download endpoint as Claude output files.
      if (f.path) cands.push(`/api/organizations/${org}/conversations/${convId}/wiggle/download-file?path=${encodeURIComponent(f.path)}`);
      const seenU = new Set();
      for (const c of cands) {
        const url = resolveUrl(c);
        if (!url || seenU.has(url)) continue;
        seenU.add(url);
        try {
          const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const tm = ac ? setTimeout(() => ac.abort(), 60000) : null;
          let r;
          try { r = await fetchFn(url, { credentials: 'include', signal: ac ? ac.signal : undefined }); } finally { if (tm) clearTimeout(tm); }
          if (!r.ok) continue;
          const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
          if (/text\/html/i.test(ct) && !/\.html?$/i.test(name)) continue;
          const buf = await r.arrayBuffer();
          let fname = name;
          if (!/\.[A-Za-z0-9]{1,5}$/.test(fname)) { const e = extFromMime(ct); if (e) fname += '.' + e; }
          // claude.ai sometimes serves an uploaded image as WebP while the name says .png; make the extension match the real content
          if (isImg) { const real = sniffImageExt(new Uint8Array(buf, 0, Math.min(12, buf.byteLength))); if (real && real !== extOf(fname).replace('jpeg', 'jpg')) fname = fname.replace(/\.[A-Za-z0-9]{1,5}$/, '') + '.' + real; }
          const path = uniq(`files/${fname}`);
          dir.file(path, buf);
          const res = { path, name: fname };
          fileMap.push({ uuid: id, original: f.file_name || null, saved: path });
          downloaded.set(id, res);
          if (isTextName(fname) && buf.byteLength <= opt.inlineMax * 4) {
            items.push({ kind: 'upload', name: fname, text: new TextDecoder().decode(buf), lang: extOf(fname), zp: path });
          } else {
            items.push({ kind: 'upload', name: fname, buf: new Uint8Array(buf), zp: path });
          }
          return res;
        } catch (e) { /* try the next URL */ }
      }
      log(`دانلود فایل ناموفق: ${f.file_name} (${id})`);
      missing.push({ name: f.file_name || id, reason: 'download failed' });
      downloaded.set(id, null);
      return null;
    }

    // Three outputs from one walk: full conversation.md, compact transfer text, and viewer blocks
    const md = [];
    const compact = [];
    const views = [];
    const when = (s) => (s ? new Date(s).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '');
    md.push(`# ${title}`, '');
    md.push(`- Chat ID: \`${convId}\``);
    if (conv.model) md.push(`- Model: ${conv.model}`);
    if (conv.created_at) md.push(`- Created: ${when(conv.created_at)}`);
    if (conv.updated_at) md.push(`- Updated: ${when(conv.updated_at)}`);
    md.push(`- URL: ${origin}/chat/${convId}`, `- Messages: ${msgs.length}${partial ? ' (only messages after the previous export)' : ''}`, '', '---', '');

    let n = 0;
    const totalFiles = msgs.reduce((s0, x) => s0 + ((x.files_v2 && x.files_v2.length ? x.files_v2 : x.files) || []).length, 0);
    let fileDone = 0;
    const prog = (text) => onProgress(text, { phase: 'messages', current: n, total: msgs.length, files: { done: fileDone, total: totalFiles }, artifacts: artifacts.size, genFiles: gen.size });
    for (const msg of msgs) {
      n++;
      prog(`پردازش پیام ${n} از ${msgs.length}…`);
      const isHuman = msg.sender === 'human';
      const role = isHuman ? 'Human' : 'Claude';
      const mdLines = [];
      const plain = [];
      const auxIdx = new Set(); // lines about tool use; shortened first when the text must shrink
      const pa = (...ls) => { for (const l of ls) { auxIdx.add(plain.length); plain.push(l); } };
      const viewBlocks = [];
      mdLines.push(`## ${isHuman ? 'Human' : 'Claude'}${msg.created_at ? ' — ' + when(msg.created_at) : ''}`, '');

      const blocks = Array.isArray(msg.content) && msg.content.length ? msg.content : null;
      if (!blocks) {
        if (msg.text) { mdLines.push(msg.text, ''); plain.push(msg.text, ''); viewBlocks.push({ t: 'text', text: msg.text }); }
      } else {
        for (const b of blocks) {
          if (!b) continue;
          if (b.type === 'text') { if (b.text) { mdLines.push(b.text, ''); plain.push(b.text, ''); viewBlocks.push({ t: 'text', text: b.text }); } }
          else if (b.type === 'thinking') {
            if (b.thinking) viewBlocks.push({ t: 'think', text: b.thinking });
            if (opt.includeThinking && b.thinking) mdLines.push('<details><summary>Thinking</summary>', '', b.thinking, '', '</details>', '');
          } else if (b.type === 'tool_use') {
            const inp = b.input || {};
            if (/^artifacts?$/i.test(b.name || '') && inp.id) {
              const a = handleArtifact(inp, n);
              viewBlocks.push({ t: 'artifact', title: a.title, cmd: inp.command || 'create', path: a.path });
              mdLines.push(`> **Artifact:** ${a.title} → \`${a.path}\` (${inp.command || 'create'})`, '');
              plain.push(`[Artifact "${a.title}" ${inp.command || 'create'} — latest version is in the "Files and artifacts" section]`, '');
              continue;
            }
            const fr = handleFileTool(b.name, inp, n);
            if (fr && fr.kind === 'present') {
              viewBlocks.push({ t: 'note', text: 'Presented: ' + fr.list.join(', ') });
              mdLines.push(`> **Presented files:** ${fr.list.join(', ')}`, '');
              plain.push(`[Presented to user: ${fr.list.join(', ')}]`, '');
            } else if (fr && (fr.kind === 'create' || fr.kind === 'edit')) {
              viewBlocks.push({ t: 'file', name: `${fr.kind === 'create' ? 'created' : 'edited'}: ${fr.path}`, path: fr.g.zipPath });
              mdLines.push(`> **File ${fr.kind === 'create' ? 'created' : 'edited'}:** \`${fr.g.zipPath}\``, '');
              plain.push(`[File ${fr.kind === 'create' ? 'created' : 'edited'}: ${fr.path}]`, '');
            } else if (fr && fr.kind === 'edit-failed') {
              mdLines.push(`> File edit not applied: \`${fr.path}\``, '');
            } else {
              viewBlocks.push({ t: 'tool', name: b.name, text: JSON.stringify(inp, null, 2).slice(0, 2000) });
              if (opt.includeToolOutput) mdLines.push(`> **Tool:** ${b.name}`, '', fence(JSON.stringify(inp, null, 2), 'json'), '');
              if (b.name === 'web_search' && inp.query) pa(`[web search: ${inp.query}]`, '');
              else if (b.name === 'web_fetch' && inp.url) pa(`[web fetch: ${inp.url}]`, '');
              else if (inp.command && typeof inp.command === 'string') pa(`[${b.name}: ${inp.command.slice(0, 200).replace(/\n/g, ' ⏎ ')}]`, '');
              else pa(`[tool: ${b.name}]`, '');
            }
          } else if (b.type === 'tool_result') {
            { const tt = toolResultText(b.content); if (tt.trim()) viewBlocks.push({ t: 'toolres', name: b.name, text: tt.slice(0, 2000) }); }
            if (opt.includeToolOutput) {
              let t = toolResultText(b.content);
              if (t.length > 4000) t = t.slice(0, 4000) + '\n… (truncated, full text in conversation.json)';
              if (t.trim()) mdLines.push(`> **Tool result${b.name ? ': ' + b.name : ''}**`, '', fence(t), '');
            }
            if ((b.name === 'web_search' || b.name === 'web_fetch') && Array.isArray(b.content)) {
              const src = b.content.filter((c) => c && c.url).slice(0, 6);
              if (src.length) { pa('[sources]', ...src.map((c) => `- ${c.title || c.url} — ${c.url}`), ''); viewBlocks.push({ t: 'sources', list: src.map((c) => ({ title: c.title, url: c.url })) }); }
            }
          } else if (opt.includeToolOutput) {
            mdLines.push(fence(JSON.stringify(b, null, 2), 'json'), '');
          }
        }
      }

      let ai = 0;
      for (const at of msg.attachments || []) {
        ai++;
        if (at.extracted_content != null) {
          const aname = at.file_name || 'attachment.txt';
          const p = uniq(`attachments/msg${String(n).padStart(3, '0')}_${ai}_${sanitize(aname, 100)}`);
          put(p, at.extracted_content);
          viewBlocks.push({ t: 'attach', name: aname, path: p });
          mdLines.push(`> **Attachment:** [${aname}](${p})`, '');
          plain.push(`[attached text file: ${aname} — content is in the "Files and artifacts" section]`, '');
          items.push({ kind: 'attachment', name: aname, text: at.extracted_content, lang: extOf(aname), ref: p });
        }
      }
      const files = (msg.files_v2 && msg.files_v2.length ? msg.files_v2 : msg.files) || [];
      for (const f of files) {
        prog(`دانلود فایل «${f.file_name || ''}» (${fileDone + 1} از ${totalFiles})…`);
        const r = await downloadFile(f);
        fileDone++;
        prog(r ? `فایل «${f.file_name || ''}» دانلود شد` : `فایل «${f.file_name || ''}» دانلود نشد`);
        if (r) {
          viewBlocks.push({ t: f.file_kind === 'image' ? 'image' : 'file', name: r.name, path: r.path });
          mdLines.push(f.file_kind === 'image' ? `![${f.file_name}](${r.path})` : `> **File:** [${f.file_name}](${r.path})`, '');
          plain.push(`[${f.file_kind === 'image' ? 'image' : 'file'} ${isHuman ? 'uploaded' : 'produced'}: ${r.name}]`, '');
        } else {
          mdLines.push(`> File could not be downloaded: ${f.file_name}`, '');
          plain.push(`[file could not be downloaded: ${f.file_name}]`, '');
        }
      }
      mdLines.push('---', '');
      md.push(...mdLines);
      compact.push({ n, role, when: when(msg.created_at), text: plain.join('\n').trim(), lines: plain.map((l, i) => ({ s: l, a: auxIdx.has(i) })) });
      views.push({ n, role, when: when(msg.created_at), blocks: viewBlocks });
    }

    // Claude output files (/mnt/user-data/outputs/...) created with bash.
    // Their download URL is undocumented; try several paths and report honestly if none works.
    for (const p of remotePresented) {
      if (gen.has(p)) continue;
      const base = baseName(p);
      const q = encodeURIComponent(p);
      let ok = false;
      for (const u of [
        `/api/organizations/${org}/conversations/${convId}/wiggle/download-file?path=${q}`,
        `/api/organizations/${org}/chat_conversations/${convId}/wiggle/download-file?path=${q}`,
      ]) {
        try {
          const r = await fetchFn(origin + u, { credentials: 'include' });
          if (!r.ok) continue;
          const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
          if (/application\/json|text\/html/i.test(ct) && !/\.(json|html?)$/i.test(base)) continue;
          const buf = await r.arrayBuffer();
          if (buf.byteLength > opt.maxFileBytes) { missing.push({ name: base, reason: 'larger than 30MB' }); ok = true; break; }
          const path = uniq('outputs/' + sanitize(base, 120));
          put(path, buf);
          items.push({ kind: 'upload', name: base, buf: new Uint8Array(buf), zp: path });
          ok = true;
          break;
        } catch (e) { /* next path */ }
      }
      if (!ok) { log(`فایل خروجی Claude دانلود نشد: ${base}`); missing.push({ name: base, reason: 'not available for download (Claude output)' }); }
    }

    const orderedItems = [];
    for (const a of artifacts.values()) {
      if (!a.versions.length) continue;
      const lastV = a.versions[a.versions.length - 1];
      put(a.path, lastV);
      if (a.versions.length > 1) {
        const base = a.path.replace(/^artifacts\//, '');
        const dot = base.lastIndexOf('.');
        a.versions.forEach((v, i) => put(`artifacts/_versions/${base.slice(0, dot)}_v${i + 1}${base.slice(dot)}`, v));
      }
      orderedItems.push({ kind: 'artifact', name: `${a.title}.${artifactExt(a)}`, text: lastV, lang: artifactExt(a), src: a.path, ref: a.path });
    }
    const genItems = [];
    for (const g of gen.values()) {
      put(g.zipPath, g.content);
      genItems.push({ kind: g.presented ? 'deliverable' : 'generated', name: baseName(g.path), text: g.content, lang: extOf(g.path), src: g.zipPath, presented: g.presented, ref: g.zipPath });
    }
    genItems.sort((x, y) => (y.presented ? 1 : 0) - (x.presented ? 1 : 0));
    const allItems = [...orderedItems, ...genItems, ...items.filter((i) => i.kind !== 'project-doc'), ...items.filter((i) => i.kind === 'project-doc')];

    put('conversation.md', md.join('\n'));
    put('conversation.json', JSON.stringify(fileMap.length ? Object.assign({}, conv, { cce_file_map: fileMap }) : conv, null, 2));

    const artView = allItems.filter((it) => it.text != null && it.src).map((it) => ({ title: it.name, path: it.src, content: it.text.length <= 200000 ? it.text : null }));
    let noteName = null;
    if (RENDER && opt.viewer) {
      // In multi-chat mode the font and logo are written once at the ZIP root (exportMany), not in every folder
      let assetBase = null;
      if (opt.assets) {
        assetBase = shared ? '../assets/' : 'assets/';
        if (!shared) for (const f in opt.assets) put('assets/' + f, opt.assets[f]);
      }
      const html = RENDER.viewerHtml({
        title, brand: opt.brand, views, artifacts: artView, assetBase,
        meta: [['Chat ID', convId], ['Model', conv.model || '-'], ['Created', when(conv.created_at)], ['Updated', when(conv.updated_at)], ['Messages', String(msgs.length)]].filter((x) => x[1] && x[1] !== '-'),
      });
      put('viewer.html', html);
    }
    if (RENDER && opt.note) {
      noteName = uniq(sanitize(title, 80) + '.md');
      put(noteName, RENDER.noteMd({ title, convId, url: `${origin}/chat/${convId}`, created: conv.created_at, updated: conv.updated_at, model: conv.model, project: project && project.name, views, artifacts: artView }));
    }

    let stats = { estTokens: 0, parts: 0, attachFiles: 0 };
    if (doTransfer) {
      onProgress('در حال ساخت بسته‌ی انتقال (HANDOFF و بخش‌های متن)…', { phase: 'transfer' });
      const tdir = 'transfer/';
      const PROMPT_TOK = 2500; // the instruction message itself

      // Small files go inline in the text; large ones become separate attachments
      const inlineBlocks = [];
      const inlineText = []; // {index, it, txt, label}; used to shrink the size when the cap is exceeded
      const attach = []; // {rel, name, bytes, data, ref}; ref = path of an identical file already in the ZIP
      const skipped = missing.slice();
      const attachUsed = new Set();
      const attachName = (name) => {
        let nm = sanitize(name, 100), i = 1;
        while (attachUsed.has(nm.toLowerCase())) { const d = nm.lastIndexOf('.'); nm = d > 0 ? `${nm.slice(0, d)}_${i}${nm.slice(d)}` : `${nm}_${i}`; i++; }
        attachUsed.add(nm.toLowerCase());
        return nm;
      };
      // A text attachment that is byte-identical to a file already stored in the ZIP is not written twice
      const refFor = (it, txt) => (it.ref ? it.ref : it.zp && txt === it.text ? it.zp : null);
      let imgTok = 0, fileTok = 0;

      const imgs = allItems.filter((it) => it.buf && isImageName(it.name));
      const keepImg = new Set(opt.imageMode === 'none' ? [] : opt.imageMode === 'last10' ? imgs.slice(-10) : imgs);

      for (const it of allItems) {
        const label = `${it.name}  [${it.kind}${it.src ? ' · ' + it.src : ''}]`;
        if (it.text != null) {
          const txt = R(it.text);
          if (txt.length <= opt.inlineMax) {
            inlineText.push({ index: inlineBlocks.length, it, txt, label });
            inlineBlocks.push(`### FILE: ${label}\n\n${fence(txt, it.lang || '')}`);
          } else {
            const nm = attachName(it.name);
            attach.push({ rel: 'files/' + nm, name: nm, data: txt, bytes: new TextEncoder().encode(txt).length, ref: refFor(it, txt) });
            fileTok += estTok(txt);
            inlineBlocks.push(`### FILE: ${label}\n\n(large file — attached separately as "${nm}")`);
          }
        } else if (it.buf) {
          if (isMediaName(it.name) && !opt.includeMedia) {
            skipped.push({ name: it.name, reason: 'audio/video is not transferred (Claude cannot play it)' });
            continue;
          }
          if (isImageName(it.name) && !keepImg.has(it)) {
            skipped.push({ name: it.name, reason: opt.imageMode === 'none' ? 'images were left out by choice' : 'older image left out by choice' });
            continue;
          }
          if (it.buf.byteLength > opt.maxFileBytes) {
            // claude.ai rejects files over 30 MB; zip first (CSV and text shrink a lot)
            // and if still too large, split into parts so nothing is lost.
            const zipped = makeZip();
            zipped.file(it.name, it.buf);
            const packed = await zipped.generate();
            const chunk = Math.max(1, opt.maxFileBytes - 1024 * 1024);
            let pieces;
            if (packed.length <= opt.maxFileBytes) pieces = [[it.name + '.zip', packed]];
            else {
              pieces = [];
              for (let off = 0, k = 1; off < packed.length; off += chunk, k++) pieces.push([`${it.name}.zip.${String(k).padStart(3, '0')}`, packed.subarray(off, off + chunk)]);
            }
            const names = pieces.map(([n, d]) => {
              const nm = attachName(n);
              attach.push({ rel: 'files/' + nm, name: nm, data: d, bytes: d.length, ref: null });
              return nm;
            });
            const joined = `${it.name}.zip`;
            const how = pieces.length > 1 ? ` Join the parts in order (cat ${joined}.* > ${joined}) and unzip.` : ' Unzip it to get the original file.';
            inlineBlocks.push(`### FILE: ${label}\n\n(binary file larger than ${Math.round(opt.maxFileBytes / 1048576)}MB — attached as ${names.map((n) => '"' + n + '"').join(', ')}.${how})`);
            log(`${it.name}: بزرگ‌تر از سقف بود؛ ${pieces.length > 1 ? 'در ' + pieces.length + ' تکه' : 'فشرده'} به بسته‌ی انتقال رفت.`);
          } else {
            const nm = attachName(it.name);
            attach.push({ rel: 'files/' + nm, name: nm, data: it.buf, bytes: it.buf.byteLength, ref: it.zp || null });
            const tk = binTok(it.name, it.buf);
            if (isImageName(it.name)) imgTok += tk; else fileTok += tk;
            inlineBlocks.push(`### FILE: ${label}\n\n(binary file — attached separately as "${nm}")`);
          }
        }
      }
      if (skipped.length > missing.length) log(`${skipped.length - missing.length} فایل طبق گزینه‌ها وارد بسته‌ی انتقال نشد (عکس‌ها/صوت/ویدئو). در خروجی کامل موجودند.`);

      // Inline files may use at most half of the budget; if they exceed it, the largest ones become separate attachments
      const budget = opt.tokenBudget;
      let inlineTok = inlineBlocks.reduce((n, x) => n + estTok(x), 0);
      for (const c of inlineText.sort((a, b) => b.txt.length - a.txt.length)) {
        if (inlineTok <= budget * 0.5) break;
        const nm = attachName(c.it.name);
        attach.push({ rel: 'files/' + nm, name: nm, data: c.txt, bytes: new TextEncoder().encode(c.txt).length, ref: refFor(c.it, c.txt) });
        fileTok += estTok(c.txt);
        const moved = `### FILE: ${c.label}\n\n(attached separately as "${nm}" to keep the context small)`;
        inlineTok -= estTok(inlineBlocks[c.index]) - estTok(moved);
        inlineBlocks[c.index] = moved;
      }

      const projBlock = project && (project.instructions || project.description)
        ? `## Project instructions (my standing instructions for this work)\n\n${R(project.instructions || project.description)}` : null;
      const filesHeader = '## Files and artifacts (latest versions)';
      const head = `# ${title}\n\nContext transferred from another Claude account.\nOriginal chat: ${origin}/chat/${convId}${conv.created_at ? ' · created ' + when(conv.created_at) : ''} · ${msgs.length} messages.`;

      // Shrinking ladder, gentlest first, only while the estimate is over the budget:
      //   1: drop source lists and clip tool lines in older messages
      //   2: drop tool lines in older messages entirely
      //   3: cut very long older Claude replies (human messages stay whole)
      //   4: cut long older Claude replies harder and very long human messages
      // The last 12 messages are never touched.
      let shortened = 0;
      const clipAt = (t, lim, keep) => {
        if (t.length <= lim) return t;
        let cut = t.lastIndexOf('\n\n', keep);
        if (cut < keep * 0.6) cut = keep;
        shortened++;
        return t.slice(0, cut).trimEnd() + '\n…[shortened — the full text is in the exported ZIP, not attached]';
      };
      const buildTranscript = (level) => {
        shortened = 0;
        return compact.map((c, i) => {
          const isTail = i >= compact.length - 12;
          let t;
          if (isTail || level === 0) t = c.text;
          else {
            const keep = []; let dropped = 0;
            for (const l of c.lines) {
              if (!l.a) { keep.push(l.s); continue; }
              if (level >= 2) { if (l.s.startsWith('[')) dropped++; continue; }
              if (l.s.startsWith('- ') || l.s === '[sources]') continue; // level 1: source lists go
              keep.push(l.s.length > 140 ? l.s.slice(0, 137) + '…]' : l.s);
            }
            if (dropped) keep.push(`[${dropped} tool step(s) omitted]`);
            t = keep.join('\n').trim();
            if (level >= 3 && c.role === 'Claude') t = level >= 4 ? clipAt(t, 1800, 1400) : clipAt(t, 3500, 2800);
            if (level >= 4 && c.role === 'Human') t = clipAt(t, 5000, 3500);
          }
          return `### [${c.n}] ${c.role}${c.when ? ' — ' + c.when : ''}\n\n${R(t)}`;
        });
      };
      const fixedTok = estTok(head) + (projBlock ? estTok(projBlock) : 0) + inlineBlocks.reduce((n, x) => n + estTok(x), 0);
      const sumTok = (arr) => arr.reduce((n, x) => n + estTok(x), 0);
      const nonText = imgTok + fileTok + PROMPT_TOK;
      let level = 0, transcript = buildTranscript(0), trTok = sumTok(transcript);
      while (level < 4 && fixedTok + trTok + nonText > budget) { level++; transcript = buildTranscript(level); trTok = sumTok(transcript); }
      if (level) log(`متن از سقف ${budget >= 1e9 ? '' : opt.tokenBudget + ' توکن '}بیشتر بود؛ فقط بخش‌های کم‌اهمیت قدیمی کوتاه شد (سطح ${level} از ۴${shortened ? '، ' + shortened + ' پیام کوتاه‌شده' : ''}). پیام‌های خودتان (جز موارد بسیار بلند) دست‌نخورده‌اند.`);

      const blocks = [head];
      if (projBlock) blocks.push(projBlock);
      blocks.push('## Transcript', ...transcript);
      if (inlineBlocks.length) blocks.push(filesHeader, ...inlineBlocks);

      const splitBig = (s, max) => {
        const out = [];
        while (s.length > max) {
          let cut = s.lastIndexOf('\n', max);
          if (cut < max * 0.5) cut = max;
          out.push(s.slice(0, cut)); s = s.slice(cut);
        }
        out.push(s);
        return out;
      };
      const partsText = [];
      let cur = '';
      for (const b0 of blocks) {
        for (const b of splitBig(b0, opt.partChars)) {
          if (cur && cur.length + b.length + 2 > opt.partChars) { partsText.push(cur); cur = ''; }
          cur += (cur ? '\n\n' : '') + b;
        }
      }
      if (cur) partsText.push(cur);
      const N = partsText.length;
      const pad = (i) => String(i).padStart(2, '0');
      const partNames = partsText.map((_, i) => `context-part-${pad(i + 1)}-of-${pad(N)}.md`);
      const textTok = sumTok(partsText);
      const estTokens = textTok + imgTok + fileTok + PROMPT_TOK;
      const breakdown = { text: textTok, images: imgTok, files: fileTok };

      const attachList = [];
      partsText.forEach((t, i) => {
        const txt = `<!-- Chat transfer context — "${title}" — part ${i + 1} of ${N} -->\n\n${t}\n`;
        dir.file(tdir + partNames[i], txt);
        attachList.push({ path: partNames[i], name: partNames[i], bytes: new TextEncoder().encode(txt).length, mime: 'text/markdown' });
      });
      for (const a of attach) {
        // ref: the same bytes already live in the ZIP (files/, artifacts/, ...), so they are not stored a second time
        if (a.ref) attachList.push({ ref: a.ref, name: a.name, bytes: a.bytes, mime: mimeFromName(a.name) });
        else { dir.file(tdir + a.rel, a.data); attachList.push({ path: a.rel, name: a.name, bytes: a.bytes, mime: mimeFromName(a.name) }); }
      }

      const clip = (s, k) => (s.length > k ? s.slice(0, k) + ' …[truncated]' : s);
      const firstHuman = compact.find((c) => c.role === 'Human');
      const tail = compact.slice(-opt.tailMessages).map((c) => `**[${c.n}] ${c.role}:** ${clip(R(c.text), 2500)}`).join('\n\n');
      const mkPrompt = (inProject) => [
        inProject ? '# Continue a conversation transferred from another Claude account (Project mode)' : '# Continue a conversation transferred from another Claude account',
        '',
        'I am continuing a conversation I previously had with Claude in a different account. Everything needed to continue ' + (inProject ? 'is in this Project\'s knowledge.' : 'is attached.'),
        '',
        inProject ? '## What is in the Project knowledge' : '## What is attached',
        `- ${N} context file(s), in order: ${partNames.join(', ')}. They contain ${project && projectId ? 'the project instructions, ' : ''}the transcript, and the latest version of every artifact/file produced in the chat.`,
        attach.length ? `- ${attach.length} extra file(s): ${attach.map((a) => a.name).join(', ')}.` : '- No extra files.',
        skipped.length ? `- NOT transferred: ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.` : '',
        level >= 3 && shortened ? '- Some long, older messages were shortened (marked "[shortened"). Ask me if a detail seems to be missing.' : '',
        '',
        '## How to proceed',
        '1. Read ALL context files in order before answering.',
        '2. Treat the latest artifact/file versions as current. Do not redo finished work.',
        '3. Treat the project instructions (if present) as my standing instructions.',
        '4. Reply with: (a) a short summary of the project and my goal, (b) decisions already made, (c) open items and next steps, (d) anything missing or unclear. Then wait for my next instruction.',
        '5. Continue in the language used in the transcript.',
        opt.aiSummary ? '6. After your reply, also write a concise, reusable project brief (goal, key decisions, current status, file map, next steps) as a single markdown document that I can keep as project knowledge for future chats.' : '',
        '',
        '## Original chat',
        `- Title: ${title}`,
        conv.created_at ? `- Created: ${when(conv.created_at)}` : '',
        `- Messages: ${msgs.length} · estimated size of context files: ~${estTokens} tokens`,
        firstHuman ? `\n## First request (truncated)\n${clip(R(firstHuman.text), 1500)}` : '',
        `\n## Most recent exchanges (truncated)\n${tail}`,
      ].filter((x) => x !== '').join('\n');
      const prompt = mkPrompt(false);

      dir.file(tdir + 'HANDOFF.md', prompt + '\n');
      dir.file(tdir + 'ATTACH-LIST.txt', [...partNames.map((n) => 'transfer/' + n), ...attachList.filter((a) => !partNames.includes(a.name)).map((a) => (a.ref ? a.ref : 'transfer/' + a.path))].join('\n') + '\n');
      dir.file(tdir + 'HOW-TO-IMPORT.txt', [
        'روش خودکار (توصیه می‌شود):',
        '۱) در اکانت جدید claude.ai یک چت جدید باز کنید (یا داخل یک Project).',
        '۲) دکمه‌ی گرد نویاتیس ← تب «ورود» ← «انتخاب ZIP انتقال» و همین فایل ZIP را انتخاب کنید.',
        '۳) فایل‌ها پیوست و متن آماده در کادر پیام قرار می‌گیرد؛ فقط Send را بزنید.',
        '   اگر حجم زیاد باشد، افزونه «بسته‌ی Project» را پیشنهاد می‌دهد.',
        '',
        'روش دستی:',
        '۱) همه‌ی فایل‌های فهرست‌شده در ATTACH-LIST.txt را به چت جدید پیوست کنید.',
        '۲) محتوای HANDOFF.md را به‌عنوان پیام بچسبانید و بفرستید.',
        '',
        'اگر محدودیت تعداد/حجم فایل پر شد: یک Project جدید بسازید، فایل‌ها را در Knowledge آن بگذارید،',
        'و محتوای HANDOFF.md را در اولین پیام یک چت داخل همان Project بفرستید.',
        project ? 'دستورالعمل‌های پروژه‌ی قبلی در پوشه‌ی project/ هست؛ آن را در Instructions پروژه‌ی جدید بگذارید.' : '',
      ].join('\n'));
      dir.file(tdir + 'manifest.json', JSON.stringify({
        format: 'cce-transfer/1', title, convId, parts: N, messages: msgs.length, estTokens, breakdown, level, shortened,
        prompt, projectPrompt: mkPrompt(true), attach: attachList, skipped,
        hasProjectInstructions: !!(project && project.instructions),
      }, null, 2));

      stats = { estTokens, parts: N, attachFiles: attachList.length, breakdown, level, shortened, suggestProject: estTokens > 150000 };
      log(`بسته‌ی انتقال: ${N} بخش متن + ${attach.length} فایل جدا | حدود ${estTokens} توکن (متن ${textTok} · عکس‌ها ${imgTok} · فایل‌ها ${fileTok})`);
      if (stats.suggestProject) log('حجم از حدود ۱۵۰ هزار توکن بیشتر است. هنگام ورود، افزونه «بسته‌ی Project» را پیشنهاد می‌دهد (چت جدید پر نمی‌شود).');
    }

    log(`پیام‌ها: ${msgs.length} | فایل‌ها: ${[...downloaded.values()].filter(Boolean).length}/${downloaded.size} | آرتیفکت‌ها: ${artifacts.size} | فایل‌های ساخته‌شده: ${gen.size}`);
    put('export-report.txt', report.join('\n'));

    // Hash of every file in export-manifest.json so the ZIP can be verified later
    const meta = {
      title, convId, rootName, created: conv.created_at, updated: conv.updated_at, model: conv.model, messages: msgs.length,
      project: project && project.name, viewer: !!(RENDER && opt.viewer), note: noteName, partial,
      lastMessageUuid: msgs.length ? msgs[msgs.length - 1].uuid : null,
      counts: { messages: msgs.length, files: fileDone, artifacts: artifacts.size, genFiles: gen.size },
    };
    if (shared) { onProgress('تمام شد', { phase: 'done' }); return { meta, report, stats }; }
    onProgress('در حال محاسبه‌ی هش فایل‌ها…', { phase: 'hash', current: 0, total: zip.entries.length });
    const man = [];
    let hi = 0;
    for (const e of zip.entries) {
      hi++;
      if (hi % 10 === 0) onProgress(`هش فایل ${hi} از ${zip.entries.length}…`, { phase: 'hash', current: hi, total: zip.entries.length });
      let sha = null;
      try { if (typeof crypto !== 'undefined' && crypto.subtle) sha = toHex(await crypto.subtle.digest('SHA-256', e.data)); } catch (err) { /* the hash is optional */ }
      man.push({ path: e.path.slice(rootName.length + 1), bytes: e.data.length, sha256: sha });
    }
    dir.file('export-manifest.json', JSON.stringify({ title, convId, exportedAt: new Date().toISOString(), files: man }, null, 2));

    onProgress('در حال فشرده‌سازی و ساخت فایل ZIP…', { phase: 'zip' });
    const data = await zip.generate();
    const date = new Date().toISOString().slice(0, 10);
    onProgress('تمام شد', { phase: 'done' });
    return { data, filename: `${rootName}_${date}${partial ? '_new' : ''}.zip`, report, stats, meta, counts: meta.counts, lastMessageUuid: meta.lastMessageUuid, updatedAt: conv.updated_at, convId };
  }

  // Plain JSON GET with the session cookie; used by both single-chat export and chat listing
  const makeGetJson = (fetchFn, origin) => async (url) => {
    const r = await fetchFn(origin + url, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  };

  async function listChats(deps) {
    const { fetchFn, origin, cookie = '' } = deps;
    const getJson = makeGetJson(fetchFn, origin);
    const orgsRaw = await getJson('/api/organizations');
    let orgIds = orgsRaw.map((o) => o.uuid || o.id).filter(Boolean);
    const last = (cookie.match(/lastActiveOrg=([0-9a-f-]{36})/) || [])[1];
    if (last) orgIds = [last, ...orgIds.filter((x) => x !== last)];
    let lastErr = null;
    for (const org of orgIds) {
      try {
        const seen = new Map();
        for (let page = 0; page < 300; page++) {
          const arr = await getJson(`/api/organizations/${org}/chat_conversations?limit=100&offset=${page * 100}`);
          if (!Array.isArray(arr) || !arr.length) break;
          let added = 0;
          for (const c of arr) if (c && c.uuid && !seen.has(c.uuid)) { seen.set(c.uuid, c); added++; }
          if (!added || arr.length < 100) break;
        }
        const chats = [...seen.values()].map((c) => ({
          uuid: c.uuid, name: c.name || '(بدون عنوان)', updated_at: c.updated_at, created_at: c.created_at,
          project_uuid: c.project_uuid || (c.project && c.project.uuid) || null, model: c.model,
        })).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        return { org, chats };
      } catch (e) { lastErr = e; }
    }
    throw new Error('فهرست چت‌ها خوانده نشد: ' + (lastErr && lastErr.message));
  }

  // Several chats in one ZIP (or several ZIPs under a size cap) with a searchable index.html.
  // Browsers struggle with ZIPs of hundreds of MB in memory, hence the split.
  async function exportMany(deps) {
    const { fetchFn, origin, org, chats, options = {}, onProgress = () => {}, onPart, maxZipBytes = 450 * 1024 * 1024 } = deps;
    const date = new Date().toISOString().slice(0, 10);
    let zip = makeZip(), part = 1, entries = [], counted = 0, bytes = 0;
    const parts = [], done = [], failed = [];
    const flush = async (final) => {
      if (!entries.length) return;
      if (options.assets) for (const f in options.assets) zip.file('assets/' + f, options.assets[f]);
      zip.file('index.html', RENDER.indexHtml({ entries, brand: options.brand, title: 'Claude backup — ' + date, assetBase: options.assets ? 'assets/' : null }));
      zip.file('index.json', JSON.stringify(entries, null, 2));
      onProgress('در حال فشرده‌سازی ZIP…', { phase: 'bulk-zip', bulk: { current: done.length, total: chats.length } });
      const data = await zip.generate();
      const filename = `Claude-backup_${date}${final && part === 1 ? '' : '_part' + part}.zip`;
      const info = { data, filename, chats: entries.length };
      parts.push({ filename, chats: entries.length, bytes: data.length });
      if (onPart) await onPart(info);
      part++; zip = makeZip(); entries = []; counted = 0; bytes = 0;
    };
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      const bulk = { current: i + 1, total: chats.length, name: chat.name };
      onProgress(`چت ${i + 1} از ${chats.length}: ${chat.name}`, { phase: 'bulk', bulk });
      let res = null, err = null;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try {
          res = await exportChat({
            fetchFn, origin, convId: chat.uuid, shared: { zip, org },
            options: Object.assign({}, options, { sinceMessageUuid: null }),
            onProgress: (t, info) => onProgress(t, Object.assign({}, info || {}, { phase: 'bulk', bulk })),
          });
        } catch (e) { err = e; await new Promise((r) => setTimeout(r, 1200)); }
      }
      if (res) {
        entries.push(Object.assign({ folder: res.meta.rootName }, res.meta));
        done.push({ chat, meta: res.meta });
        for (; counted < zip.entries.length; counted++) bytes += zip.entries[counted].data.length;
        if (bytes > maxZipBytes) await flush(false);
      } else {
        failed.push({ chat, error: err && err.message });
        onProgress(`چت «${chat.name}» ناموفق بود: ${err && err.message}`, { log: true });
      }
      // No pause between chats: Chrome throttles timers in background tabs by up to a minute; just yield to the event loop
      await Promise.resolve();
    }
    await flush(true);
    return { parts, done, failed };
  }

  const PHASES = [['account', 'خواندن اطلاعات حساب'], ['fetch', 'دریافت متن چت'], ['project', 'اطلاعات Project'], ['messages', 'پردازش پیام‌ها و دانلود فایل‌ها'], ['transfer', 'ساخت بسته‌ی انتقال'], ['hash', 'محاسبه‌ی هش فایل‌ها'], ['zip', 'ساخت ZIP']];
  const api = { PHASES, makeZip, listChats, exportMany, exportChat, unzip, sanitize, artifactExt, mimeFromName, redactText, redactPII, estTok, imageDims, isTextName };
  root.CCE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
