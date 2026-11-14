import { q } from './db.js';
import { nowSql, HttpError } from './util.js';
import { requireAuth } from './auth.js';
import { adLimit } from './ads.js';

const emailOf = (phone) => (String(phone).startsWith('email:') ? String(phone).slice(6) : '');
const phoneOf = (phone) => (String(phone).startsWith('email:') ? '' : phone);

export const profileRoutes = [
  ['GET', '/api/profile/summary', async (ctx) => {
    const user = await requireAuth(ctx);
    const used = await q("SELECT COUNT(*) AS n FROM ads WHERE user_id = $1 AND status IN ('moderation', 'published')", [user.id]);
    const ent = await q(
      `SELECT kind, quantity, expires_at FROM entitlements
        WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > $2) AND quantity > 0`,
      [user.id, nowSql()]);
    return {
      user: { id: user.id, display_name: user.display_name, email: emailOf(user.phone), phone: phoneOf(user.phone), role: user.role },
      limit: await adLimit(user.id),
      used: Number(used.rows[0].n),
      entitlements: ent.rows
    };
  }],

  ['POST', '/api/profile/update', async (ctx) => {
    const user = await requireAuth(ctx);
    const name = String(ctx.body.display_name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (name.length < 2 || name.length > 40) throw new HttpError(400, 'Имя: от 2 до 40 символов / Name: 2 to 40 characters');
    await q('UPDATE users SET display_name = $1 WHERE id = $2', [name, user.id]);
    return { ok: true, display_name: name };
  }],

  ['GET', '/api/profile/export', async (ctx) => {
    const user = await requireAuth(ctx);
    const ads = await q('SELECT id, title, description, price_kopeks, category, region_code, city, status, created_at, published_at FROM ads WHERE user_id = $1 ORDER BY id', [user.id]);
    const payments = await q('SELECT id, tariff_code, amount_kopeks, currency, status, created_at, paid_at FROM payments WHERE user_id = $1 ORDER BY id', [user.id]);
    const favorites = await q('SELECT ad_id, created_at FROM favorites WHERE user_id = $1', [user.id]);
    return {
      exported_at: nowSql(),
      user: { id: user.id, display_name: user.display_name, email: emailOf(user.phone), phone: phoneOf(user.phone), role: user.role },
      ads: ads.rows, payments: payments.rows, favorites: favorites.rows
    };
  }]
];
