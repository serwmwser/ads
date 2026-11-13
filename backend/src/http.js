import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, parseCookies } from './util.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1048576) { reject(new HttpError(413, 'Слишком большой запрос')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
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
    res.json = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      const handler = map.get(req.method + ' ' + pathname);
      if (handler) {
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
        const ctx = {
          method: req.method, path: pathname, headers: req.headers, body,
          query: Object.fromEntries(url.searchParams),
          cookies: parseCookies(req.headers.cookie),
          ip: req.socket.remoteAddress
        };
        const out = await handler(ctx, res);
        if (!res.writableEnded) res.json(out ?? { ok: true });
        return;
      }
      if (pathname.startsWith('/api/')) { res.json({ ok: false, error: 'Метод не найден' }, 404); return; }

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
