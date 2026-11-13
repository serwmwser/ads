import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { legalDocs } from './legal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'public');
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };

const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'seo.json'), 'utf8'));
const S = cfg.site;
const P = S.pages || {};
const IS_PAGES = flag('pages');
const BASE = (IS_PAGES ? (val('base', P.basePath || '/ads')) : '').replace(/\/+$/, '');
const ORIGIN = (IS_PAGES ? val('origin', P.origin || 'https://serwmwser.github.io') : S.domain).replace(/\/+$/, '');
const INDEXABLE = IS_PAGES ? (flag('indexable') || P.indexable === true) : true;
const CUSTOM = IS_PAGES ? (P.customDomain || '') : '';
const GEOCFG = cfg.geo || {};
const MIN_ADS = GEOCFG.minAds ?? 3;
const INDEX_EMPTY = GEOCFG.indexEmptyCityPages === true;
const TOP_ONLY = GEOCFG.combosTopOnly !== false;
const TODAY = new Date().toISOString().slice(0, 10);
const urls = [];
let pages = 0;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => Number(n || 0).toLocaleString('ru-RU');
const link = (p) => BASE + p;
const abs = (p) => ORIGIN + BASE + p;

const demo = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'demo-ads.json'), 'utf8'));
let geo = null;
const geoFile = path.join(HERE, 'data', 'geo.json');
if (fs.existsSync(geoFile)) geo = JSON.parse(fs.readFileSync(geoFile, 'utf8'));

const HUES = { nedvizhimost: '#2B44FF', transport: '#FF6B2C', elektronika: '#FF2E88', 'rabota-uslugi': '#0FB5A5' };
const EMOJI = { nedvizhimost: '&#127968;', transport: '&#128663;', elektronika: '&#128187;', 'rabota-uslugi': '&#129520;' };
const ICONS = {
  nedvizhimost: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  transport: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v-3l2-5h12l2 5v3M4 16h16M4 16v3h3v-3M17 16v3h3v-3"/><circle cx="8" cy="13" r="1"/><circle cx="16" cy="13" r="1"/></svg>',
  elektronika: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg>',
  'rabota-uslugi': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>'
};
const cats = cfg.categories.map(c => ({ ...c, hue: HUES[c.slug] || '#7C5CFF', emoji: EMOJI[c.slug] || '&#128230;' }));
const catClient = cats.map(c => ({ slug: c.slug, name: c.name, emoji: c.emoji }));

const custom = new Map((cfg.cities || []).map(c => [c.slug, c]));
const cities = [];
const regions = (geo && geo.regions) ? geo.regions : [];
if (regions.length) {
  for (const r of regions) for (const c of r.cities) {
    const ex = custom.get(c.slug) || {};
    cities.push({ name: c.name, slug: c.slug, population: c.population, top: !!c.top, region: r.name, regionSlug: r.slug, district: r.district, where: ex.where || ('в городе ' + c.name), note: ex.note || '' });
  }
} else {
  for (const c of (cfg.cities || [])) cities.push({ name: c.name, slug: c.slug, population: 0, top: true, region: '', regionSlug: '', district: '', where: c.where || ('в городе ' + c.name), note: c.note || '' });
}
const topCities = cities.filter(c => c.top);
const cityBySlug = new Map(cities.map(c => [c.slug, c]));
const demoByCat = (slug) => demo.filter(a => a.cat === slug).length;
const demoByCity = (name) => demo.filter(a => a.city === name).length;

