import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const sources = {
  spot: [
    'https://data-api.binance.vision',
    'https://api.binance.com',
    'https://api-gcp.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
    'https://api4.binance.com'
  ],
  futures: ['https://fapi.binance.com']
};
const paths = {
  spot: ['/api/v3/exchangeInfo', '/api/v3/ticker/bookTicker', '/api/v3/ticker/24hr'],
  futures: ['/fapi/v1/exchangeInfo', '/fapi/v1/ticker/bookTicker', '/fapi/v1/ticker/24hr']
};
let cache = null;
let pending = null;

function errorText(err) {
  if (/restricted location/i.test(err.message)) return 'محدودیت منطقه‌ای Binance';
  if (err.cause?.code) return `خطای شبکه/TLS: ${err.cause.code}`;
  return err.message;
}

async function getJSON(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { 'Accept': 'application/json' } });
  const body = await response.json();
  if (!response.ok || !body || !Array.isArray(body) && body.code !== undefined) {
    throw new Error(body?.msg || `HTTP ${response.status}`);
  }
  return body;
}

async function getMarket(market) {
  const errors = [];
  for (const origin of sources[market]) {
    try {
      const [exchange, book, stats] = await Promise.all(paths[market].map(p => getJSON(origin + p)));
      if (!Array.isArray(exchange.symbols) || !Array.isArray(book) || !Array.isArray(stats)) throw new Error('پاسخ ناقص از API');
      return { exchange, book, stats, source: origin };
    } catch (err) {
      errors.push(`${origin}: ${errorText(err)}`);
      // Switching hostnames must not be used to work around an explicit eligibility restriction.
      if (/restricted location/i.test(err.message)) break;
    }
  }
  return { error: errors.join(' | ') };
}

async function snapshot(force = false) {
  if (cache && Date.now() - cache.at < (force ? 12000 : 60000)) return cache.data;
  if (!pending) {
    pending = (async () => {
      const [spot, futures] = await Promise.all([getMarket('spot'), getMarket('futures')]);
      const data = { capturedAt: new Date().toISOString(), spot, futures };
      // Avoid caching an all-failed response for a full minute.
      cache = { at: Date.now() - (spot.error && futures.error ? 50000 : 0), data };
      return data;
    })().finally(() => { pending = null; });
  }
  return pending;
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const text = (await response.text()).slice(0, 800);
    return /restricted location/i.test(text) ? 'محدودیت منطقه‌ای Binance' : response.ok ? `پاسخ HTTP ${response.status}` : `خطای HTTP ${response.status}`;
  } catch (err) { return errorText(err); }
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/connection') {
      const [general, spotPublic, spotMain, futures] = await Promise.all([
        probe('https://example.com'),
        probe('https://data-api.binance.vision/api/v3/time'),
        probe('https://api.binance.com/api/v3/time'),
        probe('https://fapi.binance.com/fapi/v1/time')
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ general, spotPublic, spotMain, futures }));
      return;
    }
    if (pathname === '/api/snapshot') {
      const data = await snapshot(new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
      return;
    }
    const isLibrary = pathname.startsWith('/lib/');
    const base = isLibrary ? path.join(path.dirname(root), 'lib') : root;
    const file = pathname === '/' ? 'index.html' : isLibrary ? pathname.slice(5) : pathname.slice(1);
    const resolved = path.resolve(base, file);
    if (!resolved.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await fs.readFile(resolved);
    res.writeHead(200, { 'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(bytes);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500);
    res.end('Not found');
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Dashboard listening on 0.0.0.0:${port}`));
