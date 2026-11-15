/* Single source of truth for the export options: label, one-line hint, default and group.
   Both the on-page panel (content.js) and the toolbar popup (popup.js) render from this list,
   so wording and defaults can never drift apart. */
(function (root) {
  const GROUPS = {
    out: 'خروجی‌ها',
    pack: 'محتوای بسته‌ی انتقال',
    arch: 'آرشیو کامل (فایل conversation.md)',
  };
  const TOKENS = [[60000, '۶۰ هزار توکن'], [120000, '۱۲۰ هزار توکن'], [170000, '۱۷۰ هزار توکن'], [1e9, 'بدون سقف']];
  const OPTS = [
    { k: 'transfer', g: 'out', main: true, def: true, label: 'بسته‌ی انتقال', hint: 'برای ادامه‌ی این چت در اکانت یا چت دیگر' },
    { k: 'viewer', g: 'out', main: true, def: true, label: 'نسخه‌ی قابل‌مرور آفلاین', hint: 'یک فایل HTML برای خواندن، جست‌وجو و چاپ/PDF' },
    { k: 'incremental', g: 'out', main: true, def: false, label: 'فقط پیام‌های جدید', hint: 'از آخرین خروجی همین چت' },
    { k: 'note', g: 'out', def: false, label: 'یادداشت Obsidian / Notion', hint: 'یک فایل .md با ویژگی‌های آماده برای برنامه‌ی یادداشت' },

    { k: 'includeProject', g: 'pack', def: true, label: 'دستورالعمل‌های Project', hint: 'قوانین ثابت و فایل‌های Project همراه چت می‌آید' },
    { k: 'aiSummary', g: 'pack', def: false, label: 'گرفتن خلاصه‌ی پروژه', hint: 'در چت جدید از Claude یک خلاصه‌ی قابل‌نگهداری می‌خواهد' },
    { k: 'tokenBudget', g: 'pack', type: 'select', def: 120000, choices: TOKENS, label: 'سقف حجم متن', hint: 'پیام‌های قدیمی بلند فقط وقتی کوتاه می‌شوند که از این سقف بگذرند' },
    { k: 'imageMode', g: 'pack', type: 'select', def: 'all', choices: [['all', 'همه'], ['last10', '۱۰ عکس آخر'], ['none', 'هیچ‌کدام']], label: 'عکس‌ها', hint: 'هر عکس بخشی از ظرفیت چت جدید را پر می‌کند' },
    { k: 'includeMedia', g: 'pack', def: false, label: 'فایل صوتی و ویدئو', hint: 'Claude آن‌ها را نمی‌بیند؛ فقط حجم اضافه می‌کنند' },
    { k: 'redact', g: 'pack', def: false, label: 'پاک‌سازی کلیدها و توکن‌ها', hint: 'کلید API و رمزها در خروجی با [REDACTED] جایگزین می‌شوند' },
    { k: 'redactPII', g: 'pack', def: false, label: 'پاک‌سازی شماره و ایمیل', hint: 'شماره‌ی موبایل و آدرس ایمیل در خروجی پنهان می‌شوند' },

    { k: 'includeThinking', g: 'arch', def: false, label: 'متن «تفکر» Claude', hint: 'مراحل فکر کردن Claude پیش از هر پاسخ' },
    { k: 'includeToolOutput', g: 'arch', def: false, label: 'جزئیات ابزارها', hint: 'ورودی و خروجی جست‌وجو، اجرای کد و بقیه‌ی ابزارها' },
    { k: 'allBranches', g: 'arch', def: false, label: 'نسخه‌های جایگزین پاسخ‌ها', hint: 'پاسخ‌هایی که با ویرایش پیام یا «بازتولید» ساخته شده‌اند' },
  ];

  const defaults = () => Object.fromEntries(OPTS.map((o) => [o.k, o.def]));

  // Builds one switch/select row without innerHTML (store policy)
  function row(o, value, onChange) {
    const lab = document.createElement('label');
    lab.className = o.type === 'select' ? 'sw sel' : 'sw';
    const tx = document.createElement('span');
    tx.className = 'tx';
    const b = document.createElement('b'); b.textContent = o.label;
    const s = document.createElement('small'); s.textContent = o.hint; s.dataset.hint = o.k;
    tx.append(b, s);
    lab.appendChild(tx);
    if (o.type === 'select') {
      const sel = document.createElement('select');
      sel.dataset.k = o.k;
      for (const [v, t] of o.choices) { const op = document.createElement('option'); op.value = String(v); op.textContent = t; sel.appendChild(op); }
      sel.value = String(value);
      sel.onchange = () => onChange(o.k, typeof o.def === 'number' ? Number(sel.value) : sel.value);
      lab.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.dataset.k = o.k; inp.checked = !!value;
      inp.onchange = () => onChange(o.k, inp.checked);
      lab.append(inp, document.createElement('i'));
    }
    return lab;
  }

  // filter(o) chooses which options go into this container; headings are added when `heads` is true
  function build(box, filter, values, onChange, heads) {
    box.textContent = '';
    let last = null;
    for (const o of OPTS) {
      if (!filter(o)) continue;
      if (heads && o.g !== last) {
        const h = document.createElement('h4'); h.className = 'gh'; h.textContent = GROUPS[o.g]; box.appendChild(h);
      }
      last = o.g;
      box.appendChild(row(o, values[o.k] != null ? values[o.k] : o.def, onChange));
    }
  }

  const api = { OPTS, GROUPS, defaults, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CCE_OPTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
