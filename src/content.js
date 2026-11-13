(() => {
  // popup ممکن است اسکریپت را دوباره تزریق کند؛ یک نسخه کافی است
  if (window.__cceLoaded) return;
  window.__cceLoaded = true;
  const ext = typeof browser !== 'undefined' ? browser : chrome;
  const B = window.CCE_BRAND;
  let running = false;
  const BATCH = 20; // claude.ai در هر پیام بیشتر از ۲۰ پیوست قبول نمی‌کند

  const DEF = {
    transfer: true, includeProject: true, redact: false, viewer: true, note: false, aiSummary: false, incremental: false,
    includeThinking: true, includeToolOutput: true, allBranches: false, pjclean: true, tokenBudget: 120000,
  };
  const loadOpts = async () => {
    try { const r = await ext.storage.local.get('cce'); return Object.assign({}, DEF, (r && r.cce) || {}); } catch (e) { return Object.assign({}, DEF); }
  };
  const saveOpts = async (o) => { try { await ext.storage.local.set({ cce: o }); } catch (e) {} };
  const getState = async () => {
    try { const r = await ext.storage.local.get('cceState'); return Object.assign({ chats: {} }, (r && r.cceState) || {}); } catch (e) { return { chats: {} }; }
  };
  const putState = async (st) => { try { await ext.storage.local.set({ cceState: st }); } catch (e) {} };
  const brandOpt = () => ({ name: B.name, nameFa: B.nameFa, url: B.url });

  // فونت را یک بار می‌خوانیم؛ هم برای خود پنل، هم برای گذاشتن کنار فایل‌های خروجی.
  // @font-face داخل Shadow DOM در کروم کار نمی‌کند و CSP سایت هم ممکن است جلویش را بگیرد،
  // پس از FontFace API روی document استفاده می‌کنیم.
  // کاربر روی هر صفحه‌ی claude.ai همین اسکریپت را دارد، پس فونت فقط وقتی لازم شد (باز شدن پنل یا خروجی) بارگیری می‌شود.
  // همین بایت‌ها همراه لوگو در خروجی‌ها هم گذاشته می‌شوند (assets/).
  let assets = null, assetsPromise = null;
  const bytesOf = async (path) => new Uint8Array(await (await fetch(ext.runtime.getURL(path))).arrayBuffer());
  const ensureFonts = () => assetsPromise || (assetsPromise = (async () => {
    try {
      const files = CCE_RENDER.FONT_FILES;
      const bytes = await Promise.all(files.map(([file]) => bytesOf('fonts/' + file)));
      const out = Object.fromEntries(files.map(([file], i) => [file, bytes[i]]));
      out[CCE_RENDER.LOGO_FILE] = await bytesOf('icons/logo.png');
      assets = out;
      await Promise.all(files.map(([, weight], i) => new FontFace('Vazirmatn CCE', bytes[i].slice().buffer, { weight: String(weight) }).load().then((f) => document.fonts.add(f))));
    } catch (e) { /* بدون فونت و لوگو هم کار می‌کند؛ Tahoma جایگزین می‌شود */ }
  })());
  const currentChatId = () => ((location.pathname.match(/\/chat\/([0-9a-f-]{36})/i) || [])[1]) || null;

  // متنِ نیمه‌پررنگ را بدون innerHTML می‌سازد (AMO هر innerHTML را رد می‌کند)
  const rich = (el, parts) => {
    el.textContent = '';
    for (const p of parts) {
      if (typeof p === 'string') el.appendChild(document.createTextNode(p));
      else { const b = document.createElement('b'); b.textContent = String(p.b); el.appendChild(b); }
    }
  };

  // پنل داخل Shadow DOM است تا CSS خود claude.ai به آن نریزد و برعکس
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;bottom:16px;left:16px;z-index:2147483647';
  const sh = host.attachShadow({ mode: 'open' });
  const SW = (k, label) => `<label class="sw"><span>${label}</span><input type="checkbox" data-k="${k}"><i></i></label>`;
  const TEMPLATE = `
<style>
  :host{all:initial}
  *{box-sizing:border-box}
  .wrap{--bg:#ffffff;--soft:#f4f2ee;--fg:#1b1917;--mut:#5c574f;--line:#e3dfd8;--ctl:#85807a;--accT:#b23a06;--acc:#e8590c;--err:#b3261e;
    font:400 13px/1.7 "Vazirmatn CCE",Tahoma,system-ui,sans-serif;color:var(--fg);direction:rtl;text-align:right;position:relative}
  .wrap.dark{--bg:#1d1b19;--soft:#2a2724;--fg:#f0ede8;--mut:#b5b0a8;--line:#3a3632;--ctl:#7a756d;--accT:#ff8a3d;--acc:#ff8a3d;--err:#ff8a80}
  button{font:inherit;cursor:pointer;color:inherit}
  button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible,.sw input:focus-visible + i{outline:2px solid var(--acc);outline-offset:2px}
  .fab{-webkit-user-drag:none;user-select:none;width:46px;height:46px;border-radius:50%;border:0;padding:0;touch-action:none;cursor:grab;background:var(--bg);box-shadow:0 2px 10px rgba(0,0,0,.3);display:grid;place-items:center;position:relative}
  .fab .ring{position:absolute;inset:-3px;border-radius:50%;border:3px solid transparent;pointer-events:none}
  .busy .fab .ring{border-color:var(--acc);border-top-color:transparent;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .card{position:absolute;bottom:58px;left:0;width:min(384px,calc(100vw - 32px));max-height:calc(100vh - 90px);overflow:auto;scrollbar-width:thin;background:var(--bg);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28)}
  .card[hidden]{display:none}
  .right .card{left:auto;right:0}
  .top .card{bottom:auto;top:52px}
  .fab.drag{cursor:grabbing}
  header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
  header .t{flex:1;min-width:0} header b{display:block;font-size:15px;font-weight:600;line-height:1.3} header small{color:var(--mut);font-size:12px}
  .x{border:0;background:none;color:var(--mut);font-size:22px;line-height:1;min-width:32px;min-height:32px;border-radius:6px} .x:hover{background:var(--soft)}
  .tabs{display:flex;gap:4px;padding:6px 12px 0;border-bottom:1px solid var(--line)}
  .tab{flex:1;min-height:34px;border:0;background:none;padding:6px 4px;color:var(--mut);font-weight:600;border-bottom:2px solid transparent}
  .tab.on{color:var(--fg);border-bottom-color:var(--acc)}
  .body{padding:14px 16px}
  .btn{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:6px;min-height:40px;padding:8px 14px;font-size:14px;font-weight:600;border:1px solid transparent}
  .btn svg{width:18px;height:18px;flex:none}
  .primary{background:var(--fg);color:var(--bg)}
  .secondary{background:var(--bg);border-color:var(--ctl);color:var(--fg)} .secondary:hover{background:var(--soft)}
  .btn:disabled{opacity:.55;cursor:default}
  .opts{margin:10px 0 2px;display:flex;flex-direction:column}
  .sw{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:32px;cursor:pointer}
  .sw span{font-size:13px} .sw input{position:absolute;opacity:0;pointer-events:none}
  .sw i{width:34px;height:20px;border-radius:20px;border:1.5px solid var(--ctl);position:relative;flex:none}
  .sw i::after{content:"";position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:var(--ctl)}
  .sw input:checked + i{background:var(--acc);border-color:var(--acc)}
  .sw input:checked + i::after{background:#1b1917;transform:translateX(-14px)}
  details.more{margin-top:2px} details.more summary{cursor:pointer;color:var(--mut);font-size:12px;padding:6px 2px}
.note{margin:12px 0 0;padding:10px 12px;background:var(--soft);border-radius:10px}
  .note p{margin:0;font-size:12px;line-height:1.8;color:var(--mut)} .note p+p{margin-top:6px}
  .tools{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 8px}
  .tools button{border:0;background:none;color:var(--accT);font:inherit;font-size:12px;min-height:28px;padding:2px 6px;border-radius:6px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
  .tools button:hover{background:var(--soft)}
.pane{border:1px solid var(--line);border-radius:10px;padding:12px;margin:0 0 10px}
  .pane h3{margin:0 0 4px;font-size:13px;font-weight:600}
  .pane p{margin:0 0 6px;font-size:12px;line-height:1.8;color:var(--mut)} .pane .ex{color:var(--fg);opacity:.8}
  .pane .btn{margin-top:4px} .pane .fine{margin:6px 0 0}
  .hint{margin:10px 0 0;color:var(--mut);font-size:12px}
  .msg{margin-top:10px;font-size:12px;color:var(--mut);white-space:pre-line;word-break:break-word} .msg.err{color:var(--err)}
  .chips{display:flex;gap:4px;flex-wrap:wrap;margin:10px 0 8px}
  .chip{border:1px solid var(--ctl);background:var(--bg);border-radius:6px;min-height:28px;padding:2px 10px;font-size:12px}
  .chip.on{background:var(--fg);border-color:var(--fg);color:var(--bg)}
  .search{width:100%;min-height:32px;padding:5px 10px;border:1px solid var(--ctl);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;margin-bottom:8px}
  .list{max-height:min(210px,30vh);overflow:auto;scrollbar-width:thin;border:1px solid var(--line);border-radius:6px}
  .row{display:flex;gap:9px;align-items:flex-start;padding:6px 10px;border-bottom:1px solid var(--line);cursor:pointer}
  .row:last-child{border-bottom:0} .row:hover{background:var(--soft)}
  .row input{margin-top:6px;accent-color:var(--acc)}
  .row b{display:block;font-weight:600;font-size:13px;line-height:1.55;word-break:break-word}
  .row small{color:var(--mut);font-size:12px}
  .badge{display:inline-block;border:1px solid var(--accT);color:var(--accT);border-radius:4px;padding:0 5px;font-size:11px;font-weight:600;margin-inline-start:6px}
  .cnt{margin:8px 2px;color:var(--mut);font-size:12px}
  .steps{display:flex;flex-direction:column;gap:6px;margin:2px 0 12px}
  .step{display:flex;align-items:center;gap:10px;color:var(--mut)}
  .step .ic{width:18px;height:18px;flex:none;display:grid;place-items:center;border-radius:50%;font-size:11px;font-weight:700;border:2px solid var(--line)}
  .step.active{color:var(--fg);font-weight:600} .step.active .ic{border-color:var(--acc);border-top-color:transparent;animation:spin .9s linear infinite}
  .step.done{color:var(--fg)} .step.done .ic{background:var(--fg);border-color:var(--fg);color:var(--bg)} .step.done .ic::before{content:"✓"}
  .step.skipped .ic{border-style:dashed;border-color:var(--ctl)} .step.skipped .lb::after{content:" (رد شد)";font-size:12px}
  .step.fail{color:var(--err);font-weight:600} .step.fail .ic{background:var(--err);border-color:var(--err);color:var(--bg);animation:none} .step.fail .ic::before{content:"✕"}
  .track{height:6px;background:var(--line);border-radius:3px;overflow:hidden}
  .bar{height:100%;width:0;background:var(--acc)} .bar.ok{background:var(--fg)} .bar.err{background:var(--err)}
  .stat{margin-top:6px;font-size:12px;color:var(--mut)} .stat b{color:var(--fg)}
  .act{margin-top:4px;font-size:12px;color:var(--mut);word-break:break-word;min-height:18px}
  .warns{display:none;margin-top:8px;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font-size:12px;white-space:pre-line;max-height:120px;overflow:auto}
  .sum{display:none;margin-top:10px;padding:10px 12px;border-radius:6px;background:var(--soft);font-size:13px;white-space:pre-line} .sum.err{color:var(--err)}
  .back{margin-top:10px}
  footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;border-top:1px solid var(--line);color:var(--mut);font-size:12px}
  footer .by{display:flex;align-items:center;gap:7px} footer a{color:var(--accT);text-decoration:underline}
  footer span.n{font-weight:600;color:var(--fg)}
  [hidden]{display:none!important}
  @media (prefers-reduced-motion:reduce){.busy .fab .ring,.step.active .ic{animation:none}.step.active .ic{border-top-color:var(--acc)}}
  @media (prefers-reduced-motion:no-preference){.sw i::after{transition:transform .12s}}
</style>
<div class="wrap">
  <button class="fab" title="Claude Chat Exporter (برای جابه‌جایی بکشید)" aria-label="Claude Chat Exporter"><span class="ring"></span></button>
  <section class="card" hidden>
    <header><span id="hmark"></span><div class="t"><b>Claude Chat Exporter</b><small id="sub"></small></div><button class="x" title="بستن" aria-label="بستن">×</button></header>
    <div class="tabs" id="tabs">
      <button class="tab on" data-tab="single">این چت</button>
      <button class="tab" data-tab="bulk">همه‌ی چت‌ها</button>
      <button class="tab" data-tab="import">ورود</button>
    </div>
    <div class="body">
      <div id="v-single">
        <button class="btn primary" id="exp">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg><span>دریافت ZIP از این چت</span></button>
        <div class="opts">
          ${SW('transfer', 'بسته‌ی انتقال به اکانت دیگر')}
          ${SW('viewer', 'مرورگر آفلاین HTML (قابل چاپ/PDF)')}
          <label class="sw"><span id="incl">فقط پیام‌های جدید از آخرین خروجی</span><input type="checkbox" data-k="incremental"><i></i></label>
        </div>
        <details class="more"><summary>گزینه‌های بیشتر</summary><div class="opts">
          ${SW('includeProject', 'شامل دستورالعمل و فایل‌های Project')}
          ${SW('note', 'فرمت Obsidian / Notion (فایل .md با frontmatter)')}
          ${SW('aiSummary', 'درخواست «خلاصه‌ی پروژه» از Claude در چت جدید')}
          ${SW('redact', 'پاک‌سازی کلید و توکن‌ها')}
        </div></details>
        <div class="msg" id="msg1"></div>
      </div>
      <div id="v-bulk" hidden>
        <button class="btn secondary" id="load">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg><span id="loadl">بارگیری فهرست چت‌ها</span></button>
        <div id="bulkbox" hidden>
          <div class="chips" id="chips">
            <button class="chip on" data-sc="all">همه</button>
            <button class="chip" data-sc="project" id="scproj">این Project</button>
            <button class="chip" data-sc="changed">جدید / تغییرکرده</button>
            <button class="chip" data-sc="none">هیچ‌کدام</button>
          </div>
          <input class="search" id="bsearch" placeholder="جست‌وجو در عنوان…">
          <div class="tools"><button id="selshown">انتخاب همین فهرست</button><button id="unshown">برداشتن همین فهرست</button><button id="invshown">معکوس</button></div>
          <div class="list" id="blist"></div>
          <div class="cnt" id="bcnt"></div>
          <button class="btn primary" id="bgo"><span id="bgol">پشتیبان‌گیری</span></button>
        </div>
        <div class="note">
          <p>هر چت یک پوشه‌ی جدا با index.html قابل‌جست‌وجو می‌گیرد. اگر حجم زیاد شود، خروجی به چند ZIP تقسیم می‌شود.</p>
          <p>تا پایان کار تب را نبندید. اگر تب در پس‌زمینه باشد، کار ادامه دارد ولی کندتر می‌شود.</p>
          <p>پشتیبان‌گیری خودکار را از آیکون افزونه در نوار ابزار تنظیم کنید.</p>
        </div>
        <div class="msg" id="msg2"></div>
      </div>
      <div id="v-import" hidden>
        <section class="pane">
          <h3>ادامه‌ی یک چت قبلی</h3>
          <p>ZIP انتقالی که قبلاً از «این چت» گرفته‌اید. گفتگو و فایل‌هایش در چت جدید ادامه پیدا می‌کند.</p>
          <p class="ex">مثلاً: چت اکانت قدیمی را در اکانت جدید ادامه می‌دهم.</p>
          <button class="btn secondary" id="imp">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 21h14"/></svg><span id="impl">انتخاب ZIP انتقال</span></button>
          <div class="msg" id="msg3"></div>
        </section>
        <section class="pane">
          <h3>فرستادن پوشه‌ی پروژه به Claude</h3>
          <p>پوشه‌ی کدها و فایل‌های شما یک‌جا فشرده می‌شود و در همین چت پیوست می‌شود. فایل‌های اصلی تغییر نمی‌کنند.</p>
          <p class="ex">مثلاً: می‌خواهم Claude پروژه‌ی <bdi dir="ltr">my-app</bdi> را ببیند.</p>
          <button class="btn secondary" id="pj">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span id="pjl">انتخاب پوشه</span></button>
          <div class="opts">${SW('pjclean', 'حذف پوشه‌های قابل‌بازسازی (مثل node_modules)')}</div>
          <p class="fine">بالای ۳۰ مگابایت، چند ZIP مستقل ساخته می‌شود.</p>
          <div class="msg" id="msg4"></div>
          <button class="btn secondary" id="pjdl" hidden>دانلود ZIP ساخته‌شده</button>
        </section>
      </div>
      <div id="prog" hidden>
        <div class="steps" id="steps"></div>
        <div class="track"><div class="bar" id="bar"></div></div>
        <div class="stat" id="barl"></div>
        <div class="stat" id="filel"></div>
        <div class="act" id="act"></div>
        <div class="warns" id="warns"></div>
        <div class="sum" id="sum"></div>
        <button class="btn secondary back" id="back" hidden>بازگشت</button>
      </div>
    </div>
    <footer><div class="by"><span id="fmark"></span><span>ساخته‌شده توسط <span class="n" id="fname"></span></span></div><span id="flink"></span></footer>
  </section>
</div>`;
  {
    const doc = new DOMParser().parseFromString('<!doctype html><html><body>' + TEMPLATE + '</body></html>', 'text/html');
    const nodes = [...doc.body.childNodes];
    nodes.forEach((n) => sh.appendChild(document.importNode(n, true)));
  }
  const $ = (s) => sh.querySelector(s);
  const wrap = $('.wrap'), card = $('.card');
  $('.fab').prepend(B.mark(30));
  $('#hmark').replaceWith(B.mark(36));
  $('#fmark').replaceWith(B.mark(18));
  $('#sub').textContent = `${B.name} · نسخه ${B.version}`;
  $('#fname').textContent = B.nameFa || B.name;
  $('#flink').appendChild(B.link('noiatis.ir'));

  const isDark = () => {
    try {
      const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
      if (!m) return false;
      const [r, g, b] = m.map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) < 110;
    } catch (e) { return false; }
  };
  // جای دکمه‌ی گرد: کاربر می‌کشد و هر جا رها کند، به نزدیک‌ترین لبه (چپ یا راست) می‌چسبد.
  // ممکن است روی محتوای خود سایت بیفتد، برای همین جایش ذخیره می‌شود و کارت پنل هم به سمتی باز می‌شود که جا دارد.
  let pos = { side: 'left', bottom: 16 };
  const applyPos = () => {
    host.style.left = pos.side === 'left' ? '16px' : 'auto';
    host.style.right = pos.side === 'right' ? '16px' : 'auto';
    host.style.bottom = pos.bottom + 'px';
    const top = pos.bottom > window.innerHeight / 2;
    wrap.classList.toggle('right', pos.side === 'right');
    wrap.classList.toggle('top', top);
    card.style.maxHeight = (top ? pos.bottom - 16 : window.innerHeight - pos.bottom - 70) + 'px';
  };
  (async () => {
    try {
      const r = await ext.storage.local.get('ccePos');
      if (r && r.ccePos && (r.ccePos.side === 'left' || r.ccePos.side === 'right')) pos = { side: r.ccePos.side, bottom: Math.max(8, Number(r.ccePos.bottom) || 16) };
    } catch (e) { /* همان جای پیش‌فرض */ }
    applyPos();
  })();
  window.addEventListener('resize', () => { pos.bottom = Math.min(pos.bottom, Math.max(8, window.innerHeight - 54)); applyPos(); });

  const fab = $('.fab');
  let dragFrom = null, dragged = false;
  fab.addEventListener('dragstart', (e) => e.preventDefault());
  fab.addEventListener('pointerdown', (e) => { if (e.button > 0) return; dragFrom = { x: e.clientX, y: e.clientY }; dragged = false; try { fab.setPointerCapture(e.pointerId); } catch (err) { /* بدون capture هم کار می‌کند */ } });
  fab.addEventListener('pointermove', (e) => {
    if (!dragFrom) return;
    if (!dragged && Math.hypot(e.clientX - dragFrom.x, e.clientY - dragFrom.y) < 6) return; // کلیک معمولی را نشکنیم
    dragged = true;
    fab.classList.add('drag');
    pos = { side: e.clientX < window.innerWidth / 2 ? 'left' : 'right', bottom: Math.min(Math.max(8, window.innerHeight - e.clientY - 23), window.innerHeight - 54) };
    applyPos();
  });
  const endDrag = () => {
    if (!dragFrom) return;
    dragFrom = null;
    fab.classList.remove('drag');
    if (dragged) { try { ext.storage.local.set({ ccePos: pos }); } catch (e) { /* ذخیره نشد؛ فقط تا رفرش می‌ماند */ } }
  };
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);

  const openCard = (v) => { wrap.classList.toggle('dark', isDark()); card.hidden = v === false; if (v !== false) { ensureFonts(); refreshSingle(); } };
  fab.onclick = () => { if (dragged) { dragged = false; return; } openCard(card.hidden); };
  $('.x').onclick = () => openCard(false);

  const VIEWS = ['single', 'bulk', 'import'];
  const show = (name) => {
    VIEWS.forEach((v) => { $('#v-' + v).hidden = v !== name; });
    $('#prog').hidden = name !== 'prog';
    $('#tabs').hidden = name === 'prog';
    sh.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  };
  sh.querySelectorAll('.tab').forEach((t) => (t.onclick = () => show(t.dataset.tab)));
  const setMsg = (id, t, err) => { const m = $(id); m.textContent = t || ''; m.className = 'msg' + (err ? ' err' : ''); };

  // گزینه‌ها یادشان می‌ماند
  (async () => {
    const o = await loadOpts();
    sh.querySelectorAll('.sw input').forEach((i) => {
      i.checked = !!o[i.dataset.k];
      i.onchange = async () => { const cur = await loadOpts(); cur[i.dataset.k] = i.checked; await saveOpts(cur); };
    });
  })();
  async function refreshSingle() {
    const id = currentChatId();
    const st = await getState();
    const e = id && st.chats[id];
    $('#incl').textContent = e && e.exportedAt ? `فقط پیام‌های جدید (آخرین خروجی: ${new Date(e.exportedAt).toLocaleDateString('fa-IR')})` : 'فقط پیام‌های جدید از آخرین خروجی';
  }

  const STEPS = {};
  const PP = (() => {
    let active = null;
    const setState = (k, st) => { const r = STEPS[k]; if (r) r.className = 'step ' + st; };
    function reset(bulk) {
      const box = $('#steps'); box.textContent = '';
      for (const k in STEPS) delete STEPS[k];
      if (!bulk) {
        for (const [key, label] of CCE.PHASES) {
          const d = document.createElement('div'); d.className = 'step';
          const ic = document.createElement('span'); ic.className = 'ic';
          const lb = document.createElement('span'); lb.className = 'lb'; lb.textContent = label;
          d.append(ic, lb);
          box.appendChild(d); STEPS[key] = d;
        }
      }
      box.hidden = !!bulk;
      active = null;
      $('#bar').style.width = '0'; $('#bar').className = 'bar';
      $('#barl').textContent = ''; $('#filel').textContent = ''; $('#act').textContent = '';
      const w = $('#warns'); w.style.display = 'none'; w.textContent = '';
      const s = $('#sum'); s.style.display = 'none'; s.textContent = ''; s.className = 'sum';
      $('#back').hidden = true;
      wrap.classList.add('busy');
      show('prog'); openCard(true);
    }
    function update(text, info) {
      if (info.log) {
        const w = $('#warns'); w.style.display = 'block';
        w.textContent += (w.textContent ? '\n' : '') + '– ' + text;
        w.scrollTop = w.scrollHeight;
        return;
      }
      if (info.phase === 'done') return;
      if (info.bulk) {
        const b = info.bulk;
        let inner = 0;
        if (info.phase === 'bulk' && info.total) inner = (info.current || 0) / info.total;
        const pct = Math.min(100, Math.round(((b.current - 1 + inner) / b.total) * 100));
        $('#bar').style.width = pct + '%';
        rich($('#barl'), ['چت ', { b: b.current }, ' از ', { b: b.total }, ` (${pct}٪) — ${(b.name || '').slice(0, 40)}`]);
        $('#act').textContent = text;
        return;
      }
      if (info.phase && STEPS[info.phase] && active !== info.phase) {
        if (active) setState(active, 'done');
        active = info.phase; setState(active, 'active');
      }
      if (info.total) {
        const pct = Math.round(((info.current || 0) / info.total) * 100);
        $('#bar').style.width = pct + '%';
        rich($('#barl'), [(info.phase === 'hash' ? 'فایل ' : 'پیام '), { b: info.current || 0 }, ' از ', { b: info.total }, ` (${pct}٪)`]);
      } else if (info.phase && info.phase !== 'messages') {
        $('#bar').style.width = '100%';
      }
      if (info.files) {
        rich($('#filel'), ['فایل‌ها ', { b: `${info.files.done}/${info.files.total}` }, ' · آرتیفکت‌ها ', { b: info.artifacts || 0 }, ' · ساخته‌شده ', { b: info.genFiles || 0 }]);
      }
      $('#act').textContent = text;
    }
    function finish(ok, lines) {
      wrap.classList.remove('busy');
      if (ok) {
        if (active) setState(active, 'done');
        for (const k in STEPS) if (STEPS[k].className === 'step') STEPS[k].className = 'step skipped';
        $('#bar').style.width = '100%'; $('#bar').className = 'bar ok';
        $('#barl').textContent = 'همه‌ی مراحل کامل شد'; $('#act').textContent = '';
      } else {
        if (active && STEPS[active]) STEPS[active].className = 'step fail';
        $('#bar').className = 'bar err';
      }
      const s = $('#sum'); s.style.display = 'block'; s.className = 'sum' + (ok ? '' : ' err');
      s.textContent = lines.join('\n');
      $('#back').hidden = false;
    }
    return { reset, update, finish };
  })();
  $('#back').onclick = () => show('single');

  const notify = (text, info) => {
    try { const p = ext.runtime.sendMessage({ type: 'progress', text, info }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    PP.update(text, info || {});
  };

  // در فایرفاکس دانلود از پس‌زمینه انجام می‌شود؛ اگر نشد (یا در کروم) از لینک موقتِ خود صفحه استفاده می‌کنیم
  async function deliver(data, filename) {
    let done = false;
    // فایرفاکس بایت‌ها را درست به پس‌زمینه می‌فرستد؛ کروم پیام را JSON می‌کند و برای ZIP صدها مگابایتی
    // «Could not serialize message» می‌دهد، پس آنجا مستقیم از خود صفحه دانلود می‌کنیم.
    const isFirefox = typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo === 'function';
    if (isFirefox && alive()) {
      try {
        const r = await browser.runtime.sendMessage({ type: 'download', data, filename });
        done = !!(r && r.ok);
        if (!done) console.warn('[CCE] background download failed', r);
      } catch (e) { console.warn('[CCE] background download error', e); }
    }
    if (!done) {
      const blob = new Blob([data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
  // اسم فایل لاتین وسط جمله‌ی فارسی جابه‌جا نمایش داده می‌شد؛ با ایزوله‌ی چپ‌به‌راست درستش می‌کنیم
  const LRI = (s) => '⁦' + s + '⁩';

  // وقتی افزونه به‌روز یا reload می‌شود، تب‌های باز کپی قدیمی اسکریپت را نگه می‌دارند و
  // هر تماس با افزونه خطای «Extension context invalidated» می‌دهد. با رفرش صفحه حل می‌شود.
  const alive = () => { try { return !!(ext.runtime && ext.runtime.id); } catch (e) { return false; } };
  const STALE = 'افزونه به‌روز شده است. این صفحه‌ی claude.ai را یک‌بار رفرش کنید (F5) و دوباره امتحان کنید.';

  // کروم تبِ پس‌زمینه را کند یا حتی منجمد می‌کند (Memory Saver). نگه داشتن یک Web Lock در طول کار جلوی منجمد شدن را می‌گیرد.
  const keepAwake = (fn) => (navigator.locks ? navigator.locks.request('cce-running', fn) : fn());

  const run = (options) => keepAwake(() => runChat(options));
  async function runChat(options) {
    if (!alive()) throw new Error(STALE);
    if (running) throw new Error('در حال اجرا…');
    running = true;
    PP.reset(false);
    try {
      await ensureFonts();
      const opts = Object.assign({}, options, { brand: brandOpt(), assets });
      const id = currentChatId();
      const st = await getState();
      if (opts.incremental && id && st.chats[id] && st.chats[id].lastMsg) opts.sinceMessageUuid = st.chats[id].lastMsg;
      let res;
      try {
        res = await CCE.exportChat({ fetchFn: (u, o) => fetch(u, o), origin: location.origin, pathname: location.pathname, cookie: document.cookie, onProgress: notify, options: opts });
      } catch (e) {
        if (e.message === 'NOTHING_NEW') {
          PP.finish(true, ['چیز جدیدی از آخرین خروجی همین چت نیست.']);
          return { filename: '', report: [] };
        }
        throw e;
      }
      await deliver(res.data, res.filename);
      if (id) {
        st.chats[id] = { lastMsg: res.lastMessageUuid, updatedAt: res.updatedAt, exportedAt: Date.now(), title: res.meta.title };
        await putState(st);
      }
      const c = res.counts || {};
      PP.finish(true, [
        'دانلود شد: ' + LRI(res.filename),
        `پیام‌ها ${c.messages} · فایل‌ها ${c.files} · آرتیفکت‌ها ${c.artifacts} · ساخته‌شده ${c.genFiles}`,
        res.stats && res.stats.parts ? `بسته‌ی انتقال: ${res.stats.parts} بخش متن، حدود ${res.stats.estTokens} توکن` : '',
        res.meta.partial ? 'فقط پیام‌های جدید از آخرین خروجی گرفته شد.' : '',
      ].filter(Boolean));
      return { filename: res.filename, report: res.report };
    } catch (e) {
      PP.finish(false, [e.message === 'NOT_A_CHAT' ? 'اول یک چت را باز کنید (آدرس /chat/…).' : e.message]);
      throw e;
    } finally {
      running = false;
    }
  }
  $('#exp').onclick = async () => { try { await run(await loadOpts()); } catch (e) { setMsg('#msg1', e.message, true); } };

  let listing = null; // {org, chats}
  const sel = new Set();
  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('fa-IR'); } catch (e) { return ''; } };
  let curProject = null;
  let shownIds = [];
  let lastIdx = -1;

  const isChanged = (c, st) => { const e = st.chats[c.uuid]; return !e || e.updatedAt !== c.updated_at; };

  async function renderList() {
    const st = await getState();
    const q = $('#bsearch').value.trim().toLowerCase();
    const box = $('#blist'); box.textContent = '';
    const frag = document.createDocumentFragment();
    const shown = listing.chats.filter((c) => !q || c.name.toLowerCase().includes(q));
    shownIds = shown.map((c) => c.uuid);
    for (const c of shown) {
      const r = document.createElement('label'); r.className = 'row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel.has(c.uuid);
      // Shift+کلیک: همه‌ی چت‌های بین این و آخرین کلیک را هم‌حالت می‌کند
      cb.onclick = (ev) => {
        const i = shownIds.indexOf(c.uuid);
        if (ev.shiftKey && lastIdx >= 0) {
          const [a, z] = [Math.min(i, lastIdx), Math.max(i, lastIdx)];
          for (let k = a; k <= z; k++) cb.checked ? sel.add(shownIds[k]) : sel.delete(shownIds[k]);
          renderList(); return;
        }
        lastIdx = i;
      };
      cb.onchange = () => { cb.checked ? sel.add(c.uuid) : sel.delete(c.uuid); updCount(); };
      const d = document.createElement('div');
      const b = document.createElement('b'); b.textContent = c.name; b.dir = 'auto';
      if (isChanged(c, st)) { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = st.chats[c.uuid] ? 'تغییرکرده' : 'جدید'; b.appendChild(bd); }
      const sm = document.createElement('small'); sm.textContent = fmtDate(c.updated_at);
      d.append(b, sm); r.append(cb, d); frag.appendChild(r);
    }
    box.appendChild(frag);
    updCount();
  }
  function updCount() { $('#bcnt').textContent = `${sel.size} از ${listing.chats.length} چت انتخاب شده`; $('#bgol').textContent = `پشتیبان‌گیری از ${sel.size} چت`; $('#bgo').disabled = !sel.size; }
  async function applyScope(sc) {
    sh.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x.dataset.sc === sc));
    const st = await getState();
    sel.clear();
    for (const c of listing.chats) {
      if (sc === 'all' || (sc === 'project' && curProject && c.project_uuid === curProject) || (sc === 'changed' && isChanged(c, st))) sel.add(c.uuid);
    }
    await renderList();
  }
  sh.querySelectorAll('.chip').forEach((x) => (x.onclick = () => applyScope(x.dataset.sc)));
  // انتخاب دسته‌ای روی همان چیزی که الان در فهرست دیده می‌شود (بعد از جست‌وجو)
  $('#selshown').onclick = () => { shownIds.forEach((id) => sel.add(id)); renderList(); };
  $('#unshown').onclick = () => { shownIds.forEach((id) => sel.delete(id)); renderList(); };
  $('#invshown').onclick = () => { shownIds.forEach((id) => (sel.has(id) ? sel.delete(id) : sel.add(id))); renderList(); };
  // فهرست ممکن است هزاران چت داشته باشد؛ با هر کلید دوباره نمی‌کشیمش
  let searchTimer = 0;
  $('#bsearch').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderList, 150); };

  $('#load').onclick = async () => {
    try {
      setMsg('#msg2', 'در حال خواندن فهرست چت‌ها…');
      listing = await CCE.listChats({ fetchFn: (u, o) => fetch(u, o), origin: location.origin, cookie: document.cookie });
      const pm = location.pathname.match(/\/project\/([0-9a-f-]{36})/i);
      const cur = currentChatId();
      curProject = pm ? pm[1] : (cur && (listing.chats.find((c) => c.uuid === cur) || {}).project_uuid) || null;
      $('#scproj').hidden = !curProject;
      $('#bulkbox').hidden = false;
      $('#loadl').textContent = 'بارگیری دوباره‌ی فهرست';
      setMsg('#msg2', `${listing.chats.length} چت پیدا شد.`);
      await applyScope('all');
    } catch (e) { setMsg('#msg2', e.message, true); }
  };

  const runBulk = (chats, options, opt2 = {}) => keepAwake(() => runMany(chats, options, opt2));
  async function runMany(chats, options, opt2 = {}) {
    if (!alive()) throw new Error(STALE);
    if (running) throw new Error('در حال اجرا…');
    running = true;
    PP.reset(true);
    try {
      await ensureFonts();
      const o = Object.assign({}, options, { brand: brandOpt(), assets });
      const parts = [];
      const out = await CCE.exportMany({
        fetchFn: (u, x) => fetch(u, x), origin: location.origin, org: opt2.org || listing.org, chats, options: o, onProgress: notify,
        onPart: async (p) => { await deliver(p.data, p.filename); parts.push(p.filename); },
      });
      const st = await getState();
      for (const d of out.done) st.chats[d.chat.uuid] = { lastMsg: d.meta.lastMessageUuid, updatedAt: d.chat.updated_at, exportedAt: Date.now(), title: d.meta.title };
      st.lastBackup = { at: Date.now(), ok: out.done.length, failed: out.failed.length, auto: !!opt2.auto };
      await putState(st);
      PP.finish(!out.failed.length || !!out.done.length, [
        `${out.done.length} چت ذخیره شد${out.failed.length ? `، ${out.failed.length} ناموفق` : ''}`,
        ...out.parts.map((p) => `${LRI(p.filename)} — ${p.chats} چت، ${(p.bytes / 1048576).toFixed(1)}MB`),
        ...out.failed.slice(0, 5).map((f) => `ناموفق: ${f.chat.name}: ${f.error}`),
      ]);
      return out;
    } catch (e) {
      PP.finish(false, [e.message]);
      throw e;
    } finally {
      running = false;
    }
  }
  $('#bgo').onclick = async () => {
    try {
      const chats = listing.chats.filter((c) => sel.has(c.uuid));
      await runBulk(chats, await loadOpts());
      await renderList();
    } catch (e) { setMsg('#msg2', e.message, true); }
  };

  // پشتیبان زمان‌بندی‌شده؛ background.js صدایش می‌کند
  async function runAuto() {
    if (running) return { ok: false, error: 'busy' };
    try {
      const l = await CCE.listChats({ fetchFn: (u, o) => fetch(u, o), origin: location.origin, cookie: document.cookie });
      const st = await getState();
      const chats = l.chats.filter((c) => isChanged(c, st));
      if (!chats.length) {
        st.lastBackup = { at: Date.now(), ok: 0, failed: 0, auto: true, note: 'چیز جدیدی نبود' };
        await putState(st);
        return { ok: true, count: 0 };
      }
      const o = await loadOpts();
      listing = l;
      const out = await runBulk(chats, Object.assign({}, o, { transfer: false }), { auto: true, org: l.org });
      return { ok: true, count: out.done.length };
    } catch (e) {
      const st = await getState();
      st.lastBackup = { at: Date.now(), ok: 0, failed: 0, auto: true, error: e.message };
      await putState(st);
      return { ok: false, error: e.message };
    }
  }

  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'export') {
      run(Object.assign({}, msg.options)).then(
        (r) => sendResponse({ ok: true, ...r }),
        (e) => sendResponse({ ok: false, error: e.message })
      );
      return true;
    }
    if (msg.type === 'ping') { sendResponse({ ok: true }); return; }
    if (msg.type === 'open-panel') { openCard(true); show(msg.tab || 'single'); sendResponse({ ok: true }); return; }
    if (msg.type === 'bulk-run') {
      sendResponse({ ok: true, started: true });
      runAuto().then((r) => { try { ext.runtime.sendMessage({ type: 'auto-done', ...r }); } catch (e) {} });
    }
  });

  let pending = null;
  const findComposer = () =>
    document.querySelector('div.ProseMirror[contenteditable="true"]') ||
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector('fieldset [contenteditable="true"]') ||
    document.querySelector('[contenteditable="true"]');
  const findFileInput = () => document.querySelector('input[data-testid="file-upload"]') || document.querySelector('input[type="file"]');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function attachFiles(files) {
    if (!files.length) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    const input = findFileInput();
    if (input) {
      try {
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(600);
        return;
      } catch (e) { console.warn('[CCE] input attach failed, trying paste', e); }
    }
    const comp = findComposer();
    if (!comp) throw new Error('کادر پیام پیدا نشد. یک چت جدید باز کنید.');
    comp.focus();
    comp.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(600);
  }
  async function insertText(text) {
    const comp = findComposer();
    if (!comp) throw new Error('کادر پیام پیدا نشد. یک چت جدید باز کنید.');
    comp.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    comp.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(300);
    if (!(comp.textContent || '').trim()) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      await sleep(200);
    }
    if (!(comp.textContent || '').trim()) {
      try { await navigator.clipboard.writeText(text); } catch (e) {}
      throw new Error('متن در کادر قرار نگرفت؛ در کلیپ‌بورد کپی شد، با Ctrl+V بچسبانید.');
    }
  }
  async function loadZip(file) {
    setMsg('#msg3', 'در حال خواندن ZIP…');
    const zip = await CCE.unzip(await file.arrayBuffer());
    const mf = zip.names.find((n) => /(^|\/)transfer\/manifest\.json$/.test(n));
    if (!mf) throw new Error('این ZIP پوشه‌ی transfer ندارد (باید از «این چت» با گزینه‌ی بسته‌ی انتقال خروجی گرفته باشید).');
    const base = mf.slice(0, mf.length - 'manifest.json'.length);
    const manifest = JSON.parse(new TextDecoder().decode(await zip.read(mf)));
    const files = [];
    for (const a of manifest.attach || []) {
      const bytes = await zip.read(base + a.path);
      files.push(new File([bytes], a.name, { type: a.mime || CCE.mimeFromName(a.name) }));
    }
    const batches = [];
    for (let i = 0; i < files.length; i += BATCH) batches.push(files.slice(i, i + BATCH));
    if (!batches.length) batches.push([]);
    pending = { manifest, batches, i: 0 };
  }
  async function attachNextBatch() {
    if (!pending) return;
    if (!findComposer()) throw new Error('اول یک چت جدید باز کنید (claude.ai/new).');
    const { manifest, batches } = pending;
    const k = batches.length, i = pending.i;
    const isLast = i === k - 1;
    setMsg('#msg3', `در حال پیوست دسته ${i + 1} از ${k}…`);
    await attachFiles(batches[i]);
    let text;
    if (k === 1) text = manifest.prompt;
    else if (!isLast) text = `[Transfer batch ${i + 1} of ${k} — files only. Do not analyze yet; just reply "received".]`;
    else text = `[Transfer batch ${k} of ${k} — final batch. The files from the previous ${k - 1} message(s) belong to this transfer as well.]\n\n` + manifest.prompt;
    await insertText(text);
    pending.i++;
    if (pending.i >= k) {
      pending = null;
      setMsg('#msg3', `${batches[i].length} فایل پیوست شد و متن آماده است.\nدکمه‌ی Send را بزنید.`);
      $('#impl').textContent = 'انتخاب ZIP انتقال';
    } else {
      setMsg('#msg3', `دسته‌ی ${i + 1} از ${k} آماده است.\nSend را بزنید، بعد دوباره دکمه‌ی بالا را بزنید.`);
      $('#impl').textContent = `دسته بعدی (${pending.i + 1} از ${k})`;
    }
  }
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = '.zip,application/zip'; picker.style.display = 'none';
  sh.appendChild(picker);
  $('#imp').onclick = async () => {
    try { if (pending) await attachNextBatch(); else picker.click(); } catch (e) { setMsg('#msg3', e.message, true); }
  };
  picker.onchange = async () => {
    const f = picker.files && picker.files[0];
    picker.value = '';
    if (!f) return;
    try { await loadZip(f); await attachNextBatch(); } catch (e) { setMsg('#msg3', e.message, true); }
  };

  // ---- زیپ‌کردن پوشه‌ی پروژه ----
  // فقط محتوای فایل‌ها را بدون تغییر می‌خوانیم؛ فشرده‌سازی در makeZip انجام می‌شود (فایل‌های از پیش فشرده مثل png/zip/pdf ذخیره‌ی ساده می‌شوند).
  const JUNK_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', '.next', '.nuxt', '.cache', '.idea', '.vscode', '.pytest_cache', '.mypy_cache', '.gradle', 'target']);
  const JUNK_FILES = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$|\.pyc$/;
  const PART_CAP = 29 * 1048576; // کمی زیر سقف ۳۰ مگابایت claude.ai
  const fmtMB = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  const dirPicker = document.createElement('input');
  dirPicker.type = 'file'; dirPicker.webkitdirectory = true; dirPicker.style.display = 'none';
  sh.appendChild(dirPicker);
  // اگر ZIP از سقف بزرگ‌تر شد، فهرست را نصف می‌کنیم تا هر قسمت یک ZIP کامل و مستقل باشد
  async function packParts(list) {
    const z = CCE.makeZip();
    for (const it of list) z.file(it.path, it.bytes);
    const data = await z.generate();
    if (data.length <= PART_CAP || list.length < 2) return [{ data, n: list.length }];
    const mid = list.length >> 1;
    return [...(await packParts(list.slice(0, mid))), ...(await packParts(list.slice(mid)))];
  }
  async function zipFolder(files) {
    const clean = sh.querySelector('[data-k=pjclean]').checked;
    const picked = [];
    let skipped = 0, raw = 0;
    const skippedWhat = new Set();
    for (const f of files) {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split('/');
      if (clean) {
        const dir = parts.slice(1, -1).find((d) => JUNK_DIRS.has(d));
        if (dir || JUNK_FILES.test(rel)) { skipped++; skippedWhat.add(dir || parts[parts.length - 1].replace(/^.*(\.pyc)$/, '*.pyc')); continue; }
      }
      picked.push({ path: rel, file: f }); raw += f.size;
    }
    if (!picked.length) throw new Error('پوشه خالی است.');
    if (raw > 1.5 * 1073741824) throw new Error('حجم پوشه بیشتر از ۱٫۵ گیگابایت است؛ مرورگر حافظه‌ی کافی ندارد. پوشه‌های سنگین را کنار بگذارید.');
    const list = [];
    for (let i = 0; i < picked.length; i++) {
      if (i % 25 === 0) { setMsg('#msg4', `در حال خواندن فایل‌ها… ${i} از ${picked.length}`); await sleep(0); }
      list.push({ path: picked[i].path, bytes: new Uint8Array(await picked[i].file.arrayBuffer()) });
    }
    setMsg('#msg4', 'در حال فشرده‌سازی…');
    const out = await packParts(list);
    // بازبینی: هر ZIP را دوباره می‌خوانیم و تعداد فایل‌ها و اندازه‌ها را با اصل می‌سنجیم
    let n = 0, bad = 0;
    const bySize = new Map(list.map((it) => [it.path, it.bytes.length]));
    for (const part of out) {
      const u = await CCE.unzip(part.data);
      for (const name of u.names) { n++; if ((await u.read(name)).length !== bySize.get(name)) bad++; }
    }
    if (n !== list.length || bad) throw new Error('بازبینی ZIP ناموفق بود؛ خروجی ساخته نشد.');
    return { out, count: list.length, skipped, skippedWhat: [...skippedWhat].slice(0, 6), raw, name: (picked[0].path.split('/')[0] || 'project') };
  }
  $('#pj').onclick = () => dirPicker.click();
  dirPicker.onchange = async () => {
    const files = [...(dirPicker.files || [])];
    dirPicker.value = '';
    if (!files.length) return;
    $('#pjdl').hidden = true;
    try {
      const r = await zipFolder(files);
      const total = r.out.reduce((a, p) => a + p.data.length, 0);
      const outFiles = r.out.map((p, i) => new File([p.data], r.out.length > 1 ? `${r.name}-part${i + 1}.zip` : `${r.name}.zip`, { type: 'application/zip' }));
      const download = () => outFiles.forEach((f) => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); });
      const dl = $('#pjdl'); dl.hidden = false; dl.onclick = download;
      let where;
      if (findComposer()) {
        for (let i = 0; i < outFiles.length; i += BATCH) await attachFiles(outFiles.slice(i, i + BATCH));
        where = 'در کادر پیام پیوست شد.';
      } else { download(); where = 'کادر پیام پیدا نشد؛ ZIP دانلود شد.'; }
      setMsg('#msg4', [
        `ساخته شد: ${r.count} فایل (${fmtMB(r.raw)}) ← ${outFiles.length} ZIP (${fmtMB(total)})`,
        r.skipped ? `کنار گذاشته شد: ${r.skipped} فایل از ${r.skippedWhat.join('، ')}` : 'هیچ فایلی کنار گذاشته نشد',
        'بازبینی: همه‌ی فایل‌ها با اصل یکی‌اند',
        where,
      ].join('\n'));
    } catch (e) { setMsg('#msg4', e.message, true); }
  };

  document.documentElement.appendChild(host);
})();
