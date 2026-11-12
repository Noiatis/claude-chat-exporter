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

  // نام و وزن فونت‌ها و فایل لوگو؛ content.js و core.js هم از همین‌جا می‌خوانند
  const FONT_FILES = [['Ahang-Regular.woff2', 400], ['Ahang-DemiBold.woff2', 600]];
  const LOGO_FILE = 'logo.png';

  // لوگو کنار فونت در assets/ می‌نشیند؛ بدون assetBase صفحه با Tahoma و بدون لوگو ساخته می‌شود
  const logoImg = (assetBase, size) =>
    assetBase ? `<span class="mk" style="width:${size}px;height:${size}px"><img src="${esc(assetBase + LOGO_FILE)}" alt="" width="${size}" height="${size}"></span>` : '';

  const brandName = (brand) => esc((brand && (brand.nameFa || brand.name)) || '');
  const brandLink = (brand, inner) => {
    const u = brand && safeUrl(brand.url);
    return u ? `<a class="brand" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<span class="brand">${inner}</span>`;
  };
  const brandFooter = (brand, assetBase) => {
    if (!brand || !brand.name) return '';
    return `<footer class="ft">${brandLink(brand, `${logoImg(assetBase, 22)}<span>${brandName(brand)}</span>`)}<span>خروجی افزونه‌ی Claude Chat Exporter</span></footer>`;
  };
  // نوار بالای صفحه: لوگو و نام تیم در یک سمت، ابزارها در سمت دیگر
  const masthead = (brand, assetBase, tools) =>
    `<header class="mast"><div class="in">${brand && brand.name ? brandLink(brand, `${logoImg(assetBase, 30)}<span>${brandName(brand)}</span>`) : ''}<span class="sp"></span>${tools}</div></header>`;

  const BASE_CSS = (assetBase) => `
${assetBase ? FONT_FILES.map(([f, w]) => `@font-face{font-family:"Ahang";src:url("${assetBase}${f}") format("woff2");font-weight:${w};font-display:swap}`).join('\n') : ''}
:root{color-scheme:light;--bg:#fff;--soft:#f4f2ee;--fg:#1b1917;--mut:#5c574f;--line:#e3dfd8;--ctl:#85807a;--accT:#b23a06;--acc:#e8590c;--code:#1b1917;--codefg:#f0ede8;--ink:#1b1917}
:root.dark{color-scheme:dark;--bg:#1d1b19;--soft:#2a2724;--fg:#f0ede8;--mut:#b5b0a8;--line:#3a3632;--ctl:#7a756d;--accT:#ff8a3d;--acc:#ff8a3d;--code:#141312;--codefg:#f0ede8;--ink:#141312}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:400 15px/1.9 "Ahang",Tahoma,system-ui,sans-serif}
a{color:var(--accT);text-underline-offset:2px}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.mast{position:sticky;top:0;z-index:5;background:var(--ink);color:#f0ede8;border-bottom:2px solid var(--acc)}
.mast .in{max-width:940px;margin:0 auto;padding:8px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mast .sp{flex:1}
.brand{display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-weight:600}
.brand:hover span:last-child{text-decoration:underline}
.mk{display:inline-flex;flex:none;padding:7%;background:#fff;border-radius:22%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.mk img{width:100%;height:100%;object-fit:contain;display:block}
.mast input[type=search]{flex:1 1 200px;max-width:340px;min-height:34px;padding:2px 10px;border:1px solid #6d675f;border-radius:6px;background:#2a2724;color:#f0ede8;font:inherit;font-size:14px}
.mast input::placeholder{color:#b5b0a8}
.mast label{font-size:13px;color:#d8d3cb;display:flex;gap:5px;align-items:center;white-space:nowrap}
.mast button,.mast select{min-height:34px;border:1px solid #6d675f;background:transparent;color:#f0ede8;border-radius:6px;padding:2px 12px;cursor:pointer;font:inherit;font-size:13px}
.mast select option{color:#1b1917}
.mast button:hover{background:#2a2724}
.wrap{max-width:940px;margin:0 auto;padding:8px 16px 64px}
.hero{padding:28px 0 18px;border-bottom:1px solid var(--line)}
h1.title{font-size:28px;line-height:1.5;font-weight:600;margin:0 0 8px}
.meta{margin:0;color:var(--mut);font-size:13px;display:flex;flex-wrap:wrap;gap:2px 20px}
.meta b{font-weight:600;color:var(--fg)}
.msg{display:grid;grid-template-columns:104px minmax(0,1fr);gap:4px 20px;padding:18px 0;border-bottom:1px solid var(--line)}
.hd{font-size:12.5px;color:var(--mut);line-height:1.7}
.who{display:flex;align-items:center;gap:7px;font-weight:600;color:var(--fg);font-size:13.5px}
.who::before{content:"";width:9px;height:9px;border-radius:2px;border:2px solid var(--fg)}
.msg.Claude .who::before{background:var(--acc);border-color:var(--acc)}
.hd a{color:inherit;text-decoration:none} .hd a:hover{text-decoration:underline}
.bd{overflow-wrap:anywhere;min-width:0}
.msg.Human .bd{background:var(--soft);border-radius:6px;padding:2px 16px}
.bd p{margin:.6em 0} .bd img{max-width:100%;border-radius:6px}
.bd h1,.bd h2,.bd h3{line-height:1.5;font-weight:600}
pre{background:var(--code);color:var(--codefg);padding:12px 14px;border-radius:6px;overflow:auto;font:13px/1.6 ui-monospace,Consolas,monospace;direction:ltr;text-align:left}
code{font-family:ui-monospace,Consolas,monospace;font-size:.92em}
p code,li code,td code{background:var(--soft);border:1px solid var(--line);padding:0 5px;border-radius:4px}
blockquote{margin:.6em 0;padding:0 14px;border-inline-start:1px solid var(--ctl);color:var(--mut)}
.tw{overflow:auto} table{border-collapse:collapse;margin:.6em 0} th,td{border:1px solid var(--line);padding:5px 10px} th{background:var(--soft)}
.chip{display:inline-block;margin:4px 0;padding:2px 10px;border:1px solid var(--ctl);border-radius:6px;font-size:13px;color:var(--fg);text-decoration:none}
.chip:hover{background:var(--soft)}
details.think,details.tool{margin:8px 0;border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-size:13px;color:var(--mut)}
details summary{cursor:pointer}
.note{font-size:13px;color:var(--mut);margin:6px 0}
.src{font-size:13px;color:var(--mut)}
figure{margin:8px 0} figcaption{font-size:12px;color:var(--mut)}
h2.sec{margin:40px 0 8px;font-size:19px;font-weight:600}
.art{margin:8px 0;border:1px solid var(--line);border-radius:6px;padding:4px 12px}
.ft{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;color:var(--mut);font-size:13px}
.ft .brand{color:var(--fg)}
.hide-think .think,.hide-tool .tool{display:none}
.hidden{display:none!important}
.stats{display:flex;flex-wrap:wrap;gap:6px 28px;margin:10px 0 0;color:var(--mut);font-size:13.5px} .stats b{font-size:22px;font-weight:600;color:var(--fg);margin-inline-end:4px}
.tools{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 4px}
.tools input[type=search],.tools select{min-height:36px;padding:2px 10px;border:1px solid var(--ctl);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;font-size:14px}
.tools input[type=search]{flex:1 1 220px}
.row{display:grid;grid-template-columns:minmax(0,1fr) 150px 96px 64px;gap:4px 16px;align-items:baseline;padding:10px 4px;border-bottom:1px solid var(--line);color:var(--fg);text-decoration:none}
.row:hover{background:var(--soft)} .row:hover b{text-decoration:underline}
.row b{font-weight:600;overflow-wrap:anywhere} .row span{color:var(--mut);font-size:13px}
.row.h{color:var(--mut);font-size:12.5px;padding:8px 4px;border-bottom:1px solid var(--ctl)} .row.h:hover{background:none}
.empty{padding:28px 0;color:var(--mut)}
@media (max-width:700px){
  body{font-size:14.5px}.wrap{padding:4px 12px 48px}.mast .in{padding:8px 12px}
  h1.title{font-size:22px}.hero{padding-top:18px}
  .msg{grid-template-columns:1fr;gap:6px;padding:14px 0}.hd{display:flex;gap:12px;align-items:center}
  .mast input[type=search]{flex-basis:100%;max-width:none}
  .row{grid-template-columns:1fr auto}.row .c-p,.row.h{display:none}.row .c-d{grid-column:1}
}
@media print{.mast,.tools{display:none}body{background:#fff;color:#000}.msg{break-inside:avoid}.msg.Human .bd{border:1px solid #ccc;background:none}pre{white-space:pre-wrap}}
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
    const { title, meta = [], views = [], artifacts = [], brand, assetBase } = o;
    const msgs = views.map((v) => `<article class="msg ${v.role}" id="m${v.n}"><div class="hd"><div class="who">${v.role === 'Human' ? 'Human' : 'Claude'}</div><div><a href="#m${v.n}">#${v.n}</a> <time dir="ltr">${esc(v.when || '')}</time></div></div><div class="bd" dir="auto">${renderBlocks(v.blocks)}</div></article>`).join('\n');
    const arts = artifacts.length ? '<h2 class="sec">Artifacts و فایل‌ها (آخرین نسخه)</h2>' + artifacts.map((a) =>
      `<details class="art"><summary><b>${esc(a.title)}</b> <small>${esc(a.path)}</small> · <a href="${relUrl(a.path)}">باز کردن فایل</a></summary>${a.content != null ? `<pre><code>${esc(a.content)}</code></pre>` : '<p class="note">فایل بزرگ است؛ از لینک باز کنید.</p>'}</details>`).join('\n') : '';
    const tools = `<input type="search" id="q" placeholder="جست‌وجو در چت…" aria-label="جست‌وجو">
  <label><input type="checkbox" id="t1" checked> تفکر</label>
  <label><input type="checkbox" id="t2" checked> ابزارها</label>
  <button id="th" type="button">تیره / روشن</button>
  <button id="pr" type="button">چاپ / PDF</button>`;
    return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${BASE_CSS(assetBase)}</style></head>
