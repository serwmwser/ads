import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, parseCookies, env } from './util.js';
import { UPLOAD_DIR } from './upload.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const ORIGINS = env('CORS_ORIGINS', 'https://ads.himeet.online,http://localhost:3000,http://localhost:8080')
  .split(',').map(s => s.trim()).filter(Boolean);
const TRUST_PROXY = env('TRUST_PROXY', '0') === '1';

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  res.setHeader('Vary', 'Origin');
  if (!ORIGINS.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress;
}

function readBody(req, limit = 1048576) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Слишком большой запрос')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks).toString('utf8');
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Некорректный JSON')); }
    });
    req.on('error', reject);
  });
}

export function serve({ port, routes, staticDir }) {
  const map = new Map(routes.map(([method, urlPath, handler]) => [method + ' ' + urlPath, handler]));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    applyCors(req, res);
    res.json = (data, status = 200) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
        res.writeHead(204);
        res.end();
        return;
      }
      const handler = map.get(req.method + ' ' + pathname);
      if (handler) {
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req, pathname === '/api/upload/photo' ? 4194304 : 1048576) : {};
        const ctx = {
          method: req.method, path: pathname, headers: req.headers, body, rawBody: req.rawBody || '',
          query: Object.fromEntries(url.searchParams),
          cookies: parseCookies(req.headers.cookie),
          ip: clientIp(req)
        };
        const out = await handler(ctx, res);
        if (!res.writableEnded) res.json(out ?? { ok: true });
        return;
      }
      if (pathname.startsWith('/api/')) { res.json({ ok: false, error: 'Метод не найден' }, 404); return; }

      if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
        const name = pathname.slice(9);
        const m = /^[a-f0-9]{20}\.(jpg|png|webp)$/.exec(name);
        const f = m ? path.join(UPLOAD_DIR, name) : '';
        if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.' + m[1]], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' });
        fs.createReadStream(f).pipe(res);
        return;
      }

      let file = path.join(staticDir, pathname);
      if (!file.startsWith(staticDir)) { res.writeHead(403); res.end('Forbidden'); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file) && !path.extname(file) && fs.existsSync(file + '.html')) file = file + '.html';
      if (!fs.existsSync(file)) {
        const notFound = path.join(staticDir, '404.html');
        if (fs.existsSync(notFound)) {
          res.writeHead(404, { 'Content-Type': MIME['.html'] });
          fs.createReadStream(notFound).pipe(res);
        } else { res.writeHead(404); res.end('Not found'); }
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.writableEnded) res.json({ ok: false, error: e.message || 'Внутренняя ошибка' }, status);
    }
  });

  server.listen(port, () => console.log('API и статика: http://localhost:' + port));
  return server;
}
