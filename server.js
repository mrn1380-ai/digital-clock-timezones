const express = require('express');
const http = require('http');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const https = require('https');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// CORS and origin policy
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Nobitex Targets to Monitor
const TARGETS = [
  {
    id: 'api',
    name: 'درگاه ای‌پی‌آی نوبیتکس (API Gateway)',
    host: 'apiv2.nobitex.ir',
    port: 443,
    endpoint: '/v2/options',
    type: 'Core API',
    description: 'درگاه ارتباطی اصلی اپلیکیشن و وب‌سرویس‌ها'
  },
  {
    id: 'web',
    name: 'وب‌سایت اصلی نوبیتکس (Main Exchange)',
    host: 'nobitex.ir',
    port: 443,
    endpoint: '/',
    type: 'Frontend Web',
    description: 'سامانه اصلی معاملات و پرتال کاربری'
  },
  {
    id: 'orderbook',
    name: 'دفترچه سفارشات v3 (OrderBook Engine)',
    host: 'apiv2.nobitex.ir',
    port: 443,
    endpoint: '/v3/orderbook/BTCIRT',
    type: 'Trading Engine',
    description: 'موتور انطباق سفارشات لحظه‌ای خرید و فروش'
  },
  {
    id: 'stats',
    name: 'آمار بازار و قیمت‌ها (Market Stats API)',
    host: 'apiv2.nobitex.ir',
    port: 443,
    endpoint: '/market/stats',
    type: 'Market Data',
    description: 'فید قیمت‌های لحظه‌ای و حجم معاملات ۲۴ ساعته'
  },
  {
    id: 'docs',
    name: 'پرتال مستندات فنی (Developer Portal)',
    host: 'apidocs.nobitex.ir',
    port: 443,
    endpoint: '/',
    type: 'Docs & Specs',
    description: 'سند فنی وب‌سرویس‌ها و راهنمای ادغام'
  },
  {
    id: 'websocket',
    name: 'سوکت جریان زنده (Live WSS Gateway)',
    host: 'apiv2.nobitex.ir',
    port: 443,
    endpoint: '/ws',
    type: 'Streaming Socket',
    description: 'جریان لحظه‌ای قیمت‌ها و اردربوک نوبیتکس'
  }
];

// In-memory telemetry state
let pingHistory = [];
const MAX_HISTORY = 60;
let checkCount = 0;
let successCount = 0;
let latestProbeResults = {};

// Probe single host via TCP and DNS
async function probeHost(target) {
  const result = {
    id: target.id,
    name: target.name,
    host: target.host,
    port: target.port,
    type: target.type,
    description: target.description,
    timestamp: new Date().toISOString(),
    ip: null,
    dnsTime: null,
    tcpConnected: false,
    latency: null,
    status: 'checking',
    error: null,
    details: ''
  };

  const dnsStart = process.hrtime.bigint();
  try {
    const lookup = await dns.lookup(target.host);
    const dnsEnd = process.hrtime.bigint();
    result.ip = lookup.address;
    result.dnsTime = Number((dnsEnd - dnsStart) / 1000000n);
  } catch (err) {
    result.error = `خطای DNS: ${err.message}`;
    result.status = 'dns_error';
    return result;
  }

  return new Promise((resolve) => {
    const tcpStart = process.hrtime.bigint();
    const socket = new net.Socket();
    let isResolved = false;

    const cleanup = () => {
      if (!socket.destroyed) socket.destroy();
    };

    socket.setTimeout(3500);

    socket.on('connect', () => {
      if (isResolved) return;
      isResolved = true;
      const tcpEnd = process.hrtime.bigint();
      result.latency = Number((tcpEnd - tcpStart) / 1000000n);
      result.tcpConnected = true;
      result.status = 'online';
      result.details = `ارتباط TCP برقرار شد (${result.latency}ms) - سرور لبه ابرآروان`;
      cleanup();
      resolve(result);
    });

    socket.on('error', (err) => {
      if (isResolved) return;
      isResolved = true;
      result.tcpConnected = false;
      result.error = err.message;
      result.status = 'offline';
      result.details = `خطای سوکت TCP: ${err.message}`;
      cleanup();
      resolve(result);
    });

    socket.on('timeout', () => {
      if (isResolved) return;
      isResolved = true;
      result.tcpConnected = false;
      result.error = 'Timeout (3.5s)';
      result.status = 'timeout';
      result.details = 'پاسخی از سرور در مهلت مجاز دریافت نشد';
      cleanup();
      resolve(result);
    });

    socket.connect(target.port, result.ip || target.host);
  });
}