function write(file, content) {
  const full = path.join(OUT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const TPL = fs.readFileSync(path.join(HERE, 'theme', 'page.html'), 'utf8');

function ldCrumbs(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.url) })) };
}
function ldFaq(faq) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}
function ldList(name, items) {
  return { '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length, itemListElement: items.slice(0, 300).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: abs(it.url) })) };
}

function page(o) {
  const ld = [{ '@context': 'https://schema.org', '@type': 'Organization', name: S.org.name, url: abs('/'), email: S.org.email, taxID: S.org.inn, areaServed: 'RU' }].concat(o.ld || []);
  if (o.crumbs && o.crumbs.length > 1) ld.push(ldCrumbs(o.crumbs));
  if (o.faq && o.faq.length) ld.push(ldFaq(o.faq));
  const robots = o.robots || (INDEXABLE ? 'index, follow' : 'noindex, follow');
  const crumbs = (o.crumbs || [{ name: 'Главная', url: '/' }]).map((c, i, arr) =>
    i === arr.length - 1 ? '<span>' + esc(c.name) + '</span>' : '<a href="' + link(c.url) + '">' + esc(c.name) + '</a>').join('<span>/</span>');
  const values = {
    base: BASE, title: esc(o.title), description: esc(o.description), robots,
    canonical: abs(o.url), origin: ORIGIN, siteName: esc(S.name), ogImage: abs('/assets/cover.png'),
    h1: esc(o.h1), lead: esc(o.lead || ''), hero: o.hero || '', body: o.body || '',
    crumbs, year: String(new Date().getFullYear()), orgName: esc(S.org.name), orgInn: esc(S.org.inn), orgEmail: esc(S.org.email),
    navHome: link('/'), navGeo: link('/geo/'), navCats: link('/#categories'), navHow: link('/#how'), navPrices: link('/#pricing'),
    legalPrivacy: link('/legal/privacy/'), legalConsent: link('/legal/consent/'), legalOffer: link('/legal/offer/'), legalRules: link('/legal/rules/'),
    boardAttr: o.board ? ' data-board data-cat="' + (o.board.cat || '') + '" data-city="' + (o.board.city || '') + '"' : '',
    scripts: (o.board ? '<script src="' + link('/assets/demo-ads.js') + '" defer></script>' : '') +
      '<script>window.ADS_CATS=' + JSON.stringify(catClient) + ';</script>' +
      '<script src="' + link('/assets/app.js') + '" defer></script>',
    jsonld: ld.map(x => '<script type="application/ld+json">' + JSON.stringify(x) + '<\/script>').join('\n')
  };
  write(o.file, TPL.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m)));
  pages++;
  if (robots.indexOf('noindex') !== 0) urls.push(abs(o.url));
}

