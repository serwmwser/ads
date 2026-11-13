import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'public');
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'seo.json'), 'utf8'));
const S = cfg.site;
const GEOCFG = cfg.geo || {};
const MIN_ADS = GEOCFG.minAds ?? 3;
const INDEX_EMPTY_CITIES = GEOCFG.indexEmptyCityPages === true;
const COMBOS_TOP_ONLY = GEOCFG.combosTopOnly !== false;
const BASE = S.domain.replace(/\/+$/, '');
const TODAY = new Date().toISOString().slice(0, 10);
const urls = [];
let generated = 0;

const TPL = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<meta name="description" content="{{description}}">
<meta name="robots" content="{{robots}}">
<link rel="canonical" href="{{canonical}}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="{{siteName}}">
<meta property="og:title" content="{{title}}">
<meta property="og:description" content="{{description}}">
<meta property="og:url" content="{{canonical}}">
<meta property="og:image" content="{{ogImage}}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b5fff">
<link rel="icon" href="/favicon.ico">
<style>
:root{--blue:#0b5fff;--ink:#16181d;--muted:#5b6270;--line:#e4e7ec}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink)}
header,main,footer{max-width:1040px;margin:0 auto;padding:16px}
header{display:flex;gap:16px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)}
header a{color:var(--blue);text-decoration:none;font-weight:600}
h1{font-size:28px;line-height:1.25;margin:16px 0 8px}
h2{font-size:20px;margin:28px 0 8px}
h3{font-size:17px;margin:20px 0 6px}
.lead{color:var(--muted);margin:0 0 16px}
.crumbs{font-size:14px;color:var(--muted)}
.crumbs a{color:var(--blue);text-decoration:none}
.cards{list-style:none;padding:0;display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.cards li{border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.cards a{color:var(--blue);text-decoration:none}
.cards small{color:var(--muted)}
.price{font-size:22px;font-weight:700}
.btn{display:inline-block;background:var(--blue);color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none}
details{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0}
summary{cursor:pointer;font-weight:600}
img{max-width:100%;height:auto;border-radius:10px}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:14px;margin-top:32px}
footer a{color:var(--blue);text-decoration:none}
</style>
{{jsonld}}
</head>
<body>
<header>
  <a href="/">{{siteName}}</a>
  <a href="/c/nedvizhimost/">Недвижимость</a>
  <a href="/c/transport/">Транспорт</a>
  <a href="/c/elektronika/">Электроника</a>
  <a href="/c/rabota-uslugi/">Работа и услуги</a>
  <a href="/geo/">Все регионы и города</a>
</header>
<main>
  <nav class="crumbs" aria-label="Хлебные крошки">{{breadcrumbs}}</nav>
  <h1>{{h1}}</h1>
  <p class="lead">{{intro}}</p>
  {{body}}
  <section>{{faq}}</section>
  <p><a class="btn" href="/profile/ads/new">Разместить объявление бесплатно</a></p>
</main>
<footer>
  <p>{{orgName}}, ИНН {{orgInn}}. Поддержка: <a href="mailto:{{orgEmail}}">{{orgEmail}}</a></p>
  <p><a href="/geo/">Все регионы и города России</a> ·
     <a href="/legal/privacy.html">Политика конфиденциальности</a> ·
     <a href="/legal/consent.html">Согласие на обработку персональных данных</a> ·
     <a href="/legal/offer.html">Оферта и тарифы</a> ·
     <a href="/legal/rules.html">Правила сервиса</a></p>
  <p>© {{year}} {{siteName}}. Цены указаны в рублях.</p>
</footer>
</body>
</html>
`;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => Number(n || 0).toLocaleString('ru-RU');

let ads = [];
const adsFile = path.join(HERE, 'data', 'ads.json');
if (fs.existsSync(adsFile)) ads = JSON.parse(fs.readFileSync(adsFile, 'utf8'));

let geo = null;
const geoFile = path.join(HERE, 'data', 'geo.json');
if (fs.existsSync(geoFile)) geo = JSON.parse(fs.readFileSync(geoFile, 'utf8'));

const custom = new Map((cfg.cities || []).map(c => [c.slug, c]));
const cities = [];
const cityBySlug = new Map();
if (geo && Array.isArray(geo.regions)) {
  for (const r of geo.regions) {
    for (const c of r.cities) {
      const ex = custom.get(c.slug) || {};
      const item = {
        name: c.name, slug: c.slug, population: c.population, top: !!c.top,
        region: r.name, regionSlug: r.slug, district: r.district,
        where: ex.where || ('в городе ' + c.name), note: ex.note || ''
      };
      cities.push(item);
      cityBySlug.set(item.slug, item);
    }
  }
} else {
  for (const c of (cfg.cities || [])) {
    const item = { name: c.name, slug: c.slug, population: 0, top: true, region: '', regionSlug: '',
      district: '', where: c.where || ('в городе ' + c.name), note: c.note || '' };
    cities.push(item);
    cityBySlug.set(item.slug, item);
  }
}
const regions = (geo && geo.regions) ? geo.regions : [];
const topCities = cities.filter(c => c.top);

function write(file, content) {
  const full = path.join(OUT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}
function crumbsHtml(items) {
  return items.map((c, i) => i === items.length - 1
    ? '<span aria-current="page">' + esc(c.name) + '</span>'
    : '<a href="' + esc(c.url) + '">' + esc(c.name) + '</a>').join(' / ');
}
function faqHtml(faq) {
  if (!faq || !faq.length) return '';
  return '<h2>Частые вопросы</h2>' + faq.map(f =>
    '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>').join('');
}
function steps() {
  return '<h2>Как разместить объявление</h2><ol>' +
    '<li>Войдите по российскому номеру телефона — код придёт в СМС.</li>' +
    '<li>Добавьте заголовок, описание, цену в рублях и до 10 фото.</li>' +
    '<li>Выберите категорию и город, отправьте на проверку.</li>' +
    '<li>Отвечайте покупателям в чате: сообщения переводятся автоматически.</li></ol>';
}
function listHtml(items) {
  return '<ul class="cards">' + items.map(i =>
    '<li><a href="' + esc(i.url) + '">' + esc(i.name) + '</a>' +
    (i.hint ? '<br><small>' + esc(i.hint) + '</small>' : '') + '</li>').join('') + '</ul>';
}
function ldOrg() {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: S.org.name,
    url: BASE + '/', email: S.org.email, taxID: S.org.inn, areaServed: 'RU' };
}
function ldSite() {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: S.name, url: BASE + '/',
    inLanguage: 'ru', potentialAction: { '@type': 'SearchAction',
      target: BASE + '/search?q={search_term_string}', 'query-input': 'required name=search_term_string' } };
}
function ldCrumbs(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: BASE + c.url })) };
}
function ldFaq(faq) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f =>
    ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}
function ldList(name, items) {
  return { '@context': 'https://schema.org', '@type': 'ItemList', name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 500).map((it, i) =>
      ({ '@type': 'ListItem', position: i + 1, name: it.name, url: BASE + it.url })) };
}
function page(o) {
  const ld = [ldOrg()].concat(o.ld || []);
  if (o.crumbs && o.crumbs.length > 1) ld.push(ldCrumbs(o.crumbs));
  if (o.faq && o.faq.length) ld.push(ldFaq(o.faq));
  const values = {
    title: esc(o.title), description: esc(o.description), robots: o.robots || 'index, follow',
    canonical: BASE + o.url, siteName: esc(S.name), ogImage: BASE + S.ogImage,
    h1: esc(o.h1), intro: esc(o.intro), body: o.body || '',
    breadcrumbs: crumbsHtml(o.crumbs || [{ name: 'Главная', url: '/' }]),
    faq: faqHtml(o.faq), year: String(new Date().getFullYear()),
    orgName: esc(S.org.name), orgInn: esc(S.org.inn), orgEmail: esc(S.org.email),
    jsonld: ld.map(x => '<script type="application/ld+json">' + JSON.stringify(x) + '<\/script>').join('\n')
  };
  write(o.file, TPL.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m)));
  generated++;
  if ((o.robots || 'index, follow').indexOf('noindex') !== 0) urls.push(BASE + o.url);
}
function adsOf(cat, city) {
  return ads.filter(a => a.category === cat && a.city === city && a.active !== false);
}
function adsBlock(list) {
  if (!list.length) return '<p class="lead">Объявлений в этом разделе пока нет — разместите первое бесплатно.</p>';
  return '<h2>Свежие объявления</h2>' + listHtml(list.map(a =>
    ({ name: a.title, url: '/ads/' + a.id + '-' + a.slug + '/', hint: num(a.price) + ' ₽' })));
}

const cats = cfg.categories;
const catLinks = cats.map(c => ({ name: c.name, url: '/c/' + c.slug + '/' }));

page({
  file: 'index.html', url: '/',
  title: S.name + ' — бесплатные объявления с чатом и переводом сообщений',
  description: S.description,
  h1: 'Доска объявлений с чатом и переводом сообщений',
  intro: 'Первое объявление бесплатно. Покупатель и продавец общаются в чате, сообщения переводятся на язык собеседника.',
  body: '<h2>Категории</h2>' + listHtml(catLinks) +
        '<h2>Крупные города</h2>' + listHtml(topCities.slice(0, 24).map(c =>
          ({ name: c.name, url: '/city/' + c.slug + '/', hint: c.region }))) +
        '<p><a href="/geo/">Все регионы и города России →</a></p>' + steps(),
  faq: cfg.homeFaq,
  ld: [ldSite(), ldList('Категории объявлений', catLinks)]
});

for (const c of cats) {
  page({
    file: 'c/' + c.slug + '/index.html', url: '/c/' + c.slug + '/',
    title: c.h1 + ' — ' + S.name, description: c.description, h1: c.h1, intro: c.intro,
    crumbs: [{ name: 'Главная', url: '/' }, { name: c.name, url: '/c/' + c.slug + '/' }],
    body: '<h2>' + esc(c.name) + ' в крупных городах</h2>' + listHtml(topCities.map(t =>
            ({ name: t.name, url: '/c/' + c.slug + '/' + t.slug + '/', hint: t.region }))) +
          '<p><a href="/geo/">Выбрать другой город или регион →</a></p>' + steps(),
    faq: c.faq,
    ld: [ldList(c.h1, topCities.map(t => ({ name: t.name, url: '/c/' + c.slug + '/' + t.slug + '/' })))]
  });
}

const districts = new Map();
for (const r of regions) {
  const d = r.district || 'Прочие регионы';
  if (!districts.has(d)) districts.set(d, []);
  districts.get(d).push(r);
}
page({
  file: 'geo/index.html', url: '/geo/',
  title: 'Все регионы и города России — объявления | ' + S.name,
  description: 'Каталог регионов и городов России: ' + regions.length + ' регионов и ' + cities.length +
    ' городов. Выберите свой город и смотрите объявления с фото, ценами в рублях и чатом.',
  h1: 'Все регионы и города России',
  intro: 'Выберите регион, затем город: внутри — объявления по категориям, цены в рублях и чат с автором. Всего регионов: ' +
    regions.length + ', городов: ' + cities.length + '.',
  crumbs: [{ name: 'Главная', url: '/' }, { name: 'Все регионы и города', url: '/geo/' }],
  body: [...districts.entries()].map(([d, rs]) => '<h2>' + esc(d) + ' федеральный округ</h2>' +
      listHtml(rs.map(r => ({ name: r.name, url: '/region/' + r.slug + '/', hint: 'городов: ' + r.cityCount })))).join('') +
    '<h2>Категории</h2>' + listHtml(catLinks),
  faq: cfg.homeFaq,
  ld: [ldList('Регионы России', regions.map(r => ({ name: r.name, url: '/region/' + r.slug + '/' })))]
});

for (const r of regions) {
  const rUrl = '/region/' + r.slug + '/';
  const main = r.cities[0];
  page({
    file: 'region/' + r.slug + '/index.html', url: rUrl,
    title: 'Объявления: ' + r.name + ' — все города | ' + S.name,
    description: 'Объявления в регионе ' + r.name + ': ' + r.cityCount + ' городов, фото, цены в рублях, чат с автором. Первое объявление бесплатно.',
    h1: 'Объявления: ' + r.name,
    intro: r.name + ' — ' + (r.district || '') + ' федеральный округ. Городов в справочнике: ' + r.cityCount +
      '. Крупнейший город региона: ' + (main ? main.name + ' (' + num(main.population) + ' чел.)' : '—') + '.',
    crumbs: [{ name: 'Главная', url: '/' }, { name: 'Все регионы и города', url: '/geo/' }, { name: r.name, url: rUrl }],
    body: '<h2>Города региона</h2>' + listHtml(r.cities.map(c =>
            ({ name: c.name, url: '/city/' + c.slug + '/', hint: num(c.population) + ' чел.' }))) +
          (main ? '<h2>Категории в городе ' + esc(main.name) + '</h2>' + listHtml(cats.map(c =>
            ({ name: c.name, url: '/c/' + c.slug + '/' + main.slug + '/' }))) : '') + steps(),
    faq: cfg.cityFaq,
    ld: [ldList('Города региона ' + r.name, r.cities.map(c => ({ name: c.name, url: '/city/' + c.slug + '/' })))]
  });
}

for (const t of cities) {
  const url = '/city/' + t.slug + '/';
  const list = ads.filter(a => a.city === t.slug && a.active !== false);
  const crumbRegion = t.regionSlug ? [{ name: t.region, url: '/region/' + t.regionSlug + '/' }] : [];
  page({
    file: 'city/' + t.slug + '/index.html', url,
    title: 'Объявления ' + t.where + ' — бесплатно | ' + S.name,
    description: 'Частные объявления ' + t.where + ': недвижимость, транспорт, электроника, работа и услуги. Фото, цены в рублях, чат с автором.',
    h1: 'Объявления ' + t.where,
    intro: (t.region ? t.name + ' — ' + t.region + (t.district ? ', ' + t.district + ' федеральный округ' : '') + '. ' : '') +
      (t.population ? 'Население около ' + num(t.population) + ' человек. ' : '') +
      (t.note || 'Смотрите объявления по категориям, пишите автору в чат и договаривайтесь о встрече.'),
    crumbs: [{ name: 'Главная', url: '/' }, { name: 'Все регионы и города', url: '/geo/' }].concat(crumbRegion, [{ name: t.name, url }]),
    body: adsBlock(list) + '<h2>Категории ' + esc(t.where) + '</h2>' + listHtml(cats.map(c =>
            ({ name: c.name, url: '/c/' + c.slug + '/' + t.slug + '/' }))) + steps(),
    faq: cfg.cityFaq,
    robots: (list.length >= MIN_ADS || INDEX_EMPTY_CITIES) ? 'index, follow' : 'noindex, follow',
    ld: list.length ? [ldList('Объявления ' + t.where, list.map(a =>
      ({ name: a.title, url: '/ads/' + a.id + '-' + a.slug + '/' })))] : []
  });
}

const comboCities = COMBOS_TOP_ONLY ? topCities : cities;
for (const c of cats) {
  for (const t of comboCities) {
    const url = '/c/' + c.slug + '/' + t.slug + '/';
    const list = adsOf(c.slug, t.slug);
    page({
      file: 'c/' + c.slug + '/' + t.slug + '/index.html', url,
      title: c.h1 + ' ' + t.where + ' — бесплатно | ' + S.name,
      description: c.name + ' ' + t.where + ': объявления с фото и ценой в рублях, чат с автором. Первое объявление бесплатно.',
      h1: c.h1 + ' ' + t.where,
      intro: c.intro + (t.note ? ' ' + t.note : '') + (t.region ? ' Регион: ' + t.region + '.' : ''),
      crumbs: [{ name: 'Главная', url: '/' }, { name: c.name, url: '/c/' + c.slug + '/' }, { name: t.name, url }],
      body: adsBlock(list) + steps() +
        '<p><a href="/city/' + t.slug + '/">Все объявления ' + esc(t.where) + ' →</a></p>',
      faq: (c.faq || []).concat(cfg.cityFaq || []),
      robots: (list.length >= MIN_ADS || INDEX_EMPTY_CITIES) ? 'index, follow' : 'noindex, follow',
      ld: list.length ? [ldList(c.name + ' ' + t.where, list.map(a =>
        ({ name: a.title, url: '/ads/' + a.id + '-' + a.slug + '/' })))] : []
    });
  }
}

for (const a of ads) {
  const url = '/ads/' + a.id + '-' + a.slug + '/';
  const cat = cats.find(c => c.slug === a.category);
  const city = cityBySlug.get(a.city);
  page({
    file: 'ads/' + a.id + '-' + a.slug + '/index.html', url,
    title: a.title + ' — ' + num(a.price) + ' ₽ | ' + S.name,
    description: String(a.description || '').slice(0, 155),
    h1: a.title, intro: String(a.description || '').slice(0, 300),
    crumbs: [{ name: 'Главная', url: '/' }].concat(
      cat ? [{ name: cat.name, url: '/c/' + cat.slug + '/' }] : [],
      city ? [{ name: city.name, url: '/city/' + city.slug + '/' }] : [],
      [{ name: a.title, url }]),
    robots: a.active === false ? 'noindex, follow' : 'index, follow',
    body: '<p class="price">' + num(a.price) + ' ₽</p>' +
      (a.images || []).map(src => '<img src="' + esc(src) + '" alt="' + esc(a.title) + '" loading="lazy" width="640" height="480">').join('') +
      '<p><a class="btn" href="/chat/new?ad=' + esc(a.id) + '">Написать продавцу</a></p>',
    ld: [{ '@context': 'https://schema.org', '@type': 'Product', name: a.title,
      description: a.description, image: (a.images || []).map(s => BASE + s),
      offers: { '@type': 'Offer', price: String(a.price), priceCurrency: 'RUB',
        availability: a.active === false ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: BASE + url } }]
  });
}

page({
  file: '404.html', url: '/404.html', title: 'Страница не найдена — ' + S.name,
  description: 'Страница не найдена или объявление снято с публикации.',
  h1: 'Страница не найдена', intro: 'Возможно, объявление снято с публикации или адрес введён с ошибкой.',
  robots: 'noindex, follow', body: '<p><a href="/">Вернуться на главную</a> · <a href="/geo/">Все регионы и города</a></p>'
});

write('robots.txt', ['User-agent: *', 'Disallow: /chat/', 'Disallow: /profile/', 'Disallow: /api/',
  'Disallow: /auth/', 'Disallow: /payments/', 'Disallow: /search', 'Allow: /', '',
  'Sitemap: ' + BASE + '/sitemap.xml', ''].join('\n'));

write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => '  <url><loc>' + esc(u) + '</loc><lastmod>' + TODAY + '</lastmod><changefreq>weekly</changefreq></url>').join('\n') +
  '\n</urlset>\n');

write('seo-urls.txt', urls.join('\n') + '\n');
console.log('Создано страниц: ' + generated + ', из них в индексе: ' + urls.length);
console.log('Регионов: ' + regions.length + ', городов: ' + cities.length + ', крупных городов: ' + topCities.length);
console.log('Каталог: ' + OUT);
