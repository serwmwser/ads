import { env } from './util.js';

const PROFILES = {
  ru: {
    market: 'ru',
    locale: 'ru-RU',
    currency: 'RUB',
    auth: 'phone',
    payments: 'yookassa',
    geo: 'ru',
    legal: '152-fz',
    name: env('APP_NAME', 'Объявления')
  },
  intl: {
    market: 'intl',
    locale: env('INTL_LOCALE', 'en-US'),
    currency: env('INTL_CURRENCY', 'USD'),
    auth: 'email',
    payments: 'stripe',
    geo: 'world',
    legal: 'gdpr',
    name: env('APP_NAME', 'Classifieds')
  }
};

const wanted = env('MARKET', 'ru');
if (!PROFILES[wanted]) console.warn('Неизвестный MARKET=' + wanted + ', используется ru');

export const MARKET = PROFILES[wanted] ? wanted : 'ru';
export const profile = PROFILES[MARKET];

export const marketRoutes = [
  ['GET', '/api/config', async () => ({
    ok: true,
    market: profile.market,
    locale: profile.locale,
    currency: profile.currency,
    auth: profile.auth,
    payments: profile.payments,
    name: profile.name
  })]
];