function boardSection(opts) {
  const o = opts || {};
  return '<section class="sec rev" id="board"><div class="sec-head"><div><span class="eyebrow"><span class="dot"></span>Живая витрина</span>' +
    '<h2 style="margin-top:12px">Объявления рядом с вами</h2><p>Демо-лента с настоящими сценариями: поиск, фильтры, избранное, черновики и чат с переводом. Черновики сохраняются только в вашем браузере.</p></div>' +
    '<button class="btn btn-primary" data-new>+ Разместить объявление</button></div>' +
    '<div class="board"' + (o.attr || '') + '>' +
    '<div class="toolbar">' +
    '<div class="field"><label>Поиск</label><input type="search" data-f-q placeholder="Что ищете? Например, велосипед"></div>' +
    '<div class="field"><label>Категория</label><select data-f-cat><option value="">Все категории</option>' + cats.map(c => '<option value="' + c.slug + '">' + esc(c.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Город</label><select data-f-city><option value="">Все города</option></select></div>' +
    '<div class="field"><label>Сортировка</label><select data-f-sort><option value="new">Сначала новые</option><option value="cheap">Сначала дешёвые</option><option value="expensive">Сначала дорогие</option><option value="popular">Популярные</option></select></div>' +
    '<div class="field"><label>Вид</label><button class="btn btn-sm" data-view-toggle style="height:42px">Список</button></div>' +
    '</div>' +
    '<div class="chips"><button class="chip" data-f-fav>&#9825; Только избранное</button>' +
    '<span class="chip" style="cursor:default" data-count-label>0 объявлений</span>' +
    demoCities().map(n => '<button class="chip" data-city-chip="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' +
    '<div class="bulk" data-bulk hidden><b>Выбрано: <span data-bulk-n>0</span></b><button class="btn btn-sm" data-del-selected style="color:var(--danger)">Удалить</button><button class="btn btn-sm btn-ghost" data-clear-selected>Снять выделение</button><span style="color:var(--muted);font-size:13px">Перетаскивайте черновики, чтобы менять порядок</span></div>' +
    '<div class="grid" data-grid></div>' +
    '<div class="views" data-views></div>' +
    '</div></section>';
}
function demoCities() { const s = []; demo.forEach(a => { if (s.indexOf(a.city) < 0) s.push(a.city); }); return s; }
function stepsSection() {
  const st = [['Войдите по номеру', 'Российский номер телефона и код из СМС. Никаких зарубежных аккаунтов.'],
  ['Добавьте объявление', 'Заголовок, цена в рублях, до 10 фотографий, категория и город.'],
  ['Пройдите проверку', 'Модерация смотрит объявление, жалобы и блокировки работают с первого дня.'],
  ['Общайтесь в чате', 'Сообщения переводятся на язык собеседника, история сохраняется.']];
  return '<section class="sec rev" id="how"><div class="sec-head"><div><span class="eyebrow">Как это работает</span><h2 style="margin-top:12px">Четыре шага до сделки</h2></div></div><div class="steps">' +
    st.map(s => '<div class="step"><b>' + esc(s[0]) + '</b><p style="color:var(--muted);font-size:14.5px;margin:8px 0 0">' + esc(s[1]) + '</p></div>').join('') + '</div></section>';
}
function safetySection() {
  const t = [['var(--ok)', 'Осмотр при встрече', 'Проверяйте товар до передачи денег и встречайтесь в людных местах.'],
  ['var(--danger)', 'Никакой предоплаты', 'Просьба перевести задаток или сообщить код из СМС — признак мошенничества.'],
  ['var(--info)', 'Жалоба в один тап', 'Кнопка «Пожаловаться» есть в каждом объявлении и чате, ответ — до 72 часов.']];
  return '<section class="sec rev" id="safety"><div class="sec-head"><div><span class="eyebrow">Безопасность</span><h2 style="margin-top:12px">Правила, которые берегут деньги</h2></div></div><div class="tiles">' +
    t.map(x => '<div class="tile" style="--hue:' + x[0] + '"><b>' + esc(x[1]) + '</b><p style="margin:8px 0 0;color:var(--muted);font-size:14.5px">' + esc(x[2]) + '</p></div>').join('') + '</div></section>';
}
function pricingSection() {
  const plans = [['Первое объявление', '0', 'Одно активное объявление, чат и перевод, жалобы и модерация', false, 'Разместить бесплатно'],
  ['Дополнительное', '99', 'Ещё одно объявление на 30 дней, поднятие доступно отдельно', false, 'Выбрать за 99 ₽'],
  ['Подписка «Про»', '299', 'До 20 активных объявлений, поднятия в ленте, значок в карточке', true, 'Оформить за 299 ₽']];
  return '<section class="sec rev" id="pricing"><div class="sec-head"><div><span class="eyebrow">Тарифы</span><h2 style="margin-top:12px">Понятные цены в рублях</h2><p>Поднятие объявления — 49 ₽ на 7 дней. Оплата картой или через СБП, чек приходит автоматически.</p></div></div><div class="plans">' +
    plans.map(p => '<div class="plan' + (p[3] ? ' hot' : '') + '">' + (p[3] ? '<span class="badge" style="position:static;align-self:flex-start">Выгодно</span>' : '') +
      '<b>' + esc(p[0]) + '</b><span class="p">' + p[1] + ' &#8381;</span><ul><li>' + esc(p[2]) + '</li><li>Без комиссии с продажи</li><li>Отмена в любой момент</li></ul>' +
      '<button class="btn ' + (p[3] ? 'btn-primary' : '') + '" data-new>' + esc(p[4]) + '</button></div>').join('') + '</div></section>';
}
function faqSection(faq) {
  if (!faq || !faq.length) return '';
  return '<section class="sec rev" id="faq"><div class="sec-head"><div><span class="eyebrow">Вопросы</span><h2 style="margin-top:12px">Коротко о главном</h2></div></div>' +
    faq.map(f => '<details><summary>' + esc(f.q) + '</summary><p style="margin:12px 0 0;color:var(--muted)">' + esc(f.a) + '</p></details>').join('') + '</section>';
}
function listGrid(items) {
  return '<ul class="cards">' + items.map(i => '<li><a href="' + link(i.url) + '">' + esc(i.name) + '</a>' + (i.hint ? '<small>' + esc(i.hint) + '</small>' : '') + '</li>').join('') + '</ul>';
}
function districtSection() {
  const map = new Map();
  cities.forEach(c => { const d = c.district || 'Россия'; map.set(d, (map.get(d) || 0) + 1); });
  const arr = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const max = arr.length ? arr[0][1] : 1;
  const hues = ['#FF6B2C', '#2B44FF', '#C6F02B', '#FF2E88', '#0FB5A5', '#7C5CFF', '#F5A524', '#23B5E8'];
  return '<section class="sec rev" id="geo"><div class="sec-head"><div><span class="eyebrow">География</span><h2 style="margin-top:12px">Вся страна, а не только столицы</h2>' +
    '<p>' + num(regions.length) + ' регионов и ' + num(cities.length) + ' городов. Нажмите на строку, чтобы открыть города округа.</p></div>' +
    '<a class="btn" href="' + link('/geo/') + '">Открыть каталог регионов</a></div><div class="bars">' +
    arr.map((d, i) => '<div class="bar"><span>' + esc(d[0]) + '</span><u style="--hue:' + hues[i % hues.length] + '" data-w="' + Math.round(d[1] / max * 100) + '"></u><b>' + num(d[1]) + '</b></div>').join('') +
    '</div><div class="chips" style="margin-top:18px">' + topCities.slice(0, 14).map(c => '<a class="chip" href="' + link('/city/' + c.slug + '/') + '">' + esc(c.name) + '</a>').join('') + '</div></section>';
}
function heroSection() {
  const s = demo.slice(0, 3);
  return '<section class="hero"><div class="wrap"><div class="hero-grid"><div>' +
    '<span class="eyebrow"><span class="dot"></span>Первое объявление бесплатно</span>' +
    '<h1>Доска объявлений, где чат <em>говорит на вашем языке</em></h1>' +
    '<p class="lead">Продавайте и покупайте рядом с домом: фотографии, честная цена в рублях и чат с переводом сообщений. Без комиссии с продажи и без зарубежных аккаунтов.</p>' +
    '<div class="hero-cta"><button class="btn btn-primary" data-new>Разместить объявление</button>' +
    '<button class="btn" data-search-open>Найти свой город</button><a class="btn btn-ghost" href="#board">Смотреть витрину</a></div>' +
    '<div class="stats"><div class="stat"><b data-count="' + regions.length + '">0</b><span>регионов</span></div>' +
    '<div class="stat"><b data-count="' + cities.length + '">0</b><span>городов</span></div>' +
    '<div class="stat"><b data-count="' + cats.length + '">0</b><span>категории</span></div>' +
    '<div class="stat"><b>0 &#8381;</b><span>первое объявление</span></div></div></div>' +
    '<div class="stack"><span class="tag">Без комиссии</span>' +
    s.map(a => '<div class="scard"><div class="ph" style="--h1:' + a.h1 + ';--h2:' + a.h2 + '"><b>' + a.emoji + '</b></div><div class="sb"><b>' + esc(a.title.slice(0, 34)) + '…</b><span>' + num(a.price) + ' &#8381; · ' + esc(a.city) + '</span></div></div>').join('') +
    '</div></div></div></section>';
}

/* ---------- pages ---------- */
page({
  file: 'index.html', url: '/', hero: heroSection(),
  title: S.name + ' — бесплатные объявления с чатом и переводом',
  description: S.description, h1: '', lead: '',
  body: '<div class="wrap">' +
    '<section class="sec rev" id="categories" style="border-top:none"><div class="sec-head"><div><span class="eyebrow">Категории</span><h2 style="margin-top:12px">Четыре раздела, ноль лишнего</h2><p>Всё, что нужно городу: жильё, транспорт, техника и услуги.</p></div></div><div class="cats">' +
    cats.map(c => '<a class="cat" href="' + link('/c/' + c.slug + '/') + '" style="--hue:' + c.hue + '"><i>' + ICONS[c.slug] + '</i><b>' + esc(c.name) + '</b><span>' + demoByCat(c.slug) + ' объявлений в витрине</span></a>').join('') +
    '</div></section>' + boardSection() + districtSection() + stepsSection() + safetySection() + pricingSection() + faqSection(cfg.homeFaq) + '</div>',
  board: {}, faq: cfg.homeFaq, ld: [ldList('Категории', cats.map(c => ({ name: c.name, url: '/c/' + c.slug + '/' })))]
});

for (const c of cats) {
  page({
    file: 'c/' + c.slug + '/index.html', url: '/c/' + c.slug + '/',
    title: c.h1 + ' — ' + S.name, description: c.description, h1: c.h1, lead: c.intro,
    crumbs: [{ name: 'Главная', url: '/' }, { name: c.name, url: '/c/' + c.slug + '/' }],
    body: '<div class="wrap">' + boardSection({ attr: ' data-board data-cat="' + c.slug + '" data-city=""' }) +
      '<section class="sec rev"><div class="sec-head"><div><h2>' + esc(c.name) + ' в городах</h2></div><a class="btn btn-sm" href="' + link('/geo/') + '">Все регионы</a></div>' +
      listGrid(topCities.map(t => ({ name: t.name, url: '/c/' + c.slug + '/' + t.slug + '/', hint: t.region }))) + '</section>' +
      stepsSection() + faqSection(c.faq) + '</div>',
    board: { cat: c.slug }, faq: c.faq,
    ld: [ldList(c.h1, topCities.map(t => ({ name: t.name, url: '/c/' + c.slug + '/' + t.slug + '/' })))]
  });
}

const districts = new Map();
regions.forEach(r => { const d = r.district || 'Прочие'; if (!districts.has(d)) districts.set(d, []); districts.get(d).push(r); });
page({
  file: 'geo/index.html', url: '/geo/',
  title: 'Все регионы и города России — ' + S.name,
  description: 'Каталог регионов и городов: ' + regions.length + ' регионов, ' + cities.length + ' городов. Объявления с фото, ценами в рублях и чатом.',
  h1: 'Все регионы и города России', lead: 'Выберите регион и город. Поиск по названию работает мгновенно — нажмите Ctrl + K в любой момент.',
  crumbs: [{ name: 'Главная', url: '/' }, { name: 'Регионы и города', url: '/geo/' }],
  body: '<div class="wrap"><div class="chips"><button class="chip on" data-search-open>&#128269; Поиск города или региона</button>' +
    topCities.slice(0, 12).map(c => '<a class="chip" href="' + link('/city/' + c.slug + '/') + '">' + esc(c.name) + '</a>').join('') + '</div>' +
    [...districts.entries()].map(([d, rs]) => '<section class="sec rev"><div class="sec-head"><div><h2>' + esc(d) + ' федеральный округ</h2><p>' + rs.length + ' регионов</p></div></div>' +
      listGrid(rs.map(r => ({ name: r.name, url: '/region/' + r.slug + '/', hint: 'городов: ' + r.cityCount }))) + '</section>').join('') + '</div>',
  ld: [ldList('Регионы России', regions.map(r => ({ name: r.name, url: '/region/' + r.slug + '/' })))]
});

for (const r of regions) {
  const main = r.cities[0];
  page({
    file: 'region/' + r.slug + '/index.html', url: '/region/' + r.slug + '/',
    title: 'Объявления: ' + r.name + ' — ' + S.name,
    description: 'Объявления в регионе ' + r.name + ': ' + r.cityCount + ' городов, фото, цены в рублях, чат с автором.',
    h1: 'Объявления: ' + r.name,
    lead: r.name + ' — ' + (r.district || '') + ' федеральный округ. Городов: ' + r.cityCount + '. Крупнейший: ' + (main ? main.name + ' (' + num(main.population) + ' чел.)' : '—') + '.',
    crumbs: [{ name: 'Главная', url: '/' }, { name: 'Регионы', url: '/geo/' }, { name: r.name, url: '/region/' + r.slug + '/' }],
    body: '<div class="wrap"><section class="sec rev" style="border-top:none"><div class="sec-head"><div><h2>Города региона</h2></div></div>' +
      listGrid(r.cities.map(c => ({ name: c.name, url: '/city/' + c.slug + '/', hint: num(c.population) + ' чел.' }))) + '</section>' +
      boardSection() + '</div>',
    board: {}, ld: [ldList('Города ' + r.name, r.cities.map(c => ({ name: c.name, url: '/city/' + c.slug + '/' })))]
  });
}

for (const t of cities) {
  const n = demoByCity(t.name);
  page({
    file: 'city/' + t.slug + '/index.html', url: '/city/' + t.slug + '/',
    title: 'Объявления ' + t.where + ' — ' + S.name,
    description: 'Частные объявления ' + t.where + ': недвижимость, транспорт, электроника, работа и услуги. Фото, цены в рублях, чат.',
    h1: 'Объявления ' + t.where,
    lead: (t.region ? t.name + ' — ' + t.region + '. ' : '') + (t.population ? 'Население около ' + num(t.population) + ' человек. ' : '') + (t.note || 'Выберите категорию, пишите автору в чат и договаривайтесь о встрече.'),
    crumbs: [{ name: 'Главная', url: '/' }, { name: 'Регионы', url: '/geo/' }].concat(t.regionSlug ? [{ name: t.region, url: '/region/' + t.regionSlug + '/' }] : [], [{ name: t.name, url: '/city/' + t.slug + '/' }]),
    body: '<div class="wrap"><div class="chips">' + cats.map(c => '<a class="chip" href="' + link('/c/' + c.slug + '/' + t.slug + '/') + '">' + esc(c.name) + '</a>').join('') + '</div>' +
      boardSection({ attr: ' data-board data-cat="" data-city="' + esc(t.name) + '"' }) + stepsSection() + faqSection(cfg.cityFaq) + '</div>',
    board: { city: t.name }, faq: cfg.cityFaq,
    robots: (n >= MIN_ADS || INDEX_EMPTY || !INDEXABLE) ? undefined : 'noindex, follow'
  });
}

for (const c of cats) for (const t of (TOP_ONLY ? topCities : cities)) {
  const url = '/c/' + c.slug + '/' + t.slug + '/';
  const n = demo.filter(a => a.cat === c.slug && a.city === t.name).length;
  page({
    file: 'c/' + c.slug + '/' + t.slug + '/index.html', url,
    title: c.h1 + ' ' + t.where + ' — ' + S.name,
    description: c.name + ' ' + t.where + ': объявления с фото и ценой в рублях, чат с автором, первое объявление бесплатно.',
    h1: c.h1 + ' ' + t.where, lead: c.intro + (t.region ? ' Регион: ' + t.region + '.' : ''),
    crumbs: [{ name: 'Главная', url: '/' }, { name: c.name, url: '/c/' + c.slug + '/' }, { name: t.name, url }],
    body: '<div class="wrap">' + boardSection({ attr: ' data-board data-cat="' + c.slug + '" data-city="' + esc(t.name) + '"' }) + stepsSection() + faqSection(c.faq) + '</div>',
    board: { cat: c.slug, city: t.name }, faq: c.faq,
    robots: (n >= MIN_ADS || INDEX_EMPTY || !INDEXABLE) ? undefined : 'noindex, follow'
  });
}

for (const d of legalDocs(cfg)) {
  page({
    file: 'legal/' + d.slug + '/index.html', url: '/legal/' + d.slug + '/',
    title: d.title, description: d.description, h1: d.h1, lead: d.intro,
    crumbs: [{ name: 'Главная', url: '/' }, { name: d.h1, url: '/legal/' + d.slug + '/' }],
    body: '<div class="wrap legal">' + d.blocks.map(b => '<h2>' + esc(b.h2) + '</h2>' +
      (b.p ? '<p>' + esc(b.p) + '</p>' : '') + (b.items ? '<ul>' + b.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '')).join('') +
      '<p style="margin-top:26px;color:var(--muted)">Редакция от ' + TODAY + '. Вопросы: ' + esc(S.org.email) + '</p></div>'
  });
}

page({
  file: '404.html', url: '/404.html', title: 'Страница не найдена — ' + S.name,
  description: 'Объявление снято с публикации или адрес введён с ошибкой.',
  h1: 'Такой страницы нет', lead: 'Возможно, объявление уже продано. Загляните в витрину или найдите свой город.',
  robots: 'noindex, follow',
  body: '<div class="wrap"><div class="hero-cta"><a class="btn btn-primary" href="' + link('/') + '">На главную</a><a class="btn" href="' + link('/geo/') + '">Все регионы</a><button class="btn btn-ghost" data-search-open>Поиск города</button></div>' + boardSection() + '</div>',
  board: {}
});

/* ---------- assets ---------- */
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.copyFileSync(path.join(HERE, 'theme', 'app.css'), path.join(OUT, 'assets', 'app.css'));
fs.copyFileSync(path.join(HERE, 'theme', 'app.js'), path.join(OUT, 'assets', 'app.js'));
write('assets/demo-ads.js', 'window.ADS_DEMO=' + JSON.stringify(demo) + ';');
write('assets/geo-search.js', 'window.ADS_GEO=' + JSON.stringify(cities.map(c => ({ n: c.name, s: c.slug, r: c.region }))) + ';');
write('.nojekyll', '');
if (CUSTOM) write('CNAME', CUSTOM + '\n');
write('assets/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6B2C"/><stop offset=".5" stop-color="#FF2E88"/><stop offset="1" stop-color="#2B44FF"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M18 22h20l10 10-16 16-14-14z" fill="#FFFCF6"/><circle cx="26" cy="30" r="4" fill="#FF6B2C"/></svg>');

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function coverPng() {
  const W = 1200, H = 630, raw = Buffer.alloc((W * 3 + 1) * H);
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  const cards = [[90, 190, 300, 300, 255, 107, 44], [430, 150, 300, 340, 43, 68, 255], [770, 210, 300, 280, 255, 46, 136]];
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0;
    for (let x = 0; x < W; x++) {
      const t = x / W * 0.62 + y / H * 0.38;
      let r = mix(255, 43, t), g = mix(107, 68, t), b = mix(44, 255, t);
      for (const c of cards) {
        const [cx, cy, cw, ch, cr, cg, cb] = c;
        if (x >= cx && x < cx + cw && y >= cy && y < cy + ch) {
          const rad = 26, ix = Math.min(x - cx, cx + cw - 1 - x), iy = Math.min(y - cy, cy + ch - 1 - y);
          const inside = ix >= rad || iy >= rad || (rad - ix) ** 2 + (rad - iy) ** 2 <= rad * rad;
          if (inside) {
            if (y < cy + 14) { r = cr; g = cg; b = cb; }
            else { r = 255; g = 252; b = 246; }
          }
        }
      }
      const dx = x - 1060, dy = y - 120, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 74 && d > 20) { r = 198; g = 240; b = 43; }
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
try { write('assets/cover.png', coverPng()); } catch (e) { console.warn('cover.png пропущен: ' + e.message); }

write('robots.txt', ['User-agent: *', 'Disallow: /chat/', 'Disallow: /profile/', 'Disallow: /api/', 'Disallow: /auth/', 'Disallow: /payments/', 'Disallow: /search',
  INDEXABLE ? 'Allow: /' : 'Disallow: /', '', 'Sitemap: ' + abs('/sitemap.xml'), ''].join('\n'));
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => '  <url><loc>' + esc(u) + '</loc><lastmod>' + TODAY + '</lastmod><changefreq>weekly</changefreq></url>').join('\n') + '\n</urlset>\n');
write('seo-urls.txt', urls.join('\n') + '\n');

console.log('Режим: ' + (IS_PAGES ? 'GitHub Pages' : 'свой домен') + ' · база: "' + BASE + '" · origin: ' + ORIGIN);
console.log('Страниц: ' + pages + ' · в sitemap: ' + urls.length + ' · индексация: ' + (INDEXABLE ? 'включена' : 'выключена'));
console.log('Каталог: ' + OUT);
