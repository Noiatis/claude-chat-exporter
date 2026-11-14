# 📦 Claude Chat Exporter

**By [Noiatis](https://noiatis.ir/)** · [فارسی 🇮🇷](README.fa.md)

Unofficial browser extension for **Chrome and Firefox** to export your [claude.ai](https://claude.ai) chats and move them between accounts.

🔒 Everything runs in your own browser. No servers, and nothing is sent anywhere.

[![License: MIT](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
![Chrome](https://img.shields.io/badge/Chrome-MV3-blue)
![Firefox](https://img.shields.io/badge/Firefox-supported-blue)

---

## ✨ Features

| | Feature | Details |
|---|---|---|
| 💬 | **One chat, all chats, or a Project** | A folder per chat plus a searchable `index.html`. Big backups are split into several ZIPs. |
| 🌐 | **Offline reader** (`viewer.html`) | Search, dark mode, print or save as PDF. |
| 📝 | **Obsidian / Notion** | A `<title>.md` file with frontmatter. |
| 🔁 | **Transfer pack** | Continue in another Claude account: context files, a ready-to-send handoff message and a one-click Import. Can optionally ask Claude for a reusable "project brief". |
| ➕ | **Incremental export** | Only the messages after your last export of that chat. |
| ⏰ | **Scheduled backup** | Daily or weekly, only for new or changed chats. |
| 🧩 | **Artifacts and files** | Every artifact version, files Claude created (with later edits applied), uploads and Project instructions. |
| 🛡️ | **Secret redaction** | Optionally strips API keys and tokens. All your options are remembered. |

---

## 🚀 Install

- 🏪 **Store:** *(link after publishing)*
- 📥 **Manual:** download the zip for your browser from [Releases](../../releases).
  - 🟢 **Chrome:** unzip → `chrome://extensions` → turn on Developer mode → Load unpacked
  - 🦊 **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `manifest.json`

---

## 🖱️ Usage

A round **Noiatis button** appears at the bottom-left of claude.ai. It has three tabs:

1. 💬 **This chat:** export the chat you have open
2. 🗂️ **All chats:** bulk backup
3. 📤 **Import:** attach the files and handoff message in the new account

⚙️ Scheduled-backup settings live in the toolbar icon's popup.

---

## 🛠️ Develop

```bash
npm install
npm test              # core logic tests
npm run build         # dist/chrome, dist/firefox + zips
npm run lint:firefox
```

- 🎨 Branding (name, site, logo): `src/brand.js`
- 📐 Design rules and the reasoning behind them: [DESIGN.md](DESIGN.md)
- 🔤 Font: Ahang by FontIran, **commercial licence**. Read `src/fonts/README.md` before any public release.

📚 **More docs:** [Publishing guide (Persian)](PUBLISHING.fa.md) · [Privacy](PRIVACY.md) · [Store texts](STORE_LISTING.md)

---

## ⚠️ Disclaimer

Not affiliated with or endorsed by Anthropic. Uses claude.ai's internal, undocumented endpoints, which may change without notice. Released under the [MIT License](LICENSE).