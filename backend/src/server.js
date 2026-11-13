import path from 'node:path';
import { serve } from './http.js';
import { env, BACKEND_DIR } from './util.js';
import { q } from './db.js';
import { authRoutes } from './auth.js';
import { paymentRoutes } from './payments.js';

const staticDir = path.resolve(BACKEND_DIR, '..', 'web', 'public');

const routes = [
  ['GET', '/api/health', async () => {
    await q('SELECT 1');
    return { ok: true, db: 'up', driver: 'sqlite', env: env('APP_ENV', 'development') };
  }],
  ...authRoutes,
  ...paymentRoutes
];

serve({ port: Number(env('PORT', '3000')), routes, staticDir });