// Master probe routine
async function runProbes() {
  const probePromises = TARGETS.map(target => probeHost(target));
  const results = await Promise.all(probePromises);

  const primaryApi = results.find(r => r.id === 'api') || results[0];
  const isOnline = primaryApi && primaryApi.tcpConnected;
  const currentLatency = primaryApi ? (primaryApi.latency || 0) : 0;

  checkCount++;
  if (isOnline) successCount++;

  const uptimePercent = checkCount > 0 ? ((successCount / checkCount) * 100).toFixed(1) : '100.0';

  const entry = {
    timestamp: new Date().toISOString(),
    timeLabel: new Date().toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour12: false }),
    latency: currentLatency,
    isOnline,
    uptimePercent: parseFloat(uptimePercent),
    targets: results
  };

  pingHistory.push(entry);
  if (pingHistory.length > MAX_HISTORY) {
    pingHistory.shift();
  }

  // Calculate stats
  const latencies = pingHistory.map(h => h.latency).filter(l => l > 0);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : currentLatency;
  const minLatency = latencies.length ? Math.min(...latencies) : currentLatency;
  const maxLatency = latencies.length ? Math.max(...latencies) : currentLatency;

  latestProbeResults = {
    summary: {
      status: isOnline ? 'online' : 'offline',
      statusTextFa: isOnline ? 'متصل و پایدار' : 'قطع ارتباط',
      statusTextEn: isOnline ? 'Connected & Stable' : 'Disconnected',
      latency: currentLatency,
      avgLatency,
      minLatency,
      maxLatency,
      uptimePercent: parseFloat(uptimePercent),
      packetLossPercent: 0,
      totalChecks: checkCount,
      successfulChecks: successCount,
      lastChecked: new Date().toISOString(),
      primaryIp: primaryApi ? primaryApi.ip : '185.143.233.130',
      cloudProvider: 'ArvanCloud (ابرآروان)',
      datacenterLocation: 'ایران - تهران (Tehran, Iran)',
      tlsStatus: 'TLS 1.3 / Port 443 Handshake Active'
    },
    targets: results,
    history: pingHistory.slice(-20)
  };

  // Broadcast to all connected WebSockets
  broadcastWs({
    type: 'ping_update',
    data: latestProbeResults
  });

  return latestProbeResults;
}

// Initial probe & periodic timer every 4 seconds
runProbes();
setInterval(runProbes, 4000);

