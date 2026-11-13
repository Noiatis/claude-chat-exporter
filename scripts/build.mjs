// Builds dist/chrome and dist/firefox (and a zip of each) from src/. No dependencies; Node 20+.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const { makeZip } = require(path.join(src, 'core.js'));

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const base = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));

if (process.argv.includes('--sync-version')) {
  base.version = pkg.version;
  fs.writeFileSync(path.join(src, 'manifest.json'), JSON.stringify(base, null, 2) + '\n');
  const bp = path.join(src, 'brand.js');
  fs.writeFileSync(bp, fs.readFileSync(bp, 'utf8').replace(/version: '[^']+'/, `version: '${pkg.version}'`));
  console.log('synced version', pkg.version);
  process.exit(0);
}
if (base.version !== pkg.version) {
  console.error(`Versions differ: package.json=${pkg.version} src/manifest.json=${base.version}. Run: npm run version:sync`);
  process.exit(1);
}

const GECKO_ID = process.env.GECKO_ID || 'claude-chat-exporter@noiatis';

function manifestFor(target) {
  const m = JSON.parse(JSON.stringify(base));
  if (target === 'chrome') {
    m.background = { service_worker: 'background.js' };
  } else {
    m.background = { scripts: ['background.js'] };
    m.browser_specific_settings = {
      gecko: { id: GECKO_ID, strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
    };
  }
  return m;
}

function walk(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const r = path.join(rel, d.name);
    return d.isDirectory() ? walk(path.join(dir, d.name), r) : [r];
  });
}

fs.rmSync(dist, { recursive: true, force: true });
for (const target of ['chrome', 'firefox']) {
  const out = path.join(dist, target);
  fs.mkdirSync(out, { recursive: true });
  const zip = makeZip();
  for (const f of walk(src)) {
    if (f === 'manifest.json') continue;
    const data = fs.readFileSync(path.join(src, f));
    const dest = path.join(out, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    zip.file(f.split(path.sep).join('/'), data);
  }
  const mj = JSON.stringify(manifestFor(target), null, 2) + '\n';
  fs.writeFileSync(path.join(out, 'manifest.json'), mj);
  zip.file('manifest.json', mj);
  const zipPath = path.join(dist, `claude-chat-exporter-${target}-${pkg.version}.zip`);
  fs.writeFileSync(zipPath, await zip.generate());
  console.log('built', path.relative(root, zipPath));
}
