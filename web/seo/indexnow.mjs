import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG = path.join(HERE, 'data', 'seo.json');
const OUT = path.resolve(HERE, '..', 'public');
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));

if (!cfg.site.indexNowKey) {
  cfg.site.indexNowKey = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log('Создан ключ IndexNow: ' + cfg.site.indexNowKey);
}
const key = cfg.site.indexNowKey;
const base = cfg.site.domain.replace(/\/+$/, '');
const host = new URL(base).host;
const keyLocation = base + '/' + key + '.txt';
fs.writeFileSync(path.join(OUT, key + '.txt'), key, 'utf8');

const sitemap = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).slice(0, 10000);
if (!urlList.length) { console.error('Sitemap пуст: сначала node web/seo/build-seo.mjs'); process.exit(1); }

const res = await fetch('https://yandex.com/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation, urlList })
});
console.log('IndexNow: HTTP ' + res.status + ' ' + (await res.text()));
console.log('Ключ должен открываться по адресу: ' + keyLocation);
