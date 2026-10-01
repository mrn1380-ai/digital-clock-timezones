/**
 * Main Application Orchestrator
 * Coordinates WebSocket telemetry, REST fallback, UI events, and modals
 */

class App {
  constructor() {
    this.ws = null;
    this.refreshInterval = 4000;
    this.refreshTimer = null;
    this.isManualRefreshing = false;

    // Submodules
    this.clock = null;
    this.chart = null;
    this.market = null;
    this.connection = null;

    this.init();
  }

  init() {
    // 1. Initialize Submodules
    this.clock = new WorldClock();
    this.chart = new LatencyChart('latency-canvas');
    this.market = new MarketManager();
    this.connection = new ConnectionMonitor();

    // 2. Setup WebSocket Connection
    this.connectWs();

    // 3. Fallback Initial REST Fetch
    this.fetchInitialData();

    // 4. Bind UI Controls
    this.bindControls();
    this.bindSettingsModal();
    this.bindThemeAndLang();

    // 5. Initial welcome toast
    setTimeout(() => {
      this.showToast('داشبورد وضعیت اتصال نوبیتکس آماده به کار است', 'success');
    }, 800);
  }

  connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS] Connected to dashboard telemetry stream');
        this.connection.addLog('WSS_CONNECT', 'Local Host', 'متصل', '0 ms', 'برقراری موفقیت‌آمیز سوکت تلمتری');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleWsMessage(msg);
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        console.warn('[WS] Stream closed, retrying in 3s...');
        setTimeout(() => this.connectWs(), 3000);
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (e) {
      console.error('[WS] Initialization error:', e);
    }
  }

  handleWsMessage(msg) {
    switch (msg.type) {
      case 'initial_state':
        if (msg.ping) {
          this.connection.handleServerUpdate(msg.ping);
          if (msg.ping.history) this.chart.setData(msg.ping.history);
        }
        if (msg.markets) this.market.setMarkets(msg.markets);
        if (msg.defaultOrderBook) this.market.renderOrderBook(msg.defaultOrderBook);
        if (msg.defaultTrades) this.market.renderTrades(msg.defaultTrades);
        break;

      case 'ping_update':
        if (msg.data) {
          this.connection.handleServerUpdate(msg.data);
          if (msg.data.history) this.chart.setData(msg.data.history);
        }
        break;

      case 'market_update':
        if (msg.markets) {
          this.market.updateMarkets(msg.markets);
        }
        break;

      case 'orderbook_update':
        if (msg.data) {
          this.market.renderOrderBook(msg.data);
        }
        break;

      case 'trades_update':
        if (msg.data) {
          this.market.renderTrades(msg.data);
        }
        break;
    }
  }

  async fetchInitialData() {
    try {
      const [pingRes, marketRes, obRes, tradesRes] = await Promise.all([
        fetch('/api/nobitex/ping').then(r => r.json()).catch(() => null),
        fetch('/api/nobitex/markets').then(r => r.json()).catch(() => null),
        fetch('/api/nobitex/orderbook/BTCIRT').then(r => r.json()).catch(() => null),
        fetch('/api/nobitex/trades/BTCIRT').then(r => r.json()).catch(() => null)
      ]);

      if (pingRes) {
        this.connection.handleServerUpdate(pingRes);
        if (pingRes.history) this.chart.setData(pingRes.history);
      }
      if (marketRes && marketRes.markets) {
        this.market.setMarkets(marketRes.markets);
      }
      if (obRes) {
        this.market.renderOrderBook(obRes);
      }
      if (tradesRes) {
        this.market.renderTrades(tradesRes);
      }
    } catch (e) {
      console.error('Initial fetch failed:', e);
    }
  }

  requestOrderBook(symbol) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'get_orderbook', symbol }));
      this.ws.send(JSON.stringify({ action: 'get_trades', symbol }));
    } else {
      fetch(`/api/nobitex/orderbook/${symbol}`)
        .then(r => r.json())
        .then(data => this.market.renderOrderBook(data))
        .catch(console.error);

      fetch(`/api/nobitex/trades/${symbol}`)
        .then(r => r.json())
        .then(data => this.market.renderTrades(data))
        .catch(console.error);
    }
  }

  bindControls() {
    // Refresh Now Button
    const refreshBtn = document.getElementById('btn-refresh-now');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        if (this.isManualRefreshing) return;
        this.isManualRefreshing = true;

        const icon = refreshBtn.querySelector('svg') || refreshBtn.querySelector('span');
        if (icon) icon.classList.add('spin-anim');

        this.showToast('در حال بررسی و تست مجدد اتصال نوبیتکس...', 'info');

        try {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'ping_now' }));
          } else {
            const data = await fetch('/api/nobitex/ping').then(r => r.json());
            this.connection.handleServerUpdate(data);
          }
          await this.connection.runClientProbe();
          this.showToast('بررسی اتصال با موفقیت انجام شد', 'success');
        } catch (e) {
          this.showToast('خطا در بررسی اتصال', 'error');
        } finally {
          setTimeout(() => {
            if (icon) icon.classList.remove('spin-anim');
            this.isManualRefreshing = false;
          }, 600);
        }
      });
    }

    // Refresh Interval Select
    const intervalSelect = document.getElementById('select-refresh-interval');
    if (intervalSelect) {
      intervalSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setupAutoRefresh(val);
      });
    }

    // Clear Logs Button
    const clearLogsBtn = document.getElementById('btn-clear-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        this.connection.clearLogs();
        this.showToast('لاگ‌های اتصال پاک شدند', 'info');
      });
    }
  }

  setupAutoRefresh(seconds) {
    if (this.refreshTimer) clearInterval(this.refreshTimer);

    if (seconds > 0) {
      this.refreshInterval = seconds * 1000;
      this.refreshTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'ping_now' }));
        } else {
          fetch('/api/nobitex/ping')
            .then(r => r.json())
            .then(data => this.connection.handleServerUpdate(data))
            .catch(console.error);
        }
      }, this.refreshInterval);
      this.showToast(`بررسی خودکار تنظیم شد: هر ${seconds} ثانیه`, 'info');
    } else {
      this.showToast('بررسی خودکار غیرفعال شد', 'info');
    }
  }

  bindSettingsModal() {
    const openBtn = document.getElementById('btn-open-settings');
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const form = document.getElementById('custom-probe-form');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => modal.classList.add('open'));
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    }

    // Custom Probe Submit
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const hostInput = document.getElementById('custom-host');
        const portInput = document.getElementById('custom-port');
        const resultEl = document.getElementById('custom-probe-result');

        const host = hostInput.value.trim() || 'apiv2.nobitex.ir';
        const port = parseInt(portInput.value, 10) || 443;

        resultEl.innerHTML = '<span style="color: var(--color-amber);">در حال ارسال درخواست پینگ...</span>';

        try {
          const res = await fetch('/api/nobitex/custom-probe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port })
          }).then(r => r.json());

          if (res.tcpConnected) {
            resultEl.innerHTML = `
              <div style="color: var(--color-green); font-weight: bold; margin-top: 0.5rem;">
                ✓ موفق: اتصال TCP به ${res.host}:${res.port} برقرار شد
              </div>
              <div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 0.25rem;">
                آی‌پی: ${res.ip} | تاخیر: ${res.latency} ms | زمان DNS: ${res.dnsTime ? res.dnsTime.toFixed(1) : '--'} ms
              </div>
            `;
            this.showToast(`تست اتصال به ${host} موفق بود (${res.latency}ms)`, 'success');
          } else {
            resultEl.innerHTML = `
              <div style="color: var(--color-red); font-weight: bold; margin-top: 0.5rem;">
                ✕ ناموفق: عدم برقراری اتصال
              </div>
              <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.25rem;">
                علت: ${res.error || 'Timeout یا محدودیت فایروال'}
              </div>
            `;
            this.showToast(`عدم پاسخ‌گویی از ${host}`, 'error');
          }
        } catch (err) {
          resultEl.innerHTML = `<span style="color: var(--color-red);">خطا در ارسال درخواست: ${err.message}</span>`;
        }
      });
    }
  }

  bindThemeAndLang() {
    // Theme Toggle
    const themeBtn = document.getElementById('btn-toggle-theme');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        this.chart.render();
      });
    }

    // Language Toggle (FA / EN)
    const langBtn = document.getElementById('btn-toggle-lang');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const isRtl = !document.body.classList.contains('ltr');
        if (isRtl) {
          document.body.classList.add('ltr');
          langBtn.textContent = 'FA';
        } else {
          document.body.classList.remove('ltr');
          langBtn.textContent = 'EN';
        }
        this.chart.render();
      });
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    let borderColor = 'var(--color-cyan)';
    if (type === 'success') {
      icon = '✓';
      borderColor = 'var(--color-green)';
    } else if (type === 'error') {
      icon = '✕';
      borderColor = 'var(--color-red)';
    }

    toast.style.borderLeft = `3px solid ${borderColor}`;
    toast.innerHTML = `
      <span style="font-weight: bold; color: ${borderColor};">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
