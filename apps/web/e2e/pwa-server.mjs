import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist/agrolens-web/browser');
const api = new URL(process.env.E2E_API_URL || 'http://localhost:3000/api');
const port = Number(process.env.E2E_SERVER_PORT || 4200);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.md': 'text/plain',
};

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
      const target = new URL(req.url, api.origin);
      const proxy = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
        target,
        {
          method: req.method,
          headers: { ...req.headers, host: target.host },
        },
        (response) => {
          res.writeHead(response.statusCode || 502, response.headers);
          response.pipe(res);
        },
      );
      proxy.on('error', () => {
        res.writeHead(502);
        res.end('Backend unavailable');
      });
      req.pipe(proxy);
      return;
    }
    let file = resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (extname(pathname)) {
        res.writeHead(404);
        res.end();
        return;
      }
      file = resolve(root, 'index.html');
    }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch {
    res.writeHead(500);
    res.end('Unable to serve the production build');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Production PWA test server: http://localhost:${port}`),
);
