/**
 * Nobitex Live Market Data & OrderBook Module
 */

class MarketManager {
  constructor() {
    this.markets = [];
    this.currentQuote = 'IRT'; // 'IRT' or 'USDT'
    this.selectedSymbol = 'BTCIRT';
    this.searchQuery = '';

    this.tableBody = document.getElementById('market-table-body');
    this.searchEl = document.getElementById('market-search');
    this.tabIrt = document.getElementById('tab-irt');
    this.tabUsdt = document.getElementById('tab-usdt');

    this.obTitle = document.getElementById('ob-selected-title');
    this.obAsksEl = document.getElementById('ob-asks-list');
    this.obBidsEl = document.getElementById('ob-bids-list');
    this.obSpreadEl = document.getElementById('ob-spread-val');
    this.tradesListEl = document.getElementById('trades-list');

    this.bindEvents();
  }

  bindEvents() {
    if (this.tabIrt) {
      this.tabIrt.addEventListener('click', () => {
        this.currentQuote = 'IRT';
        this.tabIrt.classList.add('active');
        if (this.tabUsdt) this.tabUsdt.classList.remove('active');
        this.renderTable();
      });
    }

    if (this.tabUsdt) {
      this.tabUsdt.addEventListener('click', () => {
        this.currentQuote = 'USDT';
        this.tabUsdt.classList.add('active');
        if (this.tabIrt) this.tabIrt.classList.remove('active');
        this.renderTable();
      });
    }

    if (this.searchEl) {
      this.searchEl.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderTable();
      });
    }
  }

  setMarkets(markets) {
    if (!Array.isArray(markets)) return;
    this.markets = markets;
    this.renderTable();
  }

  updateMarkets(updatedMarkets) {
    if (!Array.isArray(updatedMarkets)) return;
    this.markets = updatedMarkets;
    this.renderTable();
  }

  renderTable() {
    if (!this.tableBody) return;

    let filtered = this.markets;

    // Filter by quote currency if needed
    if (this.currentQuote === 'IRT') {
      filtered = filtered.filter(m => m.symbol.endsWith('IRT'));
    } else {
      filtered = filtered.filter(m => m.symbol.endsWith('USDT') || m.symbol === 'USDTIRT');
    }

    // Filter by search query
    if (this.searchQuery) {
      filtered = filtered.filter(m =>
        m.symbol.toLowerCase().includes(this.searchQuery) ||
        m.nameFa.toLowerCase().includes(this.searchQuery) ||
        m.nameEn.toLowerCase().includes(this.searchQuery)
      );
    }

    this.tableBody.innerHTML = '';

    filtered.forEach(m => {
      const isSelected = m.symbol === this.selectedSymbol;
      const isPositive = m.change24h >= 0;
      const row = document.createElement('tr');
      if (isSelected) row.classList.add('selected');

      row.addEventListener('click', () => {
        this.selectSymbol(m.symbol);
      });

      const formattedPrice = this.formatPrice(m.price, m.symbol);
      const formattedHigh = this.formatPrice(m.high24h, m.symbol);
      const formattedLow = this.formatPrice(m.low24h, m.symbol);
      const formattedVol = this.formatVolume(m.volume24h, m.src);

      row.innerHTML = `
        <td>
          <div class="asset-cell">
            <div class="asset-icon">${m.icon || '🪙'}</div>
            <div class="asset-info">
              <span class="asset-name">${m.nameFa}</span>
              <span class="asset-symbol">${m.src} / ${m.dst === 'IRT' ? 'تومان' : 'USDT'}</span>
            </div>
          </div>
        </td>
        <td class="price-cell">${formattedPrice}</td>
        <td>
          <span class="change-badge ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}${m.change24h}% ${isPositive ? '▲' : '▼'}
          </span>
        </td>
        <td style="color: var(--text-muted); font-size: 0.74rem;">${formattedHigh} / ${formattedLow}</td>
        <td style="color: var(--text-secondary); font-size: 0.74rem;">${formattedVol}</td>
        <td>
          <span class="badge-tag" style="background: rgba(0, 192, 135, 0.1); border-color: rgba(0, 192, 135, 0.2); font-size: 0.65rem;">
            ${m.isClosed ? 'بسته' : 'معاملات فعال'}
          </span>
        </td>
      `;

      this.tableBody.appendChild(row);
    });
  }

  selectSymbol(symbol) {
    this.selectedSymbol = symbol;
    this.renderTable();
    if (this.obTitle) {
      const m = this.markets.find(item => item.symbol === symbol);
      this.obTitle.textContent = m ? `${m.nameFa} (${symbol})` : symbol;
    }

    // Trigger orderbook request via app/websocket
    if (window.app && window.app.requestOrderBook) {
      window.app.requestOrderBook(symbol);
    }
  }

  renderOrderBook(data) {
    if (!data || !this.obAsksEl || !this.obBidsEl) return;

    // Asks (Sell orders - red) - show top down
    this.obAsksEl.innerHTML = '';
    const maxAskTotal = data.asks.length ? data.asks[data.asks.length - 1].total : 1;
    data.asks.slice().reverse().forEach(item => {
      const depthPct = Math.min(100, (item.total / maxAskTotal) * 100);
      const row = document.createElement('div');
      row.className = 'ob-row ask';
      row.innerHTML = `
        <div class="depth-bar" style="width: ${depthPct}%;"></div>
        <span class="price">${this.formatNumber(item.price)}</span>
        <span class="amount">${item.amount}</span>
        <span class="total">${item.total}</span>
      `;
      this.obAsksEl.appendChild(row);
    });

    // Spread calculation
    if (data.asks.length && data.bids.length) {
      const bestAsk = data.asks[0].price;
      const bestBid = data.bids[0].price;
      const spread = bestAsk - bestBid;
      const spreadPct = ((spread / bestAsk) * 100).toFixed(2);
      if (this.obSpreadEl) {
        this.obSpreadEl.textContent = `اختلاف خرید/فروش: ${this.formatNumber(spread)} (${spreadPct}%)`;
      }
    }

    // Bids (Buy orders - green)
    this.obBidsEl.innerHTML = '';
    const maxBidTotal = data.bids.length ? data.bids[data.bids.length - 1].total : 1;
    data.bids.forEach(item => {
      const depthPct = Math.min(100, (item.total / maxBidTotal) * 100);
      const row = document.createElement('div');
      row.className = 'ob-row bid';
      row.innerHTML = `
        <div class="depth-bar" style="width: ${depthPct}%;"></div>
        <span class="price">${this.formatNumber(item.price)}</span>
        <span class="amount">${item.amount}</span>
        <span class="total">${item.total}</span>
      `;
      this.obBidsEl.appendChild(row);
    });
  }

  renderTrades(trades) {
    if (!this.tradesListEl || !Array.isArray(trades)) return;
    this.tradesListEl.innerHTML = '';

    trades.forEach(t => {
      const row = document.createElement('div');
      row.className = `ob-row ${t.type === 'buy' ? 'bid' : 'ask'}`;
      row.innerHTML = `
        <span class="price">${this.formatNumber(t.price)}</span>
        <span class="amount">${t.amount}</span>
        <span class="time" style="color: var(--text-muted); font-size: 0.68rem;">${t.time}</span>
      `;
      this.tradesListEl.appendChild(row);
    });
  }

  formatPrice(price, symbol) {
    if (!price && price !== 0) return '--';
    if (price < 10) {
      return price.toFixed(2);
    }
    return this.formatNumber(Math.round(price));
  }

  formatVolume(vol, symbol) {
    if (!vol) return '0';
    if (vol >= 1000000) {
      return (vol / 1000000).toFixed(1) + 'M ' + symbol;
    }
    if (vol >= 1000) {
      return (vol / 1000).toFixed(1) + 'K ' + symbol;
    }
    return vol.toFixed(2) + ' ' + symbol;
  }

  formatNumber(num) {
    return num.toLocaleString('en-US');
  }
}

window.MarketManager = MarketManager;
