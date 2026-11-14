/* Team name, link and logo shown in the UI and in exported pages. */
(function (root) {
  const ext = typeof browser !== 'undefined' ? browser : chrome;
  const BRAND = {
    name: 'Noiatis',
    nameFa: 'نویاتیس',
    url: 'https://noiatis.ir/',
    logoFile: 'icons/logo.png',
    version: '2.8.3',
  };

  // The logo is a transparent PNG with dark colours, so it always sits on a white tile.
  // This keeps it readable on dark backgrounds.
  function mark(size) {
    const tile = document.createElement('span');
    const pad = Math.max(2, Math.round(size * 0.12));
    tile.style.cssText =
      `display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;` +
      `width:${size}px;height:${size}px;padding:${pad}px;background:#fff;border-radius:${Math.round(size * 0.22)}px;` +
      `box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)`;
    const img = new Image();
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    // Not natively draggable, so it cannot interrupt pointer events on the floating button.
    img.draggable = false;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none';
    img.src = ext.runtime.getURL(BRAND.logoFile);
    tile.appendChild(img);
    return tile;
  }

  // Site link; if the URL is empty, only the name is shown.
  function link(label) {
    const text = label || BRAND.name;
    if (!BRAND.url) {
      const s = document.createElement('span');
      s.textContent = text;
      return s;
    }
    const a = document.createElement('a');
    a.href = BRAND.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    return a;
  }

  root.CCE_BRAND = Object.assign(BRAND, { mark, link });
})(typeof globalThis !== 'undefined' ? globalThis : this);
