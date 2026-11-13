import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'data', 'geo.json');
const TOP = Number(process.env.TOP_POP || 100000);
const SOURCES = [
  'https://raw.githubusercontent.com/pensnarik/russian-cities/master/russian-cities.json',
  'https://cdn.jsdelivr.net/gh/pensnarik/russian-cities@master/russian-cities.json'
];
const MAP = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i',
  'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
  'ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };

function slugify(s) {
  return String(s).toLowerCase().split('').map(ch => (ch in MAP ? MAP[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function load() {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (Array.isArray(json) && json.length) { console.log('Источник: ' + url); return json; }
      throw new Error('пустой ответ');
    } catch (e) { console.warn('Не удалось ' + url + ' — ' + e.message); }
  }
  throw new Error('Справочник не скачан. Проверьте интернет/прокси и повторите команду.');
}

const raw = await load();
const byRegion = new Map();
for (const it of raw) {
  const name = String(it.name || '').trim();
  const region = String(it.subject || it.region || '').trim();
  if (!name || !region) continue;
  const population = Number(String(it.population ?? 0).replace(/[^\d]/g, '')) || 0;
  if (!byRegion.has(region)) {
    byRegion.set(region, { name: region, slug: slugify(region), district: String(it.district || '').trim(), cities: [] });
  }
  byRegion.get(region).cities.push({
    name, population,
    lat: (it.coords && it.coords.lat) || '',
    lon: (it.coords && it.coords.lon) || ''
  });
}

const used = new Set();
const regions = [...byRegion.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
for (const r of regions) {
  r.cities.sort((a, b) => b.population - a.population || a.name.localeCompare(b.name, 'ru'));
  for (const c of r.cities) {
    let s = slugify(c.name);
    if (used.has(s)) s = s + '-' + r.slug;
    let n = 2;
    while (used.has(s)) s = s + '-' + (n++);
    used.add(s);
    c.slug = s;
    c.region = r.name;
    c.regionSlug = r.slug;
    c.district = r.district;
    c.top = c.population >= TOP;
  }
  r.cityCount = r.cities.length;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: SOURCES[0],
  license: 'Данные о городах и населении: Wikipedia (репозиторий pensnarik/russian-cities)',
  topPopulation: TOP,
  regionCount: regions.length,
  cityCount: regions.reduce((n, r) => n + r.cities.length, 0),
  topCityCount: regions.reduce((n, r) => n + r.cities.filter(c => c.top).length, 0),
  regions
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log('Регионов: ' + out.regionCount + ', городов: ' + out.cityCount + ', крупных (>=' + TOP + '): ' + out.topCityCount);
console.log('Файл: ' + OUT);
