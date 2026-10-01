/**
 * Real-Time Latency Canvas Chart
 * Lightweight, high-performance canvas line chart with gradient fill and tooltips
 */

class LatencyChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.dataPoints = [];
    this.maxPoints = 30;
    this.hoverIndex = -1;

    this.minEl = document.getElementById('chart-min-val');
    this.maxEl = document.getElementById('chart-max-val');
    this.avgEl = document.getElementById('chart-avg-val');

    this.initCanvas();
    this.bindEvents();
  }

  initCanvas() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height || 180;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  setData(history) {
    if (!Array.isArray(history)) return;
    this.dataPoints = history.map(item => ({
      latency: item.latency || 1,
      time: item.timeLabel || '',
      isOnline: item.isOnline
    }));

    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints = this.dataPoints.slice(-this.maxPoints);
    }

    this.updateStats();
    this.render();
  }

  addPoint(point) {
    this.dataPoints.push(point);
    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints.shift();
    }
    this.updateStats();
    this.render();
  }

  updateStats() {
    const vals = this.dataPoints.map(p => p.latency).filter(l => l > 0);
    if (!vals.length) return;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);

    if (this.minEl) this.minEl.textContent = `${min} ms`;
    if (this.maxEl) this.maxEl.textContent = `${max} ms`;
    if (this.avgEl) this.avgEl.textContent = `${avg} ms`;
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const count = this.dataPoints.length;
      if (count < 2) return;

      const paddingLeft = 35;
      const paddingRight = 20;
      const step = (this.width - paddingLeft - paddingRight) / (count - 1);
      const index = Math.round((x - paddingLeft) / step);

      if (index >= 0 && index < count) {
        this.hoverIndex = index;
        this.render();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverIndex = -1;
      this.render();
    });
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    const paddingTop = 25;
    const paddingBottom = 30;
    const paddingLeft = 45;
    const paddingRight = 20;

    const plotW = w - paddingLeft - paddingRight;
    const plotH = h - paddingTop - paddingBottom;

    if (this.dataPoints.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px var(--font-family)';
      ctx.textAlign = 'center';
      ctx.fillText('در حال جمع‌آوری داده‌های تاخیر زمانی...', w / 2, h / 2);
      return;
    }

    // Determine scale
    const latencies = this.dataPoints.map(p => p.latency);
    let maxVal = Math.max(...latencies, 20);
    maxVal = Math.ceil(maxVal * 1.25);
    const minVal = 0;

    // Draw Grid Lines & Labels
    const gridSteps = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridSteps; i++) {
      const yVal = Math.round(minVal + (maxVal - minVal) * (i / gridSteps));
      const y = paddingTop + plotH - (plotH * (i / gridSteps));

      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(w - paddingRight, y);
      ctx.stroke();

      ctx.fillText(`${yVal}ms`, paddingLeft - 8, y + 3);
    }

    // Compute coordinate points
    const stepX = plotW / (this.dataPoints.length - 1);
    const points = this.dataPoints.map((pt, idx) => {
      const x = paddingLeft + idx * stepX;
      const yRatio = (pt.latency - minVal) / (maxVal - minVal);
      const y = paddingTop + plotH - (plotH * yRatio);
      return { x, y, ...pt };
    });

    // Draw Gradient Area
    const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + plotH);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, paddingTop + plotH);
    ctx.lineTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const xc = (points[i].x + points[i - 1].x) / 2;
      const yc = (points[i].y + points[i - 1].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(points[points.length - 1].x, paddingTop + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Smooth Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const xc = (points[i].x + points[i - 1].x) / 2;
      const yc = (points[i].y + points[i - 1].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Draw Latest Pulsing Head Dot
    const lastPt = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00c087';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hover Tooltip
    if (this.hoverIndex >= 0 && this.hoverIndex < points.length) {
      const hp = points[this.hoverIndex];

      // Vertical guide line
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(hp.x, paddingTop);
      ctx.lineTo(hp.x, paddingTop + plotH);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.stroke();

      // Tooltip Box
      const text = `${hp.latency} ms | ${hp.time}`;
      ctx.font = '11px monospace';
      const textWidth = ctx.measureText(text).width;
      const boxW = textWidth + 16;
      const boxH = 24;
      let boxX = hp.x - boxW / 2;
      let boxY = hp.y - 34;

      if (boxX < paddingLeft) boxX = paddingLeft;
      if (boxX + boxW > w - paddingRight) boxX = w - paddingRight - boxW;
      if (boxY < 5) boxY = hp.y + 12;

      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(text, boxX + boxW / 2, boxY + 16);
    }
  }
}

window.LatencyChart = LatencyChart;
