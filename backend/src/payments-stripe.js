import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { env, nowSql, plusDaysSql, HttpError } from './util.js';
import { requireAuth } from './auth.js';
import { profile } from './market.js';

const API = 'https://api.stripe.com/v1';

function secretKey() {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) throw new HttpError(503, 'Payments are not configured: set STRIPE_SECRET_KEY');
  return key;
}

function form(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.append(k, String(v));
  return p.toString();
}

async function stripe(method, urlPath, body, idempotenceKey) {
  const headers = { Authorization: 'Bearer ' + secretKey(), 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idempotenceKey) headers['Idempotency-Key'] = idempotenceKey;
  const res = await fetch(API + urlPath, { method, headers, body: body ? form(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, 'Stripe: ' + ((json.error && json.error.message) || res.status));
  return json;
}

export function verifySignature(raw, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map(x => x.split('=')).filter(x => x.length === 2));
  if (!parts.t || !parts.v1 || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const INTL_TARIFFS = {
  extra_ad:  { title: 'Extra listing',    description: 'One extra active listing for 30 days',  cents: 299 },
  boost:     { title: 'Boost in feed',    description: 'Move one listing to the top for 7 days', cents: 199 },
  pro_month: { title: 'Pro subscription', description: 'Up to 20 active listings, 30 days',      cents: 999 }
};

export async function ensureIntlTariffs() {
  const mark = 'intl-tariffs-v1';
  const done = await q('SELECT 1 FROM schema_migrations WHERE name = $1', [mark]);
  if (done.rowCount) return;
  await tx(async (c) => {
    for (const [code, t] of Object.entries(INTL_TARIFFS)) {
      await c.query('UPDATE tariffs SET title = $1, description = $2, price_kopeks = $3 WHERE code = $4', [t.title, t.description, t.cents, code]);
    }
    await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [mark]);
  });
  console.log('Тарифы intl выставлены в ' + profile.currency);
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

const major = (minor) => Number(minor) / 100;

export const stripeRoutes = [
  ['GET', '/api/payments/tariffs', async () => {
    const r = await q('SELECT code, title, description, price_kopeks, kind, duration_days FROM tariffs WHERE active = 1 ORDER BY sort');
    return {
      tariffs: r.rows.map(t => ({ ...t, price: major(t.price_kopeks), price_rub: major(t.price_kopeks), currency: profile.currency }))
    };
  }],

  ['POST', '/api/payments/create', async (ctx) => {
    const user = await requireAuth(ctx);
    const code = String(ctx.body.tariff || '');
    const t = await q('SELECT code, title, price_kopeks FROM tariffs WHERE code = $1 AND active = 1', [code]);
    if (!t.rowCount) throw new HttpError(400, 'Tariff not found');
    const tariff = t.rows[0];
    if (tariff.price_kopeks <= 0) throw new HttpError(400, 'This tariff is free');

    const idem = crypto.randomUUID();
    const inserted = await q('INSERT INTO payments(provider, idempotence_key, user_id, tariff_code, amount_kopeks, currency) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['stripe', idem, user.id, tariff.code, tariff.price_kopeks, profile.currency]);
    const paymentId = inserted.rows[0].id;

    const domain = env('APP_DOMAIN');
    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'payment',
      success_url: domain + '/payments/return/?id=' + paymentId,
      cancel_url: domain + '/payments/',
      client_reference_id: paymentId,
      'metadata[paymentId]': paymentId,
      'metadata[tariff]': tariff.code,
      'metadata[userId]': user.id,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': profile.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': tariff.price_kopeks,
      'line_items[0][price_data][product_data][name]': tariff.title + ' - ' + profile.name
    }, idem);

    await q('UPDATE payments SET provider_payment_id = $1, status = $2, confirmation_url = $3 WHERE id = $4',
      [session.id, 'pending', session.url || '', paymentId]);
    return { ok: true, paymentId, confirmationUrl: session.url, amount: { value: major(tariff.price_kopeks), currency: profile.currency } };
  }],

  ['POST', '/api/payments/webhook', async (ctx) => {
    if (!verifySignature(ctx.rawBody, ctx.headers['stripe-signature'], env('STRIPE_WEBHOOK_SECRET'))) {
      throw new HttpError(400, 'Invalid signature');
    }
    const event = ctx.body || {};
    const obj = event.data && event.data.object;
    if (!obj || !obj.id) return { ok: true };

    const local = await q('SELECT * FROM payments WHERE provider_payment_id = $1', [obj.id]);
    if (!local.rowCount) return { ok: true };
    const payment = local.rows[0];

    const succeeded = (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid';
    if (succeeded && payment.status !== 'paid') {
      if (Number(obj.amount_total) !== payment.amount_kopeks || String(obj.currency).toUpperCase() !== payment.currency) {
        await q('UPDATE payments SET status = $1, raw = $2 WHERE id = $3', ['amount_mismatch', JSON.stringify(obj), payment.id]);
        return { ok: true };
      }
      await tx(async (c) => {
        const upd = await c.query("UPDATE payments SET status = 'paid', paid_at = $2, raw = $3 WHERE id = $1 AND status <> 'paid' RETURNING id",
          [payment.id, nowSql(), JSON.stringify(obj)]);
        if (upd.rowCount) await grant(c, payment);
      });
    } else if ((event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') && payment.status !== 'paid') {
      await q('UPDATE payments SET status = $1, raw = $2 WHERE id = $3', ['canceled', JSON.stringify(obj), payment.id]);
    }
    return { ok: true };
  }],

  ['GET', '/api/payments/status', async (ctx) => {
    const user = await requireAuth(ctx);
    const r = await q('SELECT id, status, tariff_code, amount_kopeks, currency, paid_at FROM payments WHERE id = $1 AND user_id = $2', [Number(ctx.query.id), user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Payment not found');
    const p = r.rows[0];
    return { payment: { ...p, amount: major(p.amount_kopeks) } };
  }],

  ['GET', '/api/payments/my', async (ctx) => {
    const user = await requireAuth(ctx);
    const p = await q('SELECT id, tariff_code, amount_kopeks, currency, status, created_at, paid_at FROM payments WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [user.id]);
    const e = await q('SELECT kind, quantity, expires_at FROM entitlements WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > $2)', [user.id, nowSql()]);
    return { payments: p.rows.map(x => ({ ...x, amount: major(x.amount_kopeks), amount_rub: major(x.amount_kopeks) })), entitlements: e.rows };
  }]
];
