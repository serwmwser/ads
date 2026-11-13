import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { env, money, nowSql, plusDaysSql, HttpError } from './util.js';
import { requireAuth } from './auth.js';

const API = 'https://api.yookassa.ru/v3';

function authHeader() {
  const shop = env('YOOKASSA_SHOP_ID');
  const key = env('YOOKASSA_SECRET_KEY');
  if (!shop || !key) throw new HttpError(503, 'Платежи не настроены: заполните YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY');
  return 'Basic ' + Buffer.from(shop + ':' + key).toString('base64');
}

async function yk(method, urlPath, body, idempotenceKey) {
  const headers = { Authorization: authHeader(), 'Content-Type': 'application/json' };
  if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey;
  const res = await fetch(API + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, 'ЮKassa: ' + (json.description || res.status));
  return json;
}

async function grant(client, payment) {
  const t = await client.query('SELECT kind, quantity, duration_days FROM tariffs WHERE code = $1', [payment.tariff_code]);
  if (!t.rowCount) return;
  const tariff = t.rows[0];
  const days = Number(tariff.duration_days || 0);
  await client.query(
    `INSERT INTO entitlements(user_id, kind, quantity, expires_at, payment_id)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (payment_id, kind) DO NOTHING`,
    [payment.user_id, tariff.kind, tariff.quantity, days > 0 ? plusDaysSql(days) : null, payment.id]);
}

export const paymentRoutes = [
  ['GET', '/api/payments/tariffs', async () => {
    const r = await q('SELECT code, title, description, price_kopeks, kind, duration_days FROM tariffs WHERE active = 1 ORDER BY sort');
    return { tariffs: r.rows.map(t => ({ ...t, price_rub: money(t.price_kopeks), currency: 'RUB' })) };
  }],

  ['POST', '/api/payments/create', async (ctx) => {
    const user = await requireAuth(ctx);
    const code = String(ctx.body.tariff || '');
    const method = String(ctx.body.method || 'checkout');
    const t = await q('SELECT code, title, price_kopeks FROM tariffs WHERE code = $1 AND active = 1', [code]);
    if (!t.rowCount) throw new HttpError(400, 'Тариф не найден');
    const tariff = t.rows[0];
    if (tariff.price_kopeks <= 0) throw new HttpError(400, 'Этот тариф бесплатный');

    const idem = crypto.randomUUID();
    const inserted = await q('INSERT INTO payments(idempotence_key, user_id, tariff_code, amount_kopeks) VALUES ($1, $2, $3, $4) RETURNING id',
      [idem, user.id, tariff.code, tariff.price_kopeks]);
    const paymentId = inserted.rows[0].id;

    const payload = {
      amount: { value: money(tariff.price_kopeks), currency: 'RUB' },
      capture: true,
      description: tariff.title + ' — ' + env('APP_NAME', 'Объявления'),
      confirmation: { type: 'redirect', return_url: env('YOOKASSA_RETURN_URL', env('APP_DOMAIN') + '/payments/return') },
      metadata: { paymentId: String(paymentId), userId: String(user.id), tariff: tariff.code }
    };
    if (method === 'sbp') payload.payment_method_data = { type: 'sbp' };

    const created = await yk('POST', '/payments', payload, idem);
    const confirmationUrl = (created.confirmation && created.confirmation.confirmation_url) || '';
    await q('UPDATE payments SET provider_payment_id = $1, status = $2, confirmation_url = $3, raw = $4 WHERE id = $5',
      [created.id, created.status, confirmationUrl, JSON.stringify(created), paymentId]);

    return {
      ok: true, paymentId, providerPaymentId: created.id, status: created.status,
      amount: { value: money(tariff.price_kopeks), currency: 'RUB' }, confirmationUrl
    };
  }],

  ['POST', '/api/payments/webhook', async (ctx) => {
    const obj = ctx.body && ctx.body.object;
    if (!obj || !obj.id) return { ok: true };

    const trusted = await yk('GET', '/payments/' + encodeURIComponent(obj.id));
    const local = await q('SELECT * FROM payments WHERE provider_payment_id = $1', [trusted.id]);
    if (!local.rowCount) return { ok: true };
    const payment = local.rows[0];

    if (trusted.status === 'succeeded' && payment.status !== 'paid') {
      const paid = Math.round(Number(trusted.amount.value) * 100);
      if (paid !== payment.amount_kopeks || trusted.amount.currency !== 'RUB') {
        await q('UPDATE payments SET status = $1, raw = $2 WHERE id = $3', ['amount_mismatch', JSON.stringify(trusted), payment.id]);
        return { ok: true };
      }
      await tx(async (c) => {
        const upd = await c.query("UPDATE payments SET status = 'paid', paid_at = $2, raw = $3 WHERE id = $1 AND status <> 'paid' RETURNING id",
          [payment.id, nowSql(), JSON.stringify(trusted)]);
        if (upd.rowCount) await grant(c, payment);
      });
    } else if (trusted.status === 'canceled' && payment.status !== 'paid') {
      await q('UPDATE payments SET status = $1, raw = $2 WHERE id = $3', ['canceled', JSON.stringify(trusted), payment.id]);
    }
    return { ok: true };
  }],

  ['GET', '/api/payments/my', async (ctx) => {
    const user = await requireAuth(ctx);
    const p = await q('SELECT id, tariff_code, amount_kopeks, currency, status, created_at, paid_at FROM payments WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [user.id]);
    const e = await q('SELECT kind, quantity, expires_at FROM entitlements WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > $2)', [user.id, nowSql()]);
    return { payments: p.rows.map(x => ({ ...x, amount_rub: money(x.amount_kopeks) })), entitlements: e.rows };
  }]
];
