import fs from 'node:fs';
import path from 'node:path';
import { q, tx } from './db.js';
import { env, nowSql, HttpError, rateLimit, BACKEND_DIR } from './util.js';
import { requireAuth } from './auth.js';

const TR = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };

function slugify(s) {
  return String(s).toLowerCase().split('').map(ch => TR[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

async function softUser(ctx) {
  try { return await requireAuth(ctx); } catch { return null; }
}

function isStaff(user) {
  return !!user && (user.role === 'admin' || user.role === 'moderator');
}

export async function seedGeo() {
  const have = await q('SELECT COUNT(*) AS n FROM regions');
  if (Number(have.rows[0].n) > 0) return;
  const file = path.resolve(BACKEND_DIR, '..', 'web', 'seo', 'data', 'geo.json');
  if (!fs.existsSync(file)) { console.warn('geo.json не найден, регионы не загружены'); return; }
  const geo = JSON.parse(fs.readFileSync(file, 'utf8'));
  await tx(async (c) => {
    let sort = 0;
    for (const r of geo.regions) {
      sort += 10;
      await c.query('INSERT INTO regions(code, name, slug, sort) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING',
        [r.slug, r.name, r.slug, sort]);
      for (const city of r.cities) {
        await c.query('INSERT INTO cities(region_code, name, slug, population) VALUES ($1, $2, $3, $4) ON CONFLICT (region_code, slug) DO NOTHING',
          [r.slug, city.name, city.slug, Number(city.population || 0)]);
      }
    }
  });
  console.log('Загружены регионы и города из geo.json');
}

export async function adLimit(userId) {
  const e = await q('SELECT kind, quantity FROM entitlements WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > $2)', [userId, nowSql()]);
  let limit = Number(env('FREE_ADS_LIMIT', '3'));
  let pro = false;
  for (const r of e.rows) {
    if (r.kind === 'pro') pro = true;
    if (r.kind === 'ad_credit') limit += Number(r.quantity || 0);
  }
  if (pro) limit = Math.max(limit, Number(env('PRO_ADS_LIMIT', '20')));
  return limit;
}

function str(v, min, max, label) {
  const s = String(v ?? '').trim();
  if (s.length < min) throw new HttpError(400, label + ': минимум ' + min + ' симв.');
  if (s.length > max) throw new HttpError(400, label + ': максимум ' + max + ' симв.');
  return s;
}

async function parseInput(body) {
  const title = str(body.title, 5, 100, 'Заголовок');
  const description = str(body.description, 10, 5000, 'Описание');
  const price = Number(body.price_rub ?? 0);
  if (!Number.isFinite(price) || price < 0 || price > 1000000000) throw new HttpError(400, 'Некорректная цена');
  const category = String(body.category || '');
  const cat = await q('SELECT 1 FROM categories WHERE code = $1 AND active = 1', [category]);
  if (!cat.rowCount) throw new HttpError(400, 'Категория не найдена');
  const region = String(body.region || '');
  const city = String(body.city || '');
  const c = await q('SELECT id FROM cities WHERE region_code = $1 AND slug = $2', [region, city]);
  if (!c.rowCount) throw new HttpError(400, 'Город не найден в выбранном регионе');
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 8).map(String) : [];
  for (const u of photos) {
    if (!/^(\/|https:\/\/)/.test(u) || u.length > 500) throw new HttpError(400, 'Некорректный адрес фото');
  }
  return {
    title, description, price_kopeks: Math.round(price * 100), category, region, city,
    city_id: c.rows[0].id, show_phone: body.show_phone ? 1 : 0, photos
  };
}

async function savePhotos(client, adId, photos) {
  await client.query('DELETE FROM ad_photos WHERE ad_id = $1', [adId]);
  let i = 0;
  for (const url of photos) await client.query('INSERT INTO ad_photos(ad_id, url, sort) VALUES ($1, $2, $3)', [adId, url, i++]);
}

const autoPublish = () => env('ADS_AUTOPUBLISH', '0') === '1';

const CARD_SQL = `
  SELECT a.id, a.slug, a.title, a.price_kopeks, a.category, a.region_code, a.city,
         a.status, a.published_at, a.boosted_until, a.views,
         c.name AS city_name, r.name AS region_name,
         (SELECT url FROM ad_photos p WHERE p.ad_id = a.id ORDER BY p.sort, p.id LIMIT 1) AS photo
    FROM ads a
    LEFT JOIN cities c ON c.id = a.city_id
    LEFT JOIN regions r ON r.code = a.region_code`;

function card(row) {
  return {
    id: row.id, slug: row.slug, title: row.title, price_rub: row.price_kopeks / 100,
    category: row.category, region: row.region_code, region_name: row.region_name || '',
    city: row.city, city_name: row.city_name || '', photo: row.photo || '',
    status: row.status, published_at: row.published_at, views: row.views,
    boosted: !!(row.boosted_until && row.boosted_until > nowSql())
  };
}

export const adsRoutes = [
  ['GET', '/api/geo/regions', async () => {
    const r = await q('SELECT code, name, slug FROM regions ORDER BY sort');
    return { regions: r.rows };
  }],

  ['GET', '/api/geo/cities', async (ctx) => {
    const region = String(ctx.query.region || '');
    if (!region) throw new HttpError(400, 'Укажите region');
    const r = await q('SELECT name, slug, population FROM cities WHERE region_code = $1 ORDER BY population DESC, name', [region]);
    return { cities: r.rows };
  }],

  ['GET', '/api/categories', async () => {
    const r = await q('SELECT code, title FROM categories WHERE active = 1 ORDER BY sort');
    return { categories: r.rows };
  }],

  ['GET', '/api/ads', async (ctx) => {
    const p = [];
    const add = (v) => { p.push(v); return '$' + p.length; };
    const where = ["a.status = 'published'"];
    const f = ctx.query;
    if (f.region) where.push('a.region_code = ' + add(String(f.region)));
    if (f.city) where.push('a.city = ' + add(String(f.city)));
    if (f.category) where.push('a.category = ' + add(String(f.category)));
    if (f.price_min) where.push('a.price_kopeks >= ' + add(Math.round(Number(f.price_min) * 100) || 0));
    if (f.price_max) where.push('a.price_kopeks <= ' + add(Math.round(Number(f.price_max) * 100) || 0));
    if (f.q) {
      const t = add('%' + String(f.q).trim().slice(0, 60).replace(/[%_\\]/g, '\\$&') + '%');
      where.push("(a.title LIKE " + t + " ESCAPE '\\' OR a.description LIKE " + t + " ESCAPE '\\')");
    }
    const whereSql = ' WHERE ' + where.join(' AND ');
    const total = await q('SELECT COUNT(*) AS n FROM ads a' + whereSql, p);
    const limit = Math.min(Math.max(Number(f.limit) || 20, 1), 50);
    const page = Math.max(Number(f.page) || 1, 1);
    const now = add(nowSql());
    const lim = add(limit);
    const off = add((page - 1) * limit);
    const rows = await q(CARD_SQL + whereSql +
      ' ORDER BY CASE WHEN a.boosted_until > ' + now + ' THEN 1 ELSE 0 END DESC, a.published_at DESC, a.id DESC LIMIT ' + lim + ' OFFSET ' + off, p);
    return { total: Number(total.rows[0].n), page, limit, items: rows.rows.map(card) };
  }],

  ['GET', '/api/ads/item', async (ctx) => {
    const id = Number(ctx.query.id);
    if (!id) throw new HttpError(400, 'Укажите id');
    const r = await q(CARD_SQL + ' WHERE a.id = $1', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Объявление не найдено');
    const row = r.rows[0];
    const user = await softUser(ctx);
    const full = await q('SELECT a.description, a.contact_phone, a.show_phone, a.user_id, a.reject_reason, u.display_name FROM ads a JOIN users u ON u.id = a.user_id WHERE a.id = $1', [id]);
    const extra = full.rows[0];
    const own = !!user && user.id === extra.user_id;
    if (row.status !== 'published' && !own && !isStaff(user)) throw new HttpError(404, 'Объявление не найдено');
    if (row.status === 'published' && !own) {
      await q('UPDATE ads SET views = views + 1 WHERE id = $1', [id]);
      await q('INSERT INTO ad_views(ad_id, day, views) VALUES ($1, $2, 1) ON CONFLICT (ad_id, day) DO UPDATE SET views = ad_views.views + 1',
        [id, nowSql().slice(0, 10)]);
    }
    const photos = await q('SELECT url FROM ad_photos WHERE ad_id = $1 ORDER BY sort, id', [id]);
    return {
      ad: {
        ...card(row), description: extra.description, seller: extra.display_name,
        phone: extra.show_phone ? extra.contact_phone : '',
        photos: photos.rows.map(x => x.url), own,
        reject_reason: own || isStaff(user) ? extra.reject_reason : ''
      }
    };
  }],

  ['GET', '/api/ads/mine', async (ctx) => {
    const user = await requireAuth(ctx);
    const r = await q(CARD_SQL + " WHERE a.user_id = $1 AND a.status <> 'removed' ORDER BY a.id DESC", [user.id]);
    return { items: r.rows.map(card) };
  }],

  ['POST', '/api/ads/create', async (ctx) => {
    const user = await requireAuth(ctx);
    if (!rateLimit('adcreate:' + user.id, 10, 3600000)) throw new HttpError(429, 'Слишком много объявлений за час');
    const d = await parseInput(ctx.body);
    const used = await q("SELECT COUNT(*) AS n FROM ads WHERE user_id = $1 AND status IN ('moderation', 'published')", [user.id]);
    const limit = await adLimit(user.id);
    if (Number(used.rows[0].n) >= limit) throw new HttpError(402, 'Лимит объявлений исчерпан (' + limit + '). Купите дополнительное объявление или подписку «Про»');
    const status = autoPublish() ? 'published' : 'moderation';
    const id = await tx(async (c) => {
      const ins = await c.query(
        `INSERT INTO ads(user_id, slug, title, description, price_kopeks, category, city, region_code, city_id, contact_phone, show_phone, status, published_at)
         VALUES ($1, '', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [user.id, d.title, d.description, d.price_kopeks, d.category, d.city, d.region, d.city_id,
         (String(user.phone).startsWith('email:') ? '' : user.phone), d.show_phone, status, status === 'published' ? nowSql() : null]);
      const adId = ins.rows[0].id;
      await c.query('UPDATE ads SET slug = $1 WHERE id = $2', [(slugify(d.title) || 'ad') + '-' + adId, adId]);
      await savePhotos(c, adId, d.photos);
      return adId;
    });
    return { ok: true, id, status };
  }],

  ['POST', '/api/ads/update', async (ctx) => {
    const user = await requireAuth(ctx);
    const id = Number(ctx.body.id);
    const cur = await q("SELECT user_id, status FROM ads WHERE id = $1 AND status <> 'removed'", [id]);
    if (!cur.rowCount || cur.rows[0].user_id !== user.id) throw new HttpError(404, 'Объявление не найдено');
    const d = await parseInput(ctx.body);
    const status = autoPublish() ? 'published' : 'moderation';
    await tx(async (c) => {
      await c.query(
        `UPDATE ads SET title = $1, description = $2, price_kopeks = $3, category = $4, city = $5, region_code = $6,
                city_id = $7, show_phone = $8, status = $9, reject_reason = '', updated_at = $10,
                published_at = CASE WHEN $9 = 'published' THEN COALESCE(published_at, $10) ELSE NULL END
          WHERE id = $11`,
        [d.title, d.description, d.price_kopeks, d.category, d.city, d.region, d.city_id, d.show_phone, status, nowSql(), id]);
      await c.query('UPDATE ads SET slug = $1 WHERE id = $2', [(slugify(d.title) || 'ad') + '-' + id, id]);
      await savePhotos(c, id, d.photos);
    });
    return { ok: true, id, status };
  }],

  ['POST', '/api/ads/remove', async (ctx) => {
    const user = await requireAuth(ctx);
    const id = Number(ctx.body.id);
    const r = await q("UPDATE ads SET status = 'removed', removed_at = $1 WHERE id = $2 AND user_id = $3 AND status <> 'removed'", [nowSql(), id, user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Объявление не найдено');
    return { ok: true };
  }],

  ['POST', '/api/ads/favorite', async (ctx) => {
    const user = await requireAuth(ctx);
    const id = Number(ctx.body.id);
    const ad = await q("SELECT 1 FROM ads WHERE id = $1 AND status = 'published'", [id]);
    if (!ad.rowCount) throw new HttpError(404, 'Объявление не найдено');
    const del = await q('DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2', [user.id, id]);
    if (del.rowCount) return { ok: true, favorite: false };
    await q('INSERT INTO favorites(user_id, ad_id) VALUES ($1, $2)', [user.id, id]);
    return { ok: true, favorite: true };
  }],

  ['GET', '/api/ads/favorites', async (ctx) => {
    const user = await requireAuth(ctx);
    const r = await q(CARD_SQL + " JOIN favorites f ON f.ad_id = a.id WHERE f.user_id = $1 AND a.status = 'published' ORDER BY f.created_at DESC", [user.id]);
    return { items: r.rows.map(card) };
  }]
];
