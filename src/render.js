/* ساخت viewer.html، note.md و index.html. توابع خالص‌اند و DOM لازم ندارند. */
(function (root) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const relUrl = (p) => esc(encodeURI(String(p)));

  // مارک‌داون کوچک و امن: همه‌چیز اول escape می‌شود و فقط چند الگوی شناخته‌شده تگ می‌گیرد
  function inline(src) {
    let t = esc(src);
    const codes = [];
    t = t.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    t = t.replace(/!\[([^\]]*)\]\(([^:\s)]+)\)/g, '<img alt="$1" src="$2" loading="lazy">');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^:\s)]+)\)/g, (m, txt, url) =>
      `<a href="${url}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${txt}</a>`);
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    t = t.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  }

  function mdToHtml(src) {
    const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const LIST = /^\s*([-*+]|\d+[.)])\s+/;
    const isSep = (l) => l.includes('-') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      let m;
      if ((m = l.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/))) {
        const ch = m[1][0], len = m[1].length, lang = m[2];
        const buf = [];
        i++;
        const close = new RegExp('^\\s*' + (ch === '`' ? '`' : '~') + '{' + len + ',}\\s*$');
        while (i < lines.length && !close.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push(`<pre dir="ltr"><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      if (!l.trim()) { i++; continue; }
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(l)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push(`<blockquote>${mdToHtml(buf.join('\n'))}</blockquote>`);
        continue;
      }
      if (l.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
        const head = cells(l);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="tw"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      if (LIST.test(l)) {
        const ordered = /^\s*\d/.test(l);
        const items = [];
        while (i < lines.length && LIST.test(lines[i])) {
          items.push(lines[i].replace(LIST, ''));
          i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !LIST.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; }
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>` + items.map((x) => `<li>${inline(x)}</li>`).join('') + `</${tag}>`);
        continue;
      }
      const buf = [l];
      i++;
      while (i < lines.length && lines[i].trim() && !/^\s*(`{3,}|~{3,}|#{1,6}\s|>)/.test(lines[i]) && !LIST.test(lines[i])) { buf.push(lines[i]); i++; }
      out.push(`<p>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p>`);
    }
    return out.join('\n');
  }

  const brandFooter = (brand) => {
    if (!brand || !brand.name) return '';
    const nm = esc(brand.nameFa || brand.name);
    const u = safeUrl(brand.url);
    return `<footer class="ft">Claude Chat Exporter · ساخته‌شده توسط ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${nm}</a>` : `<b>${nm}</b>`}</footer>`;
  };

  // نام فایل و وزن فونت‌ها؛ content.js و core.js هم از همین فهرست می‌خوانند
  const FONT_FILES = [['Ahang-Regular.woff2', 400], ['Ahang-DemiBold.woff2', 600]];

  // فونت همراه خروجی می‌آید تا فایل بدون اینترنت هم همان شکل را داشته باشد.
  // اگر مسیر فونت داده نشود، Tahoma و فونت سیستم جایگزین می‌شوند.
  const BASE_CSS = (fontBase) => `
${fontBase ? FONT_FILES.map(([f, w]) => `@font-face{font-family:"Ahang";src:url("${fontBase}${f}") format("woff2");font-weight:${w};font-display:swap}`).join('\n') : ''}
:root{color-scheme:light;--bg:#fff;--soft:#f4f2ee;--fg:#1b1917;--mut:#5c574f;--line:#e3dfd8;--ctl:#85807a;--accT:#b23a06;--acc:#e8590c;--code:#1b1917;--codefg:#f0ede8}
:root.dark{color-scheme:dark;--bg:#1d1b19;--soft:#2a2724;--fg:#f0ede8;--mut:#b5b0a8;--line:#3a3632;--ctl:#7a756d;--accT:#ff8a3d;--acc:#ff8a3d;--code:#141312;--codefg:#f0ede8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:400 15px/1.9 "Ahang",Tahoma,system-ui,sans-serif}
a{color:var(--accT);text-underline-offset:2px}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.wrap{max-width:760px;margin:0 auto;padding:16px 16px 64px}
.top{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 16px}
.top .in{max-width:760px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.top input[type=search]{flex:1;min-width:160px;min-height:34px;padding:4px 10px;border:1px solid var(--ctl);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;font-size:14px}
.top label{font-size:13px;color:var(--mut);display:flex;gap:5px;align-items:center;white-space:nowrap}
.top button{min-height:34px;border:1px solid var(--ctl);background:var(--bg);color:var(--fg);border-radius:6px;padding:2px 12px;cursor:pointer;font:inherit;font-size:13px}
.top button:hover{background:var(--soft)}
h1.title{font-size:24px;line-height:1.5;font-weight:600;margin:24px 0 6px}
.meta{color:var(--mut);font-size:13px;display:flex;flex-wrap:wrap;gap:2px 16px;margin-bottom:12px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.msg{padding:14px 0;border-bottom:1px solid var(--line)}
.msg.Human{background:var(--soft);border-radius:6px;border-bottom:0;padding:12px 14px;margin:14px 0}
.hd{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:var(--mut)}
.who{font-weight:600;color:var(--fg)}
.bd{overflow-wrap:anywhere}
.bd p{margin:.6em 0} .bd img{max-width:100%;border-radius:6px}
pre{background:var(--code);color:var(--codefg);padding:12px 14px;border-radius:6px;overflow:auto;font:13px/1.6 ui-monospace,Consolas,monospace;direction:ltr;text-align:left}
code{font-family:ui-monospace,Consolas,monospace;font-size:.92em}
p code,li code,td code{background:var(--soft);border:1px solid var(--line);padding:0 5px;border-radius:4px}
blockquote{margin:.6em 0;padding:0 14px;border-inline-start:1px solid var(--ctl);color:var(--mut)}
.tw{overflow:auto} table{border-collapse:collapse;margin:.6em 0} th,td{border:1px solid var(--line);padding:5px 10px}
.chip{display:inline-block;margin:4px 0;padding:2px 10px;border:1px solid var(--ctl);border-radius:6px;font-size:13px;color:var(--fg)}
details.think,details.tool{margin:8px 0;border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-size:13px;color:var(--mut)}
details summary{cursor:pointer}
.note{font-size:13px;color:var(--mut);margin:6px 0}
.src{font-size:13px;color:var(--mut)}
figure{margin:8px 0} figcaption{font-size:12px;color:var(--mut)}
h2.sec{margin:36px 0 8px;font-size:18px;font-weight:600}
.art{margin:8px 0;border:1px solid var(--line);border-radius:6px;padding:4px 12px}
.ft{margin-top:44px;text-align:center;color:var(--mut);font-size:13px}
.hide-think .think,.hide-tool .tool{display:none}
.hidden{display:none!important}
@media (max-width:600px){body{font-size:14.5px}.wrap{padding:8px 12px 48px}.top{padding:8px 12px}h1.title{font-size:20px;margin-top:16px}.msg.Human{padding:10px 12px}.top .in{gap:8px}.top input[type=search]{flex-basis:100%}}
@media print{.top{display:none}body{background:#fff;color:#000}.msg{break-inside:avoid}.msg.Human{border:1px solid #ccc}pre{white-space:pre-wrap}}
`;

  function renderBlocks(blocks) {
    return blocks.map((b) => {
      switch (b.t) {
        case 'text': return mdToHtml(b.text);
        case 'think': return `<details class="think"><summary>Thinking</summary>${mdToHtml(b.text)}</details>`;
        case 'artifact': return `<a class="chip" href="${relUrl(b.path)}">${esc(b.title)} <small>(${esc(b.cmd)})</small></a>`;
        case 'file': return `<a class="chip" href="${relUrl(b.path || '#')}">${esc(b.name || b.text)}</a>`;
        case 'attach': return `<a class="chip" href="${relUrl(b.path)}">${esc(b.name)}</a>`;
        case 'image': return `<figure><a href="${relUrl(b.path)}"><img src="${relUrl(b.path)}" alt="${esc(b.name)}" loading="lazy"></a><figcaption>${esc(b.name)}</figcaption></figure>`;
        case 'tool': return `<details class="tool"><summary>ابزار: ${esc(b.name)}</summary><pre>${esc(b.text)}</pre></details>`;
        case 'toolres': return `<details class="tool"><summary>نتیجه‌ی ابزار: ${esc(b.name || 'result')}</summary><pre>${esc(b.text)}</pre></details>`;
        case 'sources': return '<ul class="src">' + b.list.map((s) => { const u = safeUrl(s.url); return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a>` : esc(s.title || s.url)}</li>`; }).join('') + '</ul>';
        case 'note': return `<div class="note">${esc(b.text)}</div>`;
        default: return '';
      }
    }).join('\n');
  }

  function viewerHtml(o) {
    const { title, meta = [], views = [], artifacts = [], brand, fontBase } = o;
    const msgs = views.map((v) => `<article class="msg ${v.role}" id="m${v.n}"><div class="hd"><span class="who">${v.role === 'Human' ? 'Human' : 'Claude'} · #${v.n}</span><time dir="ltr">${esc(v.when || '')}</time></div><div class="bd" dir="auto">${renderBlocks(v.blocks)}</div></article>`).join('\n');
    const arts = artifacts.length ? '<h2 class="sec">Artifacts و فایل‌ها (آخرین نسخه)</h2>' + artifacts.map((a) =>
      `<details class="art"><summary><b>${esc(a.title)}</b> <small>${esc(a.path)}</small> · <a href="${relUrl(a.path)}">باز کردن فایل</a></summary>${a.content != null ? `<pre><code>${esc(a.content)}</code></pre>` : '<p class="note">فایل بزرگ است؛ از لینک باز کنید.</p>'}</details>`).join('\n') : '';
    return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${BASE_CSS(fontBase)}</style></head>
<body>
<div class="top"><div class="in">
  <input type="search" id="q" placeholder="جست‌وجو در چت…" aria-label="جست‌وجو">
  <label><input type="checkbox" id="t1" checked> تفکر</label>
  <label><input type="checkbox" id="t2" checked> ابزارها</label>
  <button id="th" type="button">تیره / روشن</button>
  <button id="pr" type="button">چاپ / PDF</button>
</div></div>
<div class="wrap">
  <h1 class="title" dir="auto">${esc(title)}</h1>
  <div class="meta">${meta.map(([k, v]) => `<span>${esc(k)}: ${esc(v)}</span>`).join('')}</div>
  ${msgs}
  ${arts}
  ${brandFooter(brand)}
</div>
<script>
(function(){
  var r=document.documentElement,q=document.getElementById('q'),ms=[].slice.call(document.querySelectorAll('.msg'));
  try{if(localStorage.getItem('cce-dark')==='1'||(localStorage.getItem('cce-dark')===null&&matchMedia('(prefers-color-scheme: dark)').matches))r.classList.add('dark')}catch(e){}
  document.getElementById('th').onclick=function(){r.classList.toggle('dark');try{localStorage.setItem('cce-dark',r.classList.contains('dark')?'1':'0')}catch(e){}};
  q.oninput=function(){var s=q.value.trim().toLowerCase();ms.forEach(function(m){m.classList.toggle('hidden',!!s&&m.textContent.toLowerCase().indexOf(s)<0)})};
  function tg(){document.body.classList.toggle('hide-think',!document.getElementById('t1').checked);document.body.classList.toggle('hide-tool',!document.getElementById('t2').checked)}
  document.getElementById('t1').onchange=tg;document.getElementById('t2').onchange=tg;
  document.getElementById('pr').onclick=function(){window.print()};
  window.addEventListener('beforeprint',function(){[].forEach.call(document.querySelectorAll('details'),function(d){d.open=true})});
})();
</script></body></html>`;
  }

  // فرمت Obsidian/Notion: frontmatter + لینک نسبی به فایل‌ها
  function noteMd(o) {
    const { title, convId, url, created, updated, model, project, views = [], artifacts = [] } = o;
    const q = (s) => JSON.stringify(String(s == null ? '' : s));
    const L = ['---', `title: ${q(title)}`, `chat_id: ${q(convId)}`, `url: ${q(url)}`];
    if (created) L.push(`created: ${q(created)}`);
    if (updated) L.push(`updated: ${q(updated)}`);
    if (model) L.push(`model: ${q(model)}`);
    if (project) L.push(`project: ${q(project)}`);
    L.push(`messages: ${views.length}`, 'tags: [claude-chat]', 'source: claude.ai', '---', '', `# ${title}`, '');
    const link = (name, p) => `[${String(name).replace(/[\[\]]/g, '')}](${encodeURI(p)})`;
    for (const v of views) {
      L.push(`## ${v.role === 'Human' ? 'Human' : 'Claude'}${v.when ? ' — ' + v.when : ''}`, '');
      for (const b of v.blocks) {
        if (b.t === 'text') L.push(b.text, '');
        else if (b.t === 'artifact') L.push(`> Artifact: ${link(b.title, b.path)}`, '');
        else if (b.t === 'file') L.push(`> ${b.path ? link(b.name || b.text, b.path) : b.text}`, '');
        else if (b.t === 'attach') L.push(`> ${link(b.name, b.path)}`, '');
        else if (b.t === 'image') L.push(`![${b.name}](${encodeURI(b.path)})`, '');
        else if (b.t === 'sources') L.push('**Sources**', ...b.list.map((s) => `- [${(s.title || s.url).replace(/[\[\]]/g, '')}](${s.url})`), '');
      }
    }
    if (artifacts.length) L.push('## Artifacts', '', ...artifacts.map((a) => `- ${link(a.title, a.path)}`), '');
    return L.join('\n');
  }

  // فهرست قابل‌جست‌وجوی پشتیبان کامل
  function indexHtml(o) {
    const { entries = [], brand, title = 'Claude backup', fontBase } = o;
    const rows = entries.map((e) => {
      const href = encodeURI(e.folder + '/' + (e.viewer ? 'viewer.html' : 'conversation.md'));
      return `<a class="card" href="${esc(href)}" data-s="${esc((e.title + ' ' + (e.project || '')).toLowerCase())}" data-d="${esc(e.updated || '')}">
  <b dir="auto">${esc(e.title)}</b>
  <span>${esc((e.updated || e.created || '').slice(0, 10))} · ${e.messages} پیام${e.model ? ' · ' + esc(e.model) : ''}${e.project ? ' · پروژه: ' + esc(e.project) : ''}</span></a>`;
    }).join('\n');
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${BASE_CSS(fontBase)}
.card{display:block;padding:10px 2px;border-bottom:1px solid var(--line);text-decoration:none;color:var(--fg)}
.card:hover b{text-decoration:underline} .card b{font-weight:600} .card span{display:block;color:var(--mut);font-size:13px}
</style></head><body>
<div class="top"><div class="in"><input type="search" id="q" placeholder="جست‌وجو در عنوان چت‌ها…" aria-label="جست‌وجو"><button id="th" type="button">تیره / روشن</button><span style="color:var(--mut);font-size:13px">${entries.length} چت</span></div></div>
<div class="wrap"><h1 class="title">${esc(title)}</h1>
${rows}
${brandFooter(brand)}</div>
<script>
(function(){var r=document.documentElement,cs=[].slice.call(document.querySelectorAll('.card'));
cs.sort(function(a,b){return (b.dataset.d||'').localeCompare(a.dataset.d||'')}).forEach(function(c){c.parentNode.insertBefore(c,document.querySelector('.ft'))});
try{if(localStorage.getItem('cce-dark')==='1'||(localStorage.getItem('cce-dark')===null&&matchMedia('(prefers-color-scheme: dark)').matches))r.classList.add('dark')}catch(e){}
document.getElementById('th').onclick=function(){r.classList.toggle('dark');try{localStorage.setItem('cce-dark',r.classList.contains('dark')?'1':'0')}catch(e){}};
document.getElementById('q').oninput=function(){var s=this.value.trim().toLowerCase();cs.forEach(function(c){c.classList.toggle('hidden',!!s&&c.dataset.s.indexOf(s)<0)})};
})();
</script></body></html>`;
  }

  const api = { FONT_FILES, esc, mdToHtml, viewerHtml, noteMd, indexHtml };
  root.CCE_RENDER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
