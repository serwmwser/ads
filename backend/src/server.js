import path from 'node:path';
import { serve } from './http.js';
import { env, BACKEND_DIR } from './util.js';
import { q } from './db.js';
import { authRoutes } from './auth.js';
import { paymentRoutes } from './payments.js';
import { adsRoutes, seedGeo } from './ads.js';
import { adminRoutes } from './admin.js';
import { marketRoutes, profile } from './market.js';
import { authEmailRoutes } from './auth-email.js';
import { profileRoutes } from './profile.js';
import { uploadRoutes } from './upload.js';
import { seedWorldGeo } from './geo-world.js';
import { stripeRoutes, ensureIntlTariffs } from './payments-stripe.js';

const staticDir = path.resolve(BACKEND_DIR, '..', 'web', 'public');

const routes = [
  ['GET', '/api/health', async () => {
    await q('SELECT 1');
    return { ok: true, db: 'up', driver: 'sqlite', env: env('APP_ENV', 'development') };
  }],
  ...authRoutes,
  ...(profile.payments === 'stripe' ? stripeRoutes : paymentRoutes),
  ...adsRoutes,
  ...adminRoutes,
  ...marketRoutes,
  ...profileRoutes,
  ...uploadRoutes,
  ...(profile.auth === 'email' ? authEmailRoutes : [])
];

(profile.geo === 'ru' ? seedGeo() : seedWorldGeo()).catch((e) => console.warn('seedGeo: ' + e.message));

if (profile.payments === 'stripe') ensureIntlTariffs().catch((e) => console.warn('tariffs: ' + e.message));

serve({ port: Number(env('PORT', '3000')), routes, staticDir });
