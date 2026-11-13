import { q, tx } from './db.js';
import { env, sha256, randomToken, randomCode, normPhone, nowSql, plusSecondsSql, plusDaysSql, HttpError, rateLimit } from './util.js';
import { sendSms } from './sms.js';

const COOKIE = 'ads_session';
const SESSION_DAYS = Number(env('SESSION_TTL_DAYS', '30'));
const CODE_TTL_SEC = 300;

function setSessionCookie(res, token, maxAge) {
  const secure = env('APP_ENV', 'development') === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + secure);
}

function tokenOf(ctx) {
  const bearer = String(ctx.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return bearer || ctx.cookies[COOKIE] || '';
}

export async function requireAuth(ctx) {
  const token = tokenOf(ctx);
  if (!token) throw new HttpError(401, 'Требуется вход');
  const r = await q(
    `SELECT u.id, u.phone, u.display_name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.deleted_at IS NULL AND u.is_blocked = 0`,
    [sha256(token), nowSql()]);
  if (!r.rowCount) throw new HttpError(401, 'Сессия недействительна');
  return r.rows[0];
}

export const authRoutes = [
  ['POST', '/api/auth/phone/request', async (ctx) => {
    const phone = normPhone(ctx.body.phone);
    if (!phone) throw new HttpError(400, 'Укажите российский номер телефона');
    if (!rateLimit('sms:' + phone, 5, 3600000)) throw new HttpError(429, 'Слишком много кодов, попробуйте через час');
    if (!rateLimit('sms60:' + phone, 1, 60000)) throw new HttpError(429, 'Повторный код можно запросить через минуту');
    const code = randomCode();
    await q('INSERT INTO auth_codes(phone, code_hash, expires_at) VALUES ($1, $2, $3)',
      [phone, sha256(code), plusSecondsSql(CODE_TTL_SEC)]);
    await sendSms(phone, 'Код входа: ' + code + '. Никому не сообщайте его.');
    return { ok: true, ttl: CODE_TTL_SEC };
  }],

  ['POST', '/api/auth/phone/verify', async (ctx, res) => {
    const phone = normPhone(ctx.body.phone);
    const code = String(ctx.body.code || '').trim();
    if (!phone || !/^\d{5}$/.test(code)) throw new HttpError(400, 'Неверный номер или код');
    if (!rateLimit('verify:' + phone, 10, 600000)) throw new HttpError(429, 'Слишком много попыток');

    const r = await q('SELECT id, code_hash, attempts FROM auth_codes WHERE phone = $1 AND expires_at > $2 ORDER BY id DESC LIMIT 1',
      [phone, nowSql()]);
    if (!r.rowCount) throw new HttpError(400, 'Код истёк, запросите новый');
    const row = r.rows[0];
    if (row.attempts >= 5) throw new HttpError(429, 'Код заблокирован, запросите новый');
    await q('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    if (row.code_hash !== sha256(code)) throw new HttpError(400, 'Неверный код');
    await q('DELETE FROM auth_codes WHERE phone = $1', [phone]);

    const user = await tx(async (c) => {
      const found = await c.query('SELECT id, phone, display_name, role FROM users WHERE phone = $1 AND deleted_at IS NULL', [phone]);
      if (found.rowCount) return found.rows[0];
      const created = await c.query('INSERT INTO users(phone, display_name) VALUES ($1, $2) RETURNING id, phone, display_name, role',
        [phone, 'Пользователь ' + phone.slice(-4)]);
      return created.rows[0];
    });

    const token = randomToken();
    await q('INSERT INTO sessions(token_hash, user_id, user_agent, expires_at) VALUES ($1, $2, $3, $4)',
      [sha256(token), user.id, String(ctx.headers['user-agent'] || '').slice(0, 200), plusDaysSql(SESSION_DAYS)]);
    setSessionCookie(res, token, SESSION_DAYS * 86400);
    return { ok: true, user, token };
  }],

  ['GET', '/api/auth/me', async (ctx) => {
    const user = await requireAuth(ctx);
    const ent = await q(`SELECT kind, quantity, expires_at FROM entitlements
                          WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > $2) AND quantity > 0`,
      [user.id, nowSql()]);
    return { user, entitlements: ent.rows };
  }],

  ['POST', '/api/auth/logout', async (ctx, res) => {
    const user = await requireAuth(ctx);
    await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(tokenOf(ctx))]);
    setSessionCookie(res, '', 0);
    return { ok: true, userId: user.id };
  }],

  ['DELETE', '/api/auth/account', async (ctx, res) => {
    const user = await requireAuth(ctx);
    const now = nowSql();
    await tx(async (c) => {
      await c.query("UPDATE ads SET status = 'removed', removed_at = $2 WHERE user_id = $1", [user.id, now]);
      await c.query('DELETE FROM messages WHERE sender_id = $1', [user.id]);
      await c.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      await c.query("UPDATE users SET deleted_at = $2, phone = 'deleted_' || id, display_name = 'Удалённый аккаунт' WHERE id = $1", [user.id, now]);
      await c.query("INSERT INTO moderation_log(actor_id, action, target) VALUES ($1, 'account_deleted', 'user:' || $1)", [user.id]);
    });
    setSessionCookie(res, '', 0);
    return { ok: true, message: 'Аккаунт и персональные данные удалены' };
  }]
];