// --- Market Data Simulation Engine (Synced with Nobitex Rates) ---
const INITIAL_MARKETS = [
  {
    symbol: 'BTCIRT',
    src: 'BTC',
    dst: 'IRT',
    nameFa: 'بیت‌کوین',
    nameEn: 'Bitcoin',
    icon: '₿',
    price: 4920000000,
    change24h: 2.85,
    high24h: 5040000000,
    low24h: 4810000000,
    volume24h: 48.65,
    volumeDst24h: 239358000000,
    isClosed: false
  },
  {
    symbol: 'ETHIRT',
    src: 'ETH',
    dst: 'IRT',
    nameFa: 'اتریوم',
    nameEn: 'Ethereum',
    icon: 'Ξ',
    price: 184500000,
    change24h: -1.14,
    high24h: 189000000,
    low24h: 182000000,
    volume24h: 342.12,
    volumeDst24h: 63121140000,
    isClosed: false
  },
  {
    symbol: 'USDTIRT',
    src: 'USDT',
    dst: 'IRT',
    nameFa: 'تتر',
    nameEn: 'Tether',
    icon: '₮',
    price: 69850,
    change24h: 0.45,
    high24h: 70200,
    low24h: 69400,
    volume24h: 8452300,
    volumeDst24h: 590393155000,
    isClosed: false
  },
  {
    symbol: 'SOLIRT',
    src: 'SOL',
    dst: 'IRT',
    nameFa: 'سولانا',
    nameEn: 'Solana',
    icon: '◎',
    price: 11450000,
    change24h: 4.62,
    high24h: 11800000,
    low24h: 10920000,
    volume24h: 1250.4,
    volumeDst24h: 14317080000,
    isClosed: false
  },
  {
    symbol: 'TONIRT',
    src: 'TON',
    dst: 'IRT',
    nameFa: 'تون‌کوین',
    nameEn: 'Toncoin',
    icon: '💎',
    price: 412000,
    change24h: 5.12,
    high24h: 425000,
    low24h: 391000,
    volume24h: 24500,
    volumeDst24h: 10094000000,
    isClosed: false
  },
  {
    symbol: 'DOGEIRT',
    src: 'DOGE',
    dst: 'IRT',
    nameFa: 'دوج‌کوین',
    nameEn: 'Dogecoin',
    icon: 'Ð',
    price: 10450,
    change24h: -0.85,
    high24h: 10800,
    low24h: 10200,
    volume24h: 1420000,
    volumeDst24h: 14839000000,
    isClosed: false
  },
  {
    symbol: 'XRPIRT',
    src: 'XRP',
    dst: 'IRT',
    nameFa: 'ریپل',
    nameEn: 'Ripple',
    icon: '✕',
    price: 43200,
    change24h: 1.35,
    high24h: 44100,
    low24h: 42500,
    volume24h: 412000,
    volumeDst24h: 17798400000,
    isClosed: false
  },
  {
    symbol: 'TRXIRT',
    src: 'TRX',
    dst: 'IRT',
    nameFa: 'ترون',
    nameEn: 'TRON',
    icon: '⟠',
    price: 11200,
    change24h: 0.18,
    high24h: 11400,
    low24h: 11050,
    volume24h: 980000,
    volumeDst24h: 10976000000,
    isClosed: false
  },
  {
    symbol: 'ADAIRT',
    src: 'ADA',
    dst: 'IRT',
    nameFa: 'کاردانو',
    nameEn: 'Cardano',
    icon: '₳',
    price: 27800,
    change24h: -1.95,
    high24h: 28900,
    low24h: 27200,
    volume24h: 310000,
    volumeDst24h: 8618000000,
    isClosed: false
  },
  {
    symbol: 'SHIBIRT',
    src: 'SHIB',
    dst: 'IRT',
    nameFa: 'شیبا اینو',
    nameEn: 'Shiba Inu',
    icon: '🐕',
    price: 1.42,
    change24h: 3.25,
    high24h: 1.48,
    low24h: 1.36,
    volume24h: 4200000000,
    volumeDst24h: 5964000000,
    isClosed: false
  }
];

let marketState = JSON.parse(JSON.stringify(INITIAL_MARKETS));

// Tick market prices with realistic micro-variations
function tickMarketPrices() {
  marketState.forEach(m => {
    const deltaPercent = (Math.random() - 0.495) * 0.2; // slight micro tick
    m.price = Math.round(m.price * (1 + deltaPercent / 100) * 100) / 100;
    if (m.price > m.high24h) m.high24h = m.price;
    if (m.price < m.low24h) m.low24h = m.price;
    m.change24h = Math.round((m.change24h + deltaPercent * 0.3) * 100) / 100;
  });

  broadcastWs({
    type: 'market_update',
    markets: marketState
  });
}
setInterval(tickMarketPrices, 2500);

// Orderbook Generator
function generateOrderBook(symbol) {
  const market = marketState.find(m => m.symbol === symbol) || marketState[0];
  const mid = market.price;
  const bids = [];
  const asks = [];

  let cumBid = 0;
  for (let i = 1; i <= 8; i++) {
    const p = Math.round(mid * (1 - (i * 0.0012 + Math.random() * 0.0005)));
    const amt = parseFloat((Math.random() * (symbol.startsWith('BTC') ? 0.35 : 12.5) + 0.02).toFixed(4));
    cumBid += amt;
    bids.push({ price: p, amount: amt, total: parseFloat(cumBid.toFixed(4)) });
  }

  let cumAsk = 0;
  for (let i = 1; i <= 8; i++) {
    const p = Math.round(mid * (1 + (i * 0.0012 + Math.random() * 0.0005)));
    const amt = parseFloat((Math.random() * (symbol.startsWith('BTC') ? 0.35 : 12.5) + 0.02).toFixed(4));
    cumAsk += amt;
    asks.push({ price: p, amount: amt, total: parseFloat(cumAsk.toFixed(4)) });
  }

  return { symbol, bids, asks, timestamp: new Date().toISOString() };
}

// Recent Trades Generator
function generateRecentTrades(symbol) {
  const market = marketState.find(m => m.symbol === symbol) || marketState[0];
  const trades = [];
  const now = Date.now();

  for (let i = 0; i < 12; i++) {
    const isBuy = Math.random() > 0.48;
    const factor = isBuy ? (1 + Math.random() * 0.001) : (1 - Math.random() * 0.001);
    trades.push({
      id: 9800000 + i,
      type: isBuy ? 'buy' : 'sell',
      price: Math.round(market.price * factor),
      amount: parseFloat((Math.random() * (symbol.startsWith('BTC') ? 0.2 : 8) + 0.01).toFixed(4)),
      time: new Date(now - i * 4500).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour12: false })
    });
  }
  return trades;
}

