import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env, rateLimit, HttpError, BACKEND_DIR } from './util.js';
import { requireAuth } from './auth.js';

export const UPLOAD_DIR = path.resolve(BACKEND_DIR, env('UPLOAD_DIR', './data/uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 2.5 * 1024 * 1024;

function detect(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export const uploadRoutes = [
  ['POST', '/api/upload/photo', async (ctx) => {
    const user = await requireAuth(ctx);
    if (!rateLimit('upload:' + user.id, 30, 3600000)) throw new HttpError(429, 'Слишком много загрузок за час / Too many uploads');
    const raw = String(ctx.body.data || '');
    const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    if (!b64) throw new HttpError(400, 'Нет файла / No file');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_BYTES) throw new HttpError(413, 'Файл больше 2,5 МБ / File is larger than 2.5 MB');
    const ext = detect(buf);
    if (!ext) throw new HttpError(400, 'Допустимы JPEG, PNG и WebP / Only JPEG, PNG and WebP are allowed');
    const name = crypto.randomBytes(10).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    const base = env('API_PUBLIC_URL', '').replace(/\/+$/, '');
    return { ok: true, url: base + '/uploads/' + name, size: buf.length };
  }]
];
