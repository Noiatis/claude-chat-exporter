# Privacy Policy — Claude Chat Exporter

*Last updated: 2026-11-12 · Maintainer: Noiatis*

**Short version: the extension does not collect, transmit, sell or share any personal data. Everything stays in your browser and on your computer.**

## What the extension does
It runs only on `https://claude.ai/*`. When *you* click Export (or when *you* enable the scheduled backup), it reads your own conversations from claude.ai using your existing logged-in session and packs them into a ZIP file that is downloaded to your computer.

## Data handling
- **No servers.** The extension has no backend and makes no network requests except to `claude.ai` (to read your own chats and files).
- **No analytics, no tracking, no ads, no remote code.**
- **Local settings only.** Your chosen options, the time of your last export, and per-chat sync markers (last message id) are stored with the browser's `storage` API on your device. They are never sent anywhere.
- **Downloads.** Exports are saved through the browser's download feature to your computer. You are responsible for protecting exported files (they contain your conversations). The optional "redact secrets" setting removes common API-key patterns from exported text.

## Permissions and why
| Permission | Purpose |
|---|---|
| `https://claude.ai/*` | Read your own conversations/files on claude.ai and show the export panel |
| `downloads` | Save the ZIP files to your computer |
| `storage` | Remember your settings and export progress markers |
| `alarms` | Optional scheduled backup (off by default) |
| `scripting` | Loads the extension's own panel into an already-open claude.ai tab when you click the toolbar button |

## Not affiliated
This is an independent, unofficial tool. It is not affiliated with or endorsed by Anthropic. "Claude" is a trademark of its owner.

## Contact
Open an issue in the project repository, or use the contact details on the Noiatis website.

---

## سیاست حریم خصوصی (خلاصه‌ی فارسی)
افزونه هیچ داده‌ای جمع‌آوری، ارسال یا به اشتراک نمی‌گذارد. فقط روی `claude.ai` و فقط با دستور شما (یا پشتیبان‌گیری زمان‌بندی‌شده‌ای که خودتان روشن کنید) چت‌های خود شما را از نشست لاگین‌شده‌ی خودتان می‌خواند و در یک ZIP روی رایانه‌ی شما ذخیره می‌کند. تنظیمات فقط در مرورگر شما نگهداری می‌شود. هیچ سرور، آنالیتیکس یا کد راه‌دور وجود ندارد. این ابزار غیررسمی است و وابسته به Anthropic نیست.