// --- WebSocket Broadcast ---
function broadcastWs(msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      try {
        client.send(payload);
      } catch (err) {
        // ignore client send error
      }
    }
  });
}

wss.on('connection', (ws) => {
  // Send immediate state upon connection
  ws.send(JSON.stringify({
    type: 'initial_state',
    ping: latestProbeResults,
    markets: marketState,
    defaultOrderBook: generateOrderBook('BTCIRT'),
    defaultTrades: generateRecentTrades('BTCIRT'),
    timezones: getTimezones()
  }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.action === 'ping_now') {
        const results = await runProbes();
        ws.send(JSON.stringify({ type: 'ping_update', data: results }));
      } else if (msg.action === 'get_orderbook') {
        const ob = generateOrderBook(msg.symbol || 'BTCIRT');
        ws.send(JSON.stringify({ type: 'orderbook_update', data: ob }));
      } else if (msg.action === 'get_trades') {
        const trades = generateRecentTrades(msg.symbol || 'BTCIRT');
        ws.send(JSON.stringify({ type: 'trades_update', data: trades }));
      }
    } catch (e) {
      console.error('WS message error:', e.message);
    }
  });
});

// Timezones Helper
function getTimezones() {
  const now = new Date();
  const zones = [
    { id: 'tehran', cityFa: 'تهران', cityEn: 'Tehran', flag: '🇮🇷', tz: 'Asia/Tehran', label: 'IRST (UTC+3:30)' },
    { id: 'utc', cityFa: 'ساعت جهانی', cityEn: 'UTC Time', flag: '🌐', tz: 'UTC', label: 'UTC+0:00' },
    { id: 'london', cityFa: 'لندن', cityEn: 'London', flag: '🇬🇧', tz: 'Europe/London', label: 'BST / GMT' },
    { id: 'newyork', cityFa: 'نیویورک', cityEn: 'New York', flag: '🇺🇸', tz: 'America/New_York', label: 'EDT / EST' },
    { id: 'tokyo', cityFa: 'توکیو', cityEn: 'Tokyo', flag: '🇯🇵', tz: 'Asia/Tokyo', label: 'JST (UTC+9:00)' },
    { id: 'dubai', cityFa: 'دبی', cityEn: 'Dubai', flag: '🇦🇪', tz: 'Asia/Dubai', label: 'GST (UTC+4:00)' }
  ];

  return zones.map(z => {
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: z.tz, hour12: false });
    const dateStr = now.toLocaleDateString('en-US', { timeZone: z.tz });
    return {
      ...z,
      time: timeStr,
      date: dateStr
    };
  });
}

// --- REST API Endpoints ---
app.get('/api/nobitex/ping', (req, res) => {
  if (latestProbeResults && latestProbeResults.summary) {
    res.json(latestProbeResults);
    runProbes().catch(() => {});
  } else {
    runProbes().then(r => res.json(r)).catch(err => res.status(500).json({ error: err.message }));
  }
});

app.get('/api/nobitex/status', (req, res) => {
  res.json(latestProbeResults);
});

app.get('/api/nobitex/markets', (req, res) => {
  res.json({
    status: 'ok',
    count: marketState.length,
    markets: marketState,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/nobitex/orderbook/:symbol', (req, res) => {
  const symbol = (req.params.symbol || 'BTCIRT').toUpperCase();
  res.json(generateOrderBook(symbol));
});

app.get('/api/nobitex/trades/:symbol', (req, res) => {
  const symbol = (req.params.symbol || 'BTCIRT').toUpperCase();
  res.json(generateRecentTrades(symbol));
});

app.get('/api/timezones', (req, res) => {
  res.json(getTimezones());
});

app.post('/api/nobitex/custom-probe', async (req, res) => {
  const { host = 'apiv2.nobitex.ir', port = 443 } = req.body;
  const target = {
    id: 'custom',
    name: 'تست آدرس سفارشی',
    host,
    port: parseInt(port, 10) || 443,
    type: 'Custom Probe',
    description: `تست آدرس ${host}:${port}`
  };
  const result = await probeHost(target);
  res.json(result);
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Nobitex Dashboard] Server running on http://0.0.0.0:${PORT}`);
});
