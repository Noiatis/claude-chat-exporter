# Claude Chat Exporter  ·  by Noiatis

Unofficial browser extension (Chrome + Firefox) to export your [claude.ai](https://claude.ai) chats and move them between accounts.
افزونه‌ی غیررسمی برای خروجی گرفتن از چت‌های claude.ai و انتقال آن‌ها بین اکانت‌ها.

## Features / قابلیت‌ها
- **Export one chat or all chats** (or a Project) → folder per chat + searchable `index.html`; big backups split into several ZIPs
- **Offline HTML reader** (`viewer.html`): search, dark mode, print / save as PDF
- **Obsidian / Notion Markdown** (`<title>.md` with frontmatter)
- **Project folder zip** (Import tab): pick a folder, it is compressed in the browser, verified file-by-file, and attached to the message box; split into independent ZIPs above 30 MB
- **Transfer pack** to continue in another Claude account: context files + ready-to-send handoff message + one-click **Import** (optionally asks Claude for a reusable "project brief")
- **Incremental export**: only messages after your last export of that chat
- **Scheduled backup** of new/changed chats (daily/weekly)
- Artifacts with all versions, files Claude created (with later edits applied), uploads, Project instructions
- Optional secret redaction · all options remembered · 100% local, no servers

## Install / نصب
- Store: *(link after publishing)*
- Manual: download the zip for your browser from **Releases**.
  - Chrome: unzip → `chrome://extensions` → Developer mode → Load unpacked
  - Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `manifest.json`

## Develop
```bash
npm install
npm test            # core logic tests
npm run build       # dist/chrome, dist/firefox + zips
npm run lint:firefox
```
Branding lives in `src/brand.js` (name, site, logo). The UI uses one bundled font, Vazirmatn (SIL OFL 1.1, see `src/fonts/OFL.txt`), so the panel, popup and exported pages look the same. Design rules and the reasoning behind them: [DESIGN.md](DESIGN.md).

فارسی: [README.fa.md](README.fa.md)

Publishing guide (Persian): [PUBLISHING.fa.md](PUBLISHING.fa.md) · Privacy: [PRIVACY.md](PRIVACY.md) · Store texts: [STORE_LISTING.md](STORE_LISTING.md)

## Disclaimer
Not affiliated with or endorsed by Anthropic. Uses claude.ai's internal, undocumented endpoints, which may change without notice. MIT License.
