# راهنمای انتشار عمومی افزونه با گیت‌هاب (Chrome + Firefox)

این ریپو آماده‌ی انتشار است: `src/` کد افزونه، `scripts/build.mjs` دو بسته‌ی جدا برای Chrome و Firefox می‌سازد، و workflowهای `.github/workflows` تست، build و Release را خودکار می‌کنند.

## ۰. پیش از شروع (۱۰ دقیقه)
1. **لوگو و لینک تیم:** لوگوی نویاتیس (`src/icons/logo.png`) و آدرس `https://noiatis.ir/` (در `src/brand.js`) از قبل گذاشته شده‌اند. برای برند دیگر همین دو را عوض کنید و آیکن‌های `16/48/128.png` را هم از روی لوگوی جدید بسازید. فونت آهنگ داخل `src/fonts/` است و مجوز تجاری فونت‌ایران دارد؛ **قبل از انتشار عمومی مجوزش را بگیرید** (جزئیات در `src/fonts/README.md`). اگر مجوز ندارید، دو فایل woff2 را بردارید تا Tahoma جایگزین شود.
2. **نام در استورها:** چون «Claude» نشان تجاری صاحب آن است، پیشنهاد می‌شود نام استور «Chat Exporter for Claude» باشد و در توضیحات بنویسید «غیررسمی و وابسته به Anthropic نیست» (متن آماده در `STORE_LISTING.md`).
3. **حریم خصوصی:** `PRIVACY.md` آماده است. برای استور باید یک **آدرس عمومی** از آن داشته باشید: یا لینک فایل در گیت‌هاب، یا GitHub Pages.
4. **محدودیت‌های منطقه‌ای را زودتر بررسی کنید:** ثبت‌نام توسعه‌دهنده در Chrome Web Store فقط برای فهرست مشخصی از کشورها پذیرفته می‌شود، و گیت‌هاب و استورها ممکن است برای حساب‌ها در مناطق تحت تحریم محدودیت داشته باشند. اگر تیم در چنین منطقه‌ای است، پیش از پرداخت هزینه همین را چک کنید (یا از یک عضو/نهاد در کشور پشتیبانی‌شده استفاده کنید).

## ۱. ساخت ریپو در گیت‌هاب
```bash
cd noiatis-claude-chat-exporter
git init -b main
git add .
git commit -m "Initial release"
# در github.com یک ریپوی عمومی بسازید (مثلاً noiatis/claude-chat-exporter) و:
git remote add origin https://github.com/<org>/claude-chat-exporter.git
git push -u origin main
```
بعد از push، workflow با نام **CI** خودکار اجرا می‌شود (تست + build + lint فایرفاکس).

## ۲. اولین Release در گیت‌هاب
```bash
npm install
npm test && npm run build      # خروجی در dist/
git tag v2.3.2                 # باید با version در package.json یکی باشد
git push origin v2.2.0
```
workflow با نام **Release** دو فایل `claude-chat-exporter-chrome-<نسخه>.zip` و `claude-chat-exporter-firefox-<نسخه>.zip` را به صفحه‌ی Releases اضافه می‌کند. هر کس می‌تواند همین‌ها را دستی نصب کند (بدون استور)، ولی کاربر عادی از استور نصب می‌کند.

