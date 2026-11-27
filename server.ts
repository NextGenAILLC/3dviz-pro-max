import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const ASSET_ORIGIN = 'https://assets.3dviz.dev';
const ALLOWED_STL_PATH = /^\/assets\/(heart|anatomy)\/[A-Za-z0-9._-]+\.stl$/;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.stl': 'model/stl',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveStaticFile(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const normalized = path.posix.normalize(decoded);
  if (normalized.includes('\0') || normalized.includes('..')) {
    return null;
  }

  const relative = normalized.replace(/^\/+/, '');
  const candidate = path.resolve(DIST_DIR, relative);
  if (candidate !== DIST_DIR && !candidate.startsWith(DIST_DIR + path.sep)) {
    return null;
  }

  if (existsSync(candidate)) {
    const stat = statSync(candidate);
    if (stat.isFile()) return candidate;
    if (stat.isDirectory()) {
      const idx = path.join(candidate, 'index.html');
      if (existsSync(idx) && statSync(idx).isFile()) return idx;
    }
  }

  const htmlFallback = path.resolve(DIST_DIR, relative, 'index.html');
  if (
    htmlFallback.startsWith(DIST_DIR + path.sep) &&
    existsSync(htmlFallback) &&
    statSync(htmlFallback).isFile()
  ) {
    return htmlFallback;
  }

  return null;
}

async function proxyAnatomyAsset(
  pathname: string,
  method: string,
  res: http.ServerResponse
): Promise<void> {
  const upstreamPath = pathname.replace(/^\/assets/, '');
  const upstreamUrl = `${ASSET_ORIGIN}${upstreamPath}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: method === 'HEAD' ? 'HEAD' : 'GET',
    });

    if (!upstream.ok) {
      res.writeHead(upstream.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset unavailable');
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') || 'model/stl',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers['Content-Length'] = contentLength;

    res.writeHead(200, headers);
    if (method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('Upstream asset proxy error');
  }
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (ALLOWED_STL_PATH.test(pathname)) {
    void proxyAnatomyAsset(pathname, method, res);
    return;
  }

  const filePath = resolveStaticFile(pathname);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const isHashedAsset =
    pathname.startsWith('/assets/') && (ext === '.js' || ext === '.css' || ext === '.woff2');

  const stat = statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Cache-Control': isHashedAsset
      ? 'public, max-age=31536000, immutable'
      : ext === '.html'
        ? 'no-cache'
        : 'public, max-age=3600',
  });

  if (method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`3Dviz Pro Max serving ${DIST_DIR} on http://0.0.0.0:${PORT}`);
});
