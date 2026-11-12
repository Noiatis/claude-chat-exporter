# Store listing text (copy/paste)

## Name
Claude Chat Exporter  *(suggestion for stores: "Chat Exporter for Claude" + the disclaimer below, to avoid implying it is official)*

## Short description (≤132 chars)
Export Claude chats to ZIP/Markdown/HTML, back up all chats, and move a conversation to another Claude account.

## Detailed description (English)
Claude Chat Exporter saves your claude.ai conversations — messages, uploaded files, artifacts and files Claude created — into a clean ZIP on your computer.

• Export one chat or back up all chats (or one Project) with a searchable index.html
• Offline HTML reader with search, dark mode and print/PDF
• Obsidian / Notion-friendly Markdown notes with frontmatter
• Transfer pack: continue a conversation in another Claude account — files + a ready-to-send handoff message
• Incremental export: only new messages since your last export
• Scheduled backup of new/changed chats (optional)
• Optional redaction of API keys/tokens
• Your settings are remembered
• 100% local: no servers, no analytics, no data leaves your browser

Unofficial tool. Not affiliated with or endorsed by Anthropic.

## توضیح (فارسی)
افزونه‌ی Claude Chat Exporter چت‌های claude.ai را همراه فایل‌ها و آرتیفکت‌ها در یک ZIP ذخیره می‌کند؛ پشتیبان‌گیری از همه‌ی چت‌ها، مرورگر آفلاین HTML (قابل چاپ/PDF)، فرمت Obsidian/Notion، بسته‌ی انتقال به اکانت دیگر، خروجی افزایشی و پشتیبان خودکار. همه‌چیز محلی است و هیچ داده‌ای ارسال نمی‌شود. ابزار غیررسمی است.

## Single purpose (Chrome dashboard)
Export and back up the user's own claude.ai conversations to files on their computer.

## Permission justifications (Chrome dashboard → Privacy practices)
- **Host permission `https://claude.ai/*`**: required to read the signed-in user's own conversations and uploaded files from claude.ai (same-origin requests with the user's session) and to show the export panel on the page.
- **`downloads`**: saves the generated ZIP files to the user's computer.
- **`storage`**: remembers the user's chosen options and per-chat export markers (last exported message) so incremental export and "changed chats" work.
- **`alarms`**: optional scheduled backup, disabled by default.
- **`scripting`**: only to load the extension's own panel into an already-open claude.ai tab (opened before the extension was installed or updated) when the user clicks the toolbar button.
- **Remote code**: none. All code is in the package.
- **Data usage**: does not collect or transmit user data; tick no data categories. Provide the Privacy Policy URL (PRIVACY.md).

## Firefox (AMO)
- `data_collection_permissions.required = ["none"]` is already set by the build.
- Category: Tools / Productivity. License: MIT.

## Screenshots
Use `store-assets/` (1280×800). Chrome: up to 5 screenshots + 128px icon; promo tile optional.