## ۳. Chrome Web Store (و Edge/Brave/…)
1. با یک حساب Google وارد **Chrome Web Store Developer Dashboard** شوید. ثبت‌نام یک‌بار هزینه‌ی ۵ دلار دارد ([منبع](https://chrome-extension-guide.pages.dev/2025/01/17/publish-chrome-extension-web-store-2025-guide/)).
2. **Add new item** و فایل `claude-chat-exporter-chrome-*.zip` را آپلود کنید (محتوای پوشه‌ی build داخل zip، نه خود پوشه).
3. تب **Store listing**: نام، توضیح (از `STORE_LISTING.md`)، دسته‌ی Productivity، آیکن ۱۲۸، اسکرین‌شات‌های ۱۲۸۰×۸۰۰ از پوشه‌ی `store-assets/`.
4. تب **Privacy**: توجیه هر مجوز (`claude.ai`، `downloads`، `storage`، `alarms`، `scripting`) را از `STORE_LISTING.md` کپی کنید، «Single purpose» را بنویسید، داده‌ای جمع‌آوری نمی‌شود، و آدرس سیاست حریم خصوصی را بدهید.
5. **Submit for review**. زمان بررسی متغیر است؛ ایراد معمول: توضیح مبهم، نبود privacy policy، یا مجوز بی‌دلیل.
6. همین zip را به‌طور معمول می‌توانید در **Microsoft Edge Add-ons** هم بارگذاری کنید.

## ۴. Firefox Add-ons (AMO)
1. در addons.mozilla.org حساب بسازید → **Developer Hub** → **Submit a New Add-on** → **On this site (listed)**.
2. فایل `claude-chat-exporter-firefox-*.zip` را آپلود کنید. (چون کد minify/bundle نمی‌شود، آپلود source اضافه لازم نیست.)
3. از ۳ نوامبر ۲۰۲۵ هر افزونه‌ی جدید باید در manifest اعلام کند داده‌ای جمع می‌کند یا نه؛ build ما این را با `data_collection_permissions: {required: ["none"]}` ثبت می‌کند. این کلید حداقل به Firefox 140 نیاز دارد، پس `strict_min_version` روی ۱۴۰ است (نسخه‌های قدیمی‌تر مثل ESR 115 پشتیبانی نمی‌شوند).
4. توضیحات و اسکرین‌شات‌ها را پر کنید و ارسال کنید. شناسه‌ی افزونه (`GECKO_ID` در `scripts/build.mjs`، پیش‌فرض `claude-chat-exporter@noiatis`) بعد از انتشار قابل تغییر نیست؛ قبل از اولین ارسال، تصمیم نهایی را بگیرید.

## ۵. خودکارسازی انتشار نسخه‌های بعدی (اختیاری)
**نسخه‌ی اول هر استور را دستی ثبت کنید**، بعد به‌روزرسانی‌ها را خودکار کنید. در گیت‌هاب: Settings → Secrets and variables → Actions:

| Secret | از کجا |
|---|---|
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | AMO → Developer Hub → API Credentials |
| `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | Google Cloud OAuth برای Chrome Web Store API (راهنمای `chrome-webstore-upload-cli`) |

هر Secretی که تنظیم شود، مرحله‌ی مربوط در `release.yml` خودکار فعال می‌شود؛ بدون Secret فقط Release گیت‌هاب ساخته می‌شود. (دستور CLI استور کروم را با اولین اجرا چک کنید؛ نام متغیرها ممکن است در نسخه‌های بعدی تغییر کند.)

## ۶. انتشار نسخه‌ی جدید
```bash
# 1) version را در package.json بالا ببرید (مثلاً 2.3.0)
npm run version:sync     # manifest و brand.js را هم‌نسخه می‌کند
npm test && npm run build
git commit -am "v2.3.2" && git tag v2.3.2 && git push && git push --tags
```

## ۷. نکات مهم
- افزونه از **API داخلی و مستندنشده‌ی claude.ai** استفاده می‌کند؛ هر تغییری در سایت ممکن است بخشی را بشکند. صفحه‌ی Issues را باز بگذارید و در README این را شفاف بنویسید.
- پشتیبان خودکار فقط وقتی مرورگر باز است و حساب لاگین است اجرا می‌شود.
- هیچ کد راه‌دور، آنالیتیکس یا سرور ندارید، پس بررسی استورها ساده‌تر است؛ همین را در توضیحات تکرار کنید.

## منابع
- Chrome Web Store: [ثبت‌نام و هزینه](https://developer.chrome.com/docs/webstore/register)، [راهنمای انتشار](https://developer.chrome.com/docs/webstore/publish)
- Firefox: [data collection permissions](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)، [web-ext sign](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign)
