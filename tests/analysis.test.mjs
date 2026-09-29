import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarket, summary, histogram, grouped, practicalGap, defaultFees, volumeQuartiles } from '../lib/analysis.mjs';

const payload = { exchange: { symbols: [
  {symbol:'AAAUSDT', status:'TRADING', baseAsset:'AAA', quoteAsset:'USDT', filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'}]},
  {symbol:'BBBUSDC', status:'TRADING', baseAsset:'BBB', quoteAsset:'USDC', filters:[]},
  {symbol:'DEADUSDT', status:'BREAK', quoteAsset:'USDT'}
]}, book: [
  {symbol:'AAAUSDT', bidPrice:'99.99',askPrice:'100.01', bidQty:'2', askQty:'3'},
  {symbol:'BBBUSDC', bidPrice:'1',askPrice:'1.01'},
  {symbol:'DEADUSDT', bidPrice:'1',askPrice:'2'}
], stats:[{symbol:'AAAUSDT',quoteVolume:'3000000'},{symbol:'BBBUSDC',quoteVolume:'1000'}] };

test('valid spread / tick / one-way fees / two-sided taker cost; skips inactive', () => {
  const rows = normalizeMarket(payload, 'spot');
  assert.equal(rows.length, 2);
  assert.ok(Math.abs(rows[0].spread - 2) < 1e-9);
  assert.ok(Math.abs(rows[0].tickBps - 1) < 1e-9);
  assert.ok(Math.abs(rows[0].roundtrip - 22) < 1e-9);
  assert.equal(rows[1].feeTaker, 9.5);
  assert.equal(rows[0].volume, 3000000);
  assert.equal(normalizeMarket({error:'blocked'}, 'spot').length, 0);
});
test('percentiles, histogram and liquidity quartiles', () => {
  const rows = [0,1,2,5,10,25,50,100].map((spread,i) => ({spread, volume:i+1, market:'spot', quote:'USDT'}));
  assert.equal(summary(rows).median, 7.5);
  assert.deepEqual(histogram(rows), [1,1,1,1,1,1,1,1]);
  assert.deepEqual(volumeQuartiles(rows).map(g => g.length), [2,2,2,2]);
  assert.equal(grouped(rows, 'volume').length, 4);
});
test('practical gap requires at least 10 per group and >= 2x and >= 1 bp', () => {
  assert.equal(practicalGap([{n:9,median:1},{n:20,median:5}]), null);
  assert.equal(practicalGap([{n:10,median:2},{n:10,median:4}]).significant, true);
  assert.equal(practicalGap([{n:10,median:2},{n:10,median:2.5}]).significant, false);
});
test('custom commission assumptions alter cost, not observed spread', () => {
  const base = normalizeMarket(payload, 'spot');
  const custom = normalizeMarket(payload, 'spot', { ...defaultFees, spotTaker: 7, spotUsdcTaker: 6 });
  assert.equal(custom[0].spread, base[0].spread);
  assert.ok(Math.abs(custom[0].roundtrip - (base[0].spread + 14)) < 1e-9);
  assert.equal(custom[1].feeTaker, 6);
  const futures = normalizeMarket(payload, 'futures');
  assert.equal(futures[0].feeMaker, 2);
  assert.equal(futures[0].feeTaker, 5);
});
