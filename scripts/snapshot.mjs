#!/usr/bin/env node
/**
 * ساخت اسنپ‌شات آفلاین از دفتر سفارش تمام بازارهای نوبیتکس.
 * این اسکریپت باید روی ماشینی اجرا شود که به apiv2.nobitex.ir دسترسی شبکه دارد.
 *   npm run snapshot
 * خروجی: src/data/snapshot.json  (کل حجم، عمیق و قابل استفاده آفلاین)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_ALL = 'https://apiv2.nobitex.ir/v3/orderbook/all';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/snapshot.json');

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 45_000);
try {
  console.log('در حال دریافت:', URL_ALL);
  const res = await fetch(URL_ALL, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json?.status !== 'ok') throw new Error('پاسخ نامعتبر');

  const books = {};
  for (const [k, v] of Object.entries(json)) {
    if (k === 'status') continue;
    books[k] = v;
  }
  const payload = {
    generatedAt: Date.now(),
    source: URL_ALL,
    count: Object.keys(books).length,
    books,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload));
  console.log(`✅ ${payload.count} بازار ذخیره شد → ${OUT}`);
} catch (e) {
  console.error('❌ شکست در دریافت داده:', e.message);
  console.error('   (اگر خطای DNS/شبکه دارید، با پروکسی یا از سیستم خودت اجرا کن)');
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