<body>
${masthead(brand, assetBase, tools)}
<div class="wrap">
  <section class="hero"><h1 class="title" dir="auto">${esc(title)}</h1>
  <p class="meta">${meta.map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join('')}</p></section>
  ${msgs}
  ${arts}
  ${brandFooter(brand, assetBase)}
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
    const { entries = [], brand, title = 'Claude backup', assetBase } = o;
    const msgTotal = entries.reduce((n, e) => n + (e.messages || 0), 0);
    const projects = [...new Set(entries.map((e) => e.project).filter(Boolean))].sort();
    const rows = entries.map((e) => {
      const href = encodeURI(e.folder + '/' + (e.viewer ? 'viewer.html' : 'conversation.md'));
      const date = (e.updated || e.created || '').slice(0, 10);
      return `<a class="row" href="${esc(href)}" data-s="${esc((e.title + ' ' + (e.project || '')).toLowerCase())}" data-d="${esc(e.updated || '')}" data-t="${esc(e.title.toLowerCase())}" data-p="${esc(e.project || '')}" data-m="${e.messages || 0}">
  <b><bdi>${esc(e.title)}</bdi></b><span class="c-p"><bdi>${esc(e.project || '')}</bdi></span><span class="c-d" dir="ltr">${esc(date)}</span><span class="c-m">${e.messages || 0}</span></a>`;
    }).join('\n');
    const tools = `<input type="search" id="q" placeholder="جست‌وجو در عنوان چت‌ها…" aria-label="جست‌وجو">
  <button id="th" type="button">تیره / روشن</button>`;
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${BASE_CSS(assetBase)}</style></head><body>
${masthead(brand, assetBase, tools)}
<div class="wrap"><section class="hero"><h1 class="title">${esc(title)}</h1>
<p class="stats"><span><b>${entries.length}</b>چت</span><span><b>${msgTotal}</b>پیام</span>${projects.length ? `<span><b>${projects.length}</b>پروژه</span>` : ''}</p>
<div class="tools">${projects.length ? `<select id="pj" aria-label="پروژه"><option value="">همه‌ی پروژه‌ها</option>${projects.map((p) => `<option>${esc(p)}</option>`).join('')}</select>` : ''}
<select id="so" aria-label="مرتب‌سازی"><option value="d">تازه‌ترین</option><option value="m">بیشترین پیام</option><option value="t">عنوان</option></select></div></section>
<div class="row h" aria-hidden="true"><span>عنوان</span><span class="c-p">پروژه</span><span>آخرین تغییر</span><span>پیام</span></div>
<div id="ls">${rows}</div>
<p class="empty hidden" id="em">چتی با این فیلتر پیدا نشد.</p>
${brandFooter(brand, assetBase)}</div>
<script>
(function(){var r=document.documentElement,ls=document.getElementById('ls'),cs=[].slice.call(ls.children),q=document.getElementById('q'),pj=document.getElementById('pj'),so=document.getElementById('so');
try{if(localStorage.getItem('cce-dark')==='1'||(localStorage.getItem('cce-dark')===null&&matchMedia('(prefers-color-scheme: dark)').matches))r.classList.add('dark')}catch(e){}
document.getElementById('th').onclick=function(){r.classList.toggle('dark');try{localStorage.setItem('cce-dark',r.classList.contains('dark')?'1':'0')}catch(e){}};
function run(){var s=q.value.trim().toLowerCase(),p=pj?pj.value:'',k=so.value,n=0;
cs.sort(function(a,b){return k==='m'?b.dataset.m-a.dataset.m:k==='t'?a.dataset.t.localeCompare(b.dataset.t):(b.dataset.d||'').localeCompare(a.dataset.d||'')}).forEach(function(c){ls.appendChild(c);var h=(s&&c.dataset.s.indexOf(s)<0)||(p&&c.dataset.p!==p);c.classList.toggle('hidden',!!h);if(!h)n++});
document.getElementById('em').classList.toggle('hidden',n>0)}
q.oninput=run;so.onchange=run;if(pj)pj.onchange=run;run();
})();
</script></body></html>`;
  }

  const api = { FONT_FILES, LOGO_FILE, esc, mdToHtml, viewerHtml, noteMd, indexHtml };
  root.CCE_RENDER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
