import { q, tx } from './db.js';
import { env, sha256, randomToken, randomCode, nowSql, plusSecondsSql, plusDaysSql, HttpError, rateLimit } from './util.js';

const COOKIE = 'ads_session';
const SESSION_DAYS = Number(env('SESSION_TTL_DAYS', '30'));
const CODE_TTL_SEC = 600;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normEmail(value) {
  const e = String(value || '').trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  return e;
}

export async function sendEmail(to, subject, text) {
  const provider = env('EMAIL_PROVIDER', 'console').toLowerCase();
  if (provider === 'console') {
    console.log('[EMAIL dev] ' + to + ' | ' + subject + ' | ' + text);
    return { ok: true, provider };
  }
  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env('EMAIL_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM'), to: [to], subject, text })
    });
    if (!res.ok) throw new HttpError(502, 'Не удалось отправить письмо');
    return { ok: true, provider };
  }
  throw new Error('Неизвестный EMAIL_PROVIDER: ' + provider);
}

function setSessionCookie(res, token, maxAge) {
  const secure = env('APP_ENV', 'development') === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + secure);
}

const idOf = (email) => 'email:' + email;

export const authEmailRoutes = [
  ['POST', '/api/auth/email/request', async (ctx) => {
    const email = normEmail(ctx.body.email);
    if (!email) throw new HttpError(400, 'Enter a valid email address');
    if (!rateLimit('mail:' + email, 5, 3600000)) throw new HttpError(429, 'Too many codes, try again in an hour');
    if (!rateLimit('mail60:' + email, 1, 60000)) throw new HttpError(429, 'You can request a new code in a minute');
    if (!rateLimit('mailip:' + ctx.ip, 20, 3600000)) throw new HttpError(429, 'Too many requests');
    const code = randomCode();
    await q('INSERT INTO auth_codes(phone, code_hash, expires_at) VALUES ($1, $2, $3)',
      [idOf(email), sha256(code), plusSecondsSql(CODE_TTL_SEC)]);
    await sendEmail(email, env('APP_NAME', 'Classifieds') + ': your sign-in code',
      'Your sign-in code: ' + code + '\nIt is valid for 10 minutes. If you did not request it, ignore this email.');
    return { ok: true, ttl: CODE_TTL_SEC };
  }],

  ['POST', '/api/auth/email/verify', async (ctx, res) => {
    const email = normEmail(ctx.body.email);
    const code = String(ctx.body.code || '').trim();
    if (!email || !/^\d{5}$/.test(code)) throw new HttpError(400, 'Wrong email or code');
    if (!rateLimit('mverify:' + email, 10, 600000)) throw new HttpError(429, 'Too many attempts');

    const id = idOf(email);
    const r = await q('SELECT id, code_hash, attempts FROM auth_codes WHERE phone = $1 AND expires_at > $2 ORDER BY id DESC LIMIT 1',
      [id, nowSql()]);
    if (!r.rowCount) throw new HttpError(400, 'The code has expired, request a new one');
    const row = r.rows[0];
    if (row.attempts >= 5) throw new HttpError(429, 'Code locked, request a new one');
    await q('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    if (row.code_hash !== sha256(code)) throw new HttpError(400, 'Wrong code');
    await q('DELETE FROM auth_codes WHERE phone = $1', [id]);

    const user = await tx(async (c) => {
      const found = await c.query('SELECT id, phone, display_name, role, is_blocked FROM users WHERE phone = $1 AND deleted_at IS NULL', [id]);
      if (found.rowCount) return found.rows[0];
      const created = await c.query('INSERT INTO users(phone, display_name) VALUES ($1, $2) RETURNING id, phone, display_name, role, is_blocked',
        [id, email.split('@')[0].slice(0, 40)]);
      return created.rows[0];
    });
    if (user.is_blocked) throw new HttpError(403, 'Account is blocked');

    const token = randomToken();
    await q('INSERT INTO sessions(token_hash, user_id, user_agent, expires_at) VALUES ($1, $2, $3, $4)',
      [sha256(token), user.id, String(ctx.headers['user-agent'] || '').slice(0, 200), plusDaysSql(SESSION_DAYS)]);
    setSessionCookie(res, token, SESSION_DAYS * 86400);
    return { ok: true, token, user: { id: user.id, email, phone: '', display_name: user.display_name, role: user.role } };
  }]
];
