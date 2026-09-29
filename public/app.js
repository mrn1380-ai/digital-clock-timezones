import { normalizeMarket, defaultFees, summary, histogram, grouped, practicalGap, BIN_LABELS } from '/lib/analysis.mjs';

const $ = id => document.getElementById(id);
const state = { data: null, market: 'both', metric: 'spread', factor: 'market', quote: 'all', search: '', sort: 'spread', direction: 1, page: 0, loading: false, fees: { ...defaultFees } };
const nf = new Intl.NumberFormat('fa-IR');
const en = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const bp = n => Number.isFinite(n) ? `${en.format(n < .01 ? Number(n.toFixed(4)) : n)} <span class="unit">bp</span>` : '—';
const short = n => !Number.isFinite(n) ? '—' : n >= 1e9 ? `${en.format(n / 1e9)}B` : n >= 1e6 ? `${en.format(n / 1e6)}M` : n >= 1e3 ? `${en.format(n / 1e3)}K` : en.format(n);
const time = date => new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
setInterval(() => { $('clock').textContent = `${time(new Date())} تهران`; }, 1000);
$('clock').textContent = `${time(new Date())} تهران`;

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8500), cache: 'no-store' });
  const body = await res.json();
  if (!res.ok || body?.code !== undefined) throw new Error(body?.msg || `HTTP ${res.status}`);
  return body;
}
async function browserMarket(market) {
  const origins = market === 'spot' ? ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api-gcp.binance.com', 'https://api1.binance.com', 'https://api2.binance.com', 'https://api3.binance.com', 'https://api4.binance.com'] : ['https://fapi.binance.com'];
  const pre = market === 'spot' ? '/api/v3' : '/fapi/v1';
  const errors = [];
  for (const origin of origins) {
    try {
      const [exchange, book, stats] = await Promise.all(['/exchangeInfo', '/ticker/bookTicker', '/ticker/24hr'].map(p => json(origin + pre + p)));
      if (!Array.isArray(exchange.symbols) || !Array.isArray(book) || !Array.isArray(stats)) throw new Error('پاسخ API ناقص است');
      return { exchange, book, stats, source: origin + ' (مرورگر)' };
    } catch (e) {
      errors.push(`${origin}: ${/restricted location/i.test(e.message) ? 'محدودیت منطقه‌ای Binance' : e.message}`);
      if (/restricted location/i.test(e.message)) break;
    }
  }
  return { error: errors.join(' | ') || 'دسترسی به API ممکن نیست' };
}
async function load(force = false) {
  if (state.loading) return;
  state.loading = true;
  $('refreshBtn').disabled = true;
  $('livePill').className = 'live-pill';
  $('livePill').innerHTML = '<i></i> در حال دریافت';
  $('snapshotTime').textContent = 'در حال دریافت داده...';
  try {
    let data;
    try {
      const res = await fetch('/api/snapshot' + (force ? '?refresh=1' : ''), { signal: AbortSignal.timeout(29000), cache:'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      data = { spot: { error: e.message }, futures: { error: e.message }, capturedAt: new Date().toISOString() };
    }
    // Browser-to-Binance fallback matters when the preview server runs in a restricted region.
    const missing = ['spot', 'futures'].filter(m => data[m]?.error);
    if (missing.length) {
      const recovered = await Promise.all(missing.map(m => browserMarket(m)));
      missing.forEach((m,i) => { if (!recovered[i].error) data[m] = recovered[i]; });
      if (recovered.some(r => !r.error)) data.capturedAt = new Date().toISOString();
    }
    state.data = data;
    state.page = 0;
    render();
  } catch (e) {
    $('notice').hidden = false;
    $('notice').textContent = `دریافت داده ممکن نشد: ${e.message}`;
    $('livePill').className = 'live-pill failed';
    $('livePill').innerHTML = '<i></i> ناموجود';
  } finally { state.loading = false; $('refreshBtn').disabled = false; }
}
function marketRows(m) { return normalizeMarket(state.data?.[m], m, state.fees); }
function visibleRows() {
  const markets = state.market === 'both' ? ['spot','futures'] : [state.market];
  return markets.flatMap(marketRows).filter(r => (state.quote === 'all' || r.quote === state.quote) && (!state.search || r.symbol.toLowerCase().includes(state.search.toLowerCase())));
}
function populateQuotes() {
  const all = [...marketRows('spot'), ...marketRows('futures')];
  const values = [...new Set(all.map(r => r.quote))].sort((a,b) => a.localeCompare(b));
  $('quoteSelect').innerHTML = '<option value="all">همه مظنه‌ها</option>' + values.map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join('');
  if (!values.includes(state.quote)) state.quote = 'all';
  $('quoteSelect').value = state.quote;
}
function render() {
  if (!state.data) return;
  const spot = marketRows('spot'), futures = marketRows('futures');
  $('sideSpot').textContent = state.data.spot?.error ? 'ناموجود' : nf.format(spot.length);
  $('sideFutures').textContent = state.data.futures?.error ? 'ناموجود' : nf.format(futures.length);
  const failures = ['spot', 'futures'].filter(m => state.data[m]?.error);
  const any = failures.length < 2;
  $('livePill').className = `live-pill ${any ? 'ready' : 'failed'}`;
  $('livePill').innerHTML = `<i></i> ${any ? failures.length ? 'داده ناقص' : 'داده دریافت شد' : 'داده ناموجود'}`;
  $('snapshotTime').textContent = any ? `آخرین دریافت: ${time(new Date(state.data.capturedAt))} تهران · عکس فوری` : 'داده زنده در دسترس نیست';
  const notice = $('notice');
  notice.hidden = failures.length === 0;
  if (failures.length) notice.innerHTML = `داده ${failures.map(m => m === 'spot' ? 'اسپات' : 'فیوچرز USDⓈ-M').join(' و ')} در دسترس نیست. این بخش حذف شده و اسپرد ساختگی نمایش داده نمی‌شود. <button class="diagnose-link" id="diagnoseBtn" type="button">علت اتصال را بررسی کن ←</button>`;
  populateQuotes();
  const rows = visibleRows();
  const s = summary(rows), total = summary(rows, 'roundtrip');
  $('statCount').textContent = nf.format(rows.length);
  $('statMedian').innerHTML = bp(s.median);
  $('statP90').innerHTML = bp(s.p90);
  $('statTotal').innerHTML = bp(total.median);
  $('histSubtitle').textContent = `سهم نمادهای هر بازار در هر بازه · ${state.metric === 'spread' ? 'اسپرد' : state.metric === 'roundtrip' ? 'هزینه رفت‌وبرگشت' : 'کارمزد taker'} · واحد: bp`;
  drawHistogram(rows);
  drawInsight(rows);
  drawFactors(rows);
  drawTable(rows);
}
function drawHistogram(rows) {
  if (!rows.length) { $('histogram').innerHTML = '<div class="empty-chart">داده‌ای برای این فیلتر در دسترس نیست.</div>'; return; }
  const by = { spot: rows.filter(r => r.market === 'spot'), futures: rows.filter(r => r.market === 'futures') };
  const counts = { spot: histogram(by.spot, state.metric), futures: histogram(by.futures, state.metric) };
  const fractions = ['spot','futures'].map(m => counts[m].map(x => by[m].length ? x / by[m].length * 100 : 0));
  const max = Math.max(1, ...fractions.flat());
  $('histogram').innerHTML = BIN_LABELS.map((label,i) => `<div class="chart-col"><div class="chart-bars"><span class="bar spot" style="height:${fractions[0][i] / max * 100}%" title="اسپات: ${en.format(fractions[0][i])}% (${counts.spot[i]} نماد)"></span><span class="bar futures" style="height:${fractions[1][i] / max * 100}%" title="فیوچرز: ${en.format(fractions[1][i])}% (${counts.futures[i]} نماد)"></span></div><div class="chart-label">${label}</div></div>`).join('');
}
function drawInsight(rows) {
  if (!rows.length) { $('insightBody').innerHTML = '<div class="empty-chart">برای این فیلتر داده‌ای موجود نیست.</div>'; return; }
  const spot = summary(rows.filter(r => r.market === 'spot'));
  const futures = summary(rows.filter(r => r.market === 'futures'));
  const s = summary(rows);
  let comparison = 'داده کافی برای مقایسه دو بازار موجود نیست';
  if (spot.n && futures.n) {
    const lower = spot.median <= futures.median ? 'اسپات' : 'فیوچرز';
    const a = Math.max(spot.median, futures.median), b = Math.min(spot.median, futures.median);
    comparison = `میانه اسپرد ${lower} ${en.format(b ? a/b : 0)}× کمتر از بازار دیگر است.`;
  } else if (spot.n || futures.n) comparison = 'برای مقایسه، داده هر دو بازار لازم است.';
  $('insightBody').innerHTML = `<div class="insight-highlight"><small>دامنه میانی اسپرد (۲۵٪ تا ۷۵٪)</small><strong>${en.format(s.p25)} – ${en.format(s.p75)} bp</strong><p>${escape(comparison)}</p></div><div class="insight-row"><span>میانه اسپات</span><b>${spot.n ? `${en.format(spot.median)} bp` : 'ناموجود'}</b></div><div class="insight-row"><span>میانه فیوچرز</span><b>${futures.n ? `${en.format(futures.median)} bp` : 'ناموجود'}</b></div><div class="insight-row"><span>بیشینه مشاهده‌شده</span><b>${en.format(s.max)} bp</b></div>`;
}
function drawFactors(rows) {
  if (!rows.length) {
    $('factorBars').innerHTML = '<div class="empty-chart">داده‌ای برای تحلیل عوامل موجود نیست.</div>';
    $('factorConclusion').textContent = '—'; return;
  }
  const groups = grouped(rows, state.factor);
  const gap = practicalGap(groups);
  let display = groups;
  if (state.factor === 'quote' && groups.length > 4) {
    const other = groups.slice(3).flatMap(g => g.items);
    display = [...groups.slice(0,3), { name:'سایر مظنه‌ها', ...summary(other), items:other }];
  }
  const max = Math.max(1, ...display.map(g => g.median || 0));
  $('factorBars').innerHTML = display.map(g => `<div class="factor-item"><div class="factor-title">${escape(g.name)} <span>${nf.format(g.n)} نماد</span></div><div class="factor-num">${en.format(g.median)} <small>bp</small></div><div class="track"><span style="width:${g.median / max * 100}%"></span></div></div>`).join('');
  let conclusion = 'گروه‌های کافی برای ارزیابی تفاوت عملی وجود ندارد (حداقل ۱۰ نماد در هر گروه لازم است).';
  if (gap) conclusion = gap.significant
    ? `تفاوت عملی قابل‌توجه: میانه «${gap.hi.name}» نسبت به «${gap.lo.name}» حدود ${en.format(gap.ratio)} برابر است (اختلاف ${en.format(gap.hi.median-gap.lo.median)} bp). این همبستگی توصیفی است، نه اثبات علت.`
    : `در گروه‌های با نمونه کافی، اختلاف میانه به آستانه تفاوت عملی (۲ برابر و ۱ bp) نمی‌رسد.`;
  if (state.factor === 'volume') conclusion += ' مقایسه فقط برای مظنه‌های تقریباً دلاری و حجم مثبت انجام شده است.';
  if (state.factor === 'tick') conclusion += ' گام قیمت کف مکانیکی اسپرد است، نه تنها عامل آن.';
  $('factorConclusion').textContent = conclusion;
}
function drawTable(rows) {
  $('tableCount').textContent = nf.format(rows.length);
  const ordered = [...rows].sort((a,b) => {
    const av = a[state.sort], bv = b[state.sort];
    if (av == null) return 1;
    if (bv == null) return -1;
    return state.direction * (typeof av === 'string' ? av.localeCompare(bv) : av - bv);
  });
  const pages = Math.max(1, Math.ceil(ordered.length / 12));
  state.page = Math.min(state.page, pages - 1);
  const pageRows = ordered.slice(state.page * 12, (state.page + 1) * 12);
  $('tableBody').innerHTML = pageRows.length ? pageRows.map(r => `<tr><td><div class="symbol-cell">${escape(r.symbol)}<small>${escape(r.base)} / ${escape(r.quote)}</small></div></td><td><span class="market-badge ${r.market}">${r.market === 'spot' ? 'اسپات' : 'فیوچرز'}</span></td><td class="${r.spread < 5 ? 'spread-good' : r.spread < 25 ? 'spread-mid' : 'spread-high'}">${en.format(r.spread)} bp</td><td>${en.format(r.feeMaker)} bp</td><td>${en.format(r.feeTaker)} bp</td><td>${en.format(r.roundtrip)} bp</td><td>${short(r.volume)}</td><td>${Number.isFinite(r.tickBps) ? `${en.format(r.tickBps)} bp` : '—'}</td></tr>`).join('') : '<tr><td colspan="8" class="table-empty">نمادی مطابق فیلترها پیدا نشد یا داده بازار در دسترس نیست.</td></tr>';
  $('pageInfo').textContent = ordered.length ? `نمایش ${nf.format(state.page*12+1)} تا ${nf.format(Math.min(ordered.length,(state.page+1)*12))} از ${nf.format(ordered.length)} نماد` : '۰ نماد';
  $('prevPage').disabled = state.page === 0;
  $('nextPage').disabled = state.page >= pages - 1;
}
function setTabs(id, key) {
  $(id).addEventListener('click', e => {
    const button = e.target.closest('button[data-value]'); if (!button) return;
    state[key] = button.dataset.value; state.page = 0;
    $(id).querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === button));
    render();
  });
}
setTabs('marketTabs','market'); setTabs('metricTabs','metric');
$('factorSelect').addEventListener('change', e => { state.factor = e.target.value; render(); });
$('quoteSelect').addEventListener('change', e => { state.quote = e.target.value; state.page = 0; render(); });
$('searchInput').addEventListener('input', e => { state.search = e.target.value.trim(); state.page = 0; render(); });
$('prevPage').addEventListener('click', () => { if (state.page > 0) { state.page--; render(); } });
$('nextPage').addEventListener('click', () => { state.page++; render(); });
document.querySelectorAll('th button[data-sort]').forEach(b => b.addEventListener('click', () => {
  const sort = b.dataset.sort;
  state.direction = state.sort === sort ? -state.direction : 1;
  state.sort = sort; state.page = 0; render();
}));
$('refreshBtn').addEventListener('click', () => load(true));
$('notice').addEventListener('click', e => { if (e.target.id === 'diagnoseBtn') diagnose(); });
$('closeNetwork').addEventListener('click', () => $('networkDialog').close());
async function diagnose() {
  const dialog = $('networkDialog'), target = $('diagnosisResults');
  dialog.showModal();
  target.textContent = 'در حال بررسی مسیر سرور و مرورگر...';
  const browserProbe = async url => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      const text = await response.text();
      return /restricted location/i.test(text) ? 'محدودیت منطقه‌ای Binance' : response.ok ? `پاسخ HTTP ${response.status}` : `خطای HTTP ${response.status}`;
    } catch { return 'دسترسی ناموفق (شبکه، CORS یا محدودیت منطقه‌ای؛ از مرورگر قابل تفکیک نیست)'; }
  };
  const [server, spot, futures] = await Promise.all([
    fetch('/api/connection').then(r => r.json()).catch(() => null),
    browserProbe('https://data-api.binance.vision/api/v3/time'),
    browserProbe('https://fapi.binance.com/fapi/v1/time')
  ]);
  const entries = [
    ['سرور · اینترنت عمومی', server?.general || 'نامشخص'],
    ['سرور · اسپات عمومی', server?.spotPublic || 'نامشخص'],
    ['سرور · API اصلی اسپات', server?.spotMain || 'نامشخص'],
    ['سرور · فیوچرز', server?.futures || 'نامشخص'],
    ['مرورگر شما · اسپات عمومی', spot],
    ['مرورگر شما · فیوچرز', futures]
  ];
  target.innerHTML = entries.map(([label, value]) => `<div class="diagnosis-row"><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join('');
}
$('feesBtn').addEventListener('click', () => {
  for (const [key, value] of Object.entries(state.fees)) $('feesDialog').querySelector(`[name=${key}]`).value = value;
  $('feesDialog').showModal();
});
$('resetFees').addEventListener('click', () => { state.fees = { ...defaultFees }; $('feesDialog').close('cancel'); $('feesBtn').textContent = '⚙ تنظیم کارمزد'; render(); });
$('feesDialog').addEventListener('close', () => {
  if ($('feesDialog').returnValue !== 'save') return;
  const form = $('feesDialog').querySelector('form');
  const fees = Object.fromEntries(Object.keys(defaultFees).map(key => [key, Number(form.elements[key].value)]));
  if (Object.values(fees).some(n => !Number.isFinite(n) || n < 0 || n > 100)) return;
  state.fees = fees; $('feesBtn').textContent = '⚙ کارمزد سفارشی'; render();
});
$('exportBtn').addEventListener('click', () => {
  const rows = visibleRows();
  if (!rows.length) { alert('برای خروجی، ابتدا داده معتبر دریافت کنید.'); return; }
  const columns = ['symbol','market','base','quote','bid','ask','spread','tickBps','feeMaker','feeTaker','roundtrip','volume','topNotional'];
  const csv = '\ufeff' + columns.join(',') + '\n' + rows.map(r => columns.map(k => r[k] ?? '').join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  a.download = `binance-costs-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
load();
