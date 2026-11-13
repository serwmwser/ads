import { q } from './db.js';
import { nowSql, money, HttpError } from './util.js';
import { requireAuth } from './auth.js';

async function staff(ctx) {
  const user = await requireAuth(ctx);
  if (user.role !== 'admin' && user.role !== 'moderator') throw new HttpError(403, 'Недостаточно прав');
  return user;
}

async function adminOnly(ctx) {
  const user = await requireAuth(ctx);
  if (user.role !== 'admin') throw new HttpError(403, 'Только для администратора');
  return user;
}

async function log(actor, action, target, details) {
  await q('INSERT INTO moderation_log(actor_id, action, target, details) VALUES ($1, $2, $3, $4)',
    [actor.id, action, target, details ? String(details).slice(0, 500) : null]);
}

const count = async (sql, params) => Number((await q(sql, params)).rows[0].n);

export const adminRoutes = [
  ['GET', '/api/admin/stats', async (ctx) => {
    await staff(ctx);
    const byStatus = await q('SELECT status, COUNT(*) AS n FROM ads GROUP BY status');
    const paid = await q("SELECT COUNT(*) AS n, COALESCE(SUM(amount_kopeks), 0) AS s FROM payments WHERE status = 'paid'");
    return {
      users: await count('SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL'),
      ads: Object.fromEntries(byStatus.rows.map(r => [r.status, Number(r.n)])),
      complaints_new: await count("SELECT COUNT(*) AS n FROM complaints WHERE status = 'new'"),
      payments_paid: Number(paid.rows[0].n),
      revenue_rub: money(paid.rows[0].s)
    };
  }],

  ['GET', '/api/admin/moderation', async (ctx) => {
    await staff(ctx);
    const r = await q(
      `SELECT a.id, a.title, a.description, a.price_kopeks, a.category, a.region_code, a.city, a.created_at,
              u.id AS user_id, u.phone, u.display_name,
              (SELECT url FROM ad_photos p WHERE p.ad_id = a.id ORDER BY p.sort, p.id LIMIT 1) AS photo
         FROM ads a JOIN users u ON u.id = a.user_id
        WHERE a.status = 'moderation' ORDER BY a.id LIMIT 50`);
    return { items: r.rows.map(x => ({ ...x, price_rub: x.price_kopeks / 100 })) };
  }],

  ['POST', '/api/admin/ads/approve', async (ctx) => {
    const user = await staff(ctx);
    const id = Number(ctx.body.id);
    const r = await q("UPDATE ads SET status = 'published', published_at = $1, reject_reason = '' WHERE id = $2 AND status = 'moderation'", [nowSql(), id]);
    if (!r.rowCount) throw new HttpError(404, 'Объявление не найдено в очереди');
    await log(user, 'ad_approve', 'ad:' + id);
    return { ok: true };
  }],

  ['POST', '/api/admin/ads/reject', async (ctx) => {
    const user = await staff(ctx);
    const id = Number(ctx.body.id);
    const reason = String(ctx.body.reason || '').trim().slice(0, 300);
    if (reason.length < 3) throw new HttpError(400, 'Укажите причину отказа');
    const r = await q("UPDATE ads SET status = 'rejected', reject_reason = $1 WHERE id = $2 AND status = 'moderation'", [reason, id]);
    if (!r.rowCount) throw new HttpError(404, 'Объявление не найдено в очереди');
    await log(user, 'ad_reject', 'ad:' + id, reason);
    return { ok: true };
  }],

  ['POST', '/api/admin/ads/remove', async (ctx) => {
    const user = await staff(ctx);
    const id = Number(ctx.body.id);
    const reason = String(ctx.body.reason || '').trim().slice(0, 300);
    const r = await q("UPDATE ads SET status = 'removed', removed_at = $1, reject_reason = $2 WHERE id = $3 AND status <> 'removed'", [nowSql(), reason, id]);
    if (!r.rowCount) throw new HttpError(404, 'Объявление не найдено');
    await log(user, 'ad_remove', 'ad:' + id, reason);
    return { ok: true };
  }],

  ['GET', '/api/admin/complaints', async (ctx) => {
    await staff(ctx);
    const r = await q(
      `SELECT c.id, c.target_type, c.target_id, c.reason, c.created_at, u.phone AS reporter_phone
         FROM complaints c JOIN users u ON u.id = c.reporter_id
        WHERE c.status = 'new' ORDER BY c.id LIMIT 50`);
    return { items: r.rows };
  }],

  ['POST', '/api/admin/complaints/resolve', async (ctx) => {
    const user = await staff(ctx);
    const id = Number(ctx.body.id);
    const action = String(ctx.body.action || 'dismiss');
    const c = await q("SELECT target_type, target_id FROM complaints WHERE id = $1 AND status = 'new'", [id]);
    if (!c.rowCount) throw new HttpError(404, 'Жалоба не найдена');
    const { target_type, target_id } = c.rows[0];
    if (action === 'remove_ad' && target_type === 'ad') {
      await q("UPDATE ads SET status = 'removed', removed_at = $1, reject_reason = 'Нарушение правил' WHERE id = $2", [nowSql(), target_id]);
    } else if (action === 'block_user' && target_type === 'user') {
      await q('UPDATE users SET is_blocked = 1 WHERE id = $1 AND role = $2', [target_id, 'user']);
    } else if (action !== 'dismiss') {
      throw new HttpError(400, 'Неизвестное действие');
    }
    await q("UPDATE complaints SET status = 'resolved', resolved_at = $1 WHERE id = $2", [nowSql(), id]);
    await log(user, 'complaint_' + action, 'complaint:' + id, target_type + ':' + target_id);
    return { ok: true };
  }],

  ['GET', '/api/admin/users', async (ctx) => {
    await staff(ctx);
    const p = [];
    let where = 'WHERE deleted_at IS NULL';
    if (ctx.query.q) { p.push('%' + String(ctx.query.q).trim().slice(0, 30).replace(/[%_\\]/g, '\\$&') + '%'); where += " AND (phone LIKE $1 ESCAPE '\\' OR display_name LIKE $1 ESCAPE '\\')"; }
    const r = await q('SELECT id, phone, display_name, role, is_blocked, created_at FROM users ' + where + ' ORDER BY id DESC LIMIT 50', p);
    return { items: r.rows };
  }],

  ['POST', '/api/admin/users/block', async (ctx) => {
    const user = await adminOnly(ctx);
    const id = Number(ctx.body.id);
    const blocked = ctx.body.blocked ? 1 : 0;
    if (id === user.id) throw new HttpError(400, 'Нельзя заблокировать себя');
    const r = await q('UPDATE users SET is_blocked = $1 WHERE id = $2', [blocked, id]);
    if (!r.rowCount) throw new HttpError(404, 'Пользователь не найден');
    if (blocked) await q('DELETE FROM sessions WHERE user_id = $1', [id]);
    await log(user, blocked ? 'user_block' : 'user_unblock', 'user:' + id);
    return { ok: true };
  }],

  ['POST', '/api/admin/users/role', async (ctx) => {
    const user = await adminOnly(ctx);
    const id = Number(ctx.body.id);
    const role = String(ctx.body.role || '');
    if (!['user', 'moderator', 'admin'].includes(role)) throw new HttpError(400, 'Роль: user, moderator или admin');
    if (id === user.id) throw new HttpError(400, 'Нельзя менять свою роль');
    const r = await q('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    if (!r.rowCount) throw new HttpError(404, 'Пользователь не найден');
    await log(user, 'user_role', 'user:' + id, role);
    return { ok: true };
  }],

  ['GET', '/api/admin/tariffs', async (ctx) => {
    await adminOnly(ctx);
    const r = await q('SELECT code, title, price_kopeks, kind, quantity, duration_days, active FROM tariffs ORDER BY sort');
    return { items: r.rows.map(t => ({ ...t, price_rub: t.price_kopeks / 100 })) };
  }],

  ['POST', '/api/admin/tariffs/update', async (ctx) => {
    const user = await adminOnly(ctx);
    const code = String(ctx.body.code || '');
    const price = Number(ctx.body.price_rub);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) throw new HttpError(400, 'Некорректная цена');
    const r = await q('UPDATE tariffs SET price_kopeks = $1, active = $2 WHERE code = $3', [Math.round(price * 100), ctx.body.active === false ? 0 : 1, code]);
    if (!r.rowCount) throw new HttpError(404, 'Тариф не найден');
    await log(user, 'tariff_update', 'tariff:' + code, 'price=' + price);
    return { ok: true };
  }],

  ['GET', '/api/admin/log', async (ctx) => {
    await adminOnly(ctx);
    const r = await q('SELECT id, actor_id, action, target, details, created_at FROM moderation_log ORDER BY id DESC LIMIT 100');
    return { items: r.rows };
  }]
];
