/* Single source of truth for the export options: key, default and group. Labels and hints are in brand.js.
   Both the on-page panel (content.js) and the toolbar popup (popup.js) render from this list,
   so wording and defaults can never drift apart. */
(function (root) {
  const GROUPS = { out: 'grp.out', pack: 'grp.pack', arch: 'grp.arch' };
  const TOKENS = [60000, 120000, 170000, 1e9].map((n) => [n, 'tok.' + n]);
  const OPTS = [
    { k: 'transfer', g: 'out', main: true, def: true },
    { k: 'viewer', g: 'out', main: true, def: true },
    { k: 'incremental', g: 'out', main: true, def: false },
    { k: 'note', g: 'out', def: false },

    { k: 'includeProject', g: 'pack', def: true },
    { k: 'aiSummary', g: 'pack', def: false },
    { k: 'tokenBudget', g: 'pack', type: 'select', def: 120000, choices: TOKENS },
    { k: 'imageMode', g: 'pack', type: 'select', def: 'all', choices: [['all', 'img.all'], ['last10', 'img.last10'], ['none', 'img.none']] },
    { k: 'includeMedia', g: 'pack', def: false },
    { k: 'redact', g: 'pack', def: false },
    { k: 'redactPII', g: 'pack', def: false },

    { k: 'includeThinking', g: 'arch', def: false },
    { k: 'includeToolOutput', g: 'arch', def: false },
    { k: 'allBranches', g: 'arch', def: false },
  ];

  // Text comes from the interface dictionary in brand.js
  const T = (k) => (root.CCE_I18N ? root.CCE_I18N.t(k) : k);

  const defaults = () => Object.fromEntries(OPTS.map((o) => [o.k, o.def]));

  // Builds one switch/select row without innerHTML (store policy)
  function row(o, value, onChange) {
    const lab = document.createElement('label');
    lab.className = o.type === 'select' ? 'sw sel' : 'sw';
    const tx = document.createElement('span');
    tx.className = 'tx';
    const b = document.createElement('b'); b.textContent = T('opt.' + o.k);
    const s = document.createElement('small'); s.textContent = T('opt.' + o.k + '.h'); s.dataset.hint = o.k;
    tx.append(b, s);
    lab.appendChild(tx);
    if (o.type === 'select') {
      const sel = document.createElement('select');
      sel.dataset.k = o.k;
      for (const [v, t] of o.choices) { const op = document.createElement('option'); op.value = String(v); op.textContent = T(t); sel.appendChild(op); }
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
        const h = document.createElement('h4'); h.className = 'gh'; h.textContent = T(GROUPS[o.g]); box.appendChild(h);
      }
      last = o.g;
      box.appendChild(row(o, values[o.k] != null ? values[o.k] : o.def, onChange));
    }
  }

  const api = { OPTS, GROUPS, defaults, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CCE_OPTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
