/* ============================================
   Analytics Module – Ride Charts & Scores
   ============================================ */

class Analytics {
  constructor() {
    this.speedChartCanvas = null;
    this.speedChartCtx = null;
    this.safetyCanvas = null;
    this.safetyCtx = null;
    this.speedHistory = [];
    this.tempHistory = [];
    this.maxDataPoints = 60;
    this.safetyScore = 95;
    this.alertCount = 0;
    this.smoothRidingScore = 92;
    this.animFrame = null;
    this.animatedSafetyScore = 0;
  }

  init() {
    this.speedChartCanvas = document.getElementById('speed-chart-canvas');
    if (this.speedChartCanvas) {
      this.speedChartCtx = this.speedChartCanvas.getContext('2d');
      this._resizeSpeedChart();
    }

    this.safetyCanvas = document.getElementById('safety-score-canvas');
    if (this.safetyCanvas) {
      this.safetyCtx = this.safetyCanvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      this.safetyCanvas.width = 120 * dpr;
      this.safetyCanvas.height = 120 * dpr;
      this.safetyCtx.scale(dpr, dpr);
    }

    window.sensorSim.on('update', (data) => this._recordData(data));
    window.sensorSim.on('alert', (alert) => this._onAlert(alert));

    this._startRenderLoop();
  }

  _resizeSpeedChart() {
    if (!this.speedChartCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.speedChartCanvas.parentElement.getBoundingClientRect();
    this.speedChartCanvas.width = rect.width * dpr;
    this.speedChartCanvas.height = rect.height * dpr;
    this.speedChartCtx.scale(dpr, dpr);
    this.chartW = rect.width;
    this.chartH = rect.height;
  }

  _recordData(data) {
    this.speedHistory.push(data.speed);
    this.tempHistory.push(data.engineTemp);

    if (this.speedHistory.length > this.maxDataPoints) this.speedHistory.shift();
    if (this.tempHistory.length > this.maxDataPoints) this.tempHistory.shift();

    // Update analytics stats
    this._updateStat('analytics-distance', data.distanceTraveled.toFixed(1) + ' km');
    this._updateStat('analytics-maxspeed', Math.round(data.maxSpeed) + ' km/h');
    this._updateStat('analytics-avgspeed', data.avgSpeed + ' km/h');
    this._updateStat('analytics-fuel', (92 - data.fuelLevel).toFixed(1) + '%');

    // Riding score based on smooth speed changes
    if (this.speedHistory.length > 2) {
      const last3 = this.speedHistory.slice(-3);
      const variance = Math.abs(last3[2] - last3[1]) + Math.abs(last3[1] - last3[0]);
      if (variance < 5) {
        this.smoothRidingScore = Math.min(100, this.smoothRidingScore + 0.1);
      } else if (variance > 15) {
        this.smoothRidingScore = Math.max(50, this.smoothRidingScore - 0.3);
      }
    }

    this._updateStat('analytics-smooth', Math.round(this.smoothRidingScore));
  }

  _onAlert(alert) {
    this.alertCount++;
    // Reduce safety score on alerts
    if (alert.severity === 'danger') {
      this.safetyScore = Math.max(40, this.safetyScore - 3);
    } else {
      this.safetyScore = Math.max(50, this.safetyScore - 1);
    }

    this._updateStat('analytics-alerts', this.alertCount);
    this._addAlertHistoryItem(alert);
  }

  _addAlertHistoryItem(alert) {
    const list = document.getElementById('analytics-alert-log');
    if (!list) return;

    const item = document.createElement('div');
    item.className = `alert-item ${alert.severity}`;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    const typeNames = {
      speedWarning: 'Speed Warning', speedDanger: 'Speed Danger',
      tempWarning: 'Temp Warning', tempDanger: 'Temp Critical',
      blindSpotLeft: 'Blind Spot L', blindSpotLeftDanger: 'Blind Spot L!',
      blindSpotRight: 'Blind Spot R', blindSpotRightDanger: 'Blind Spot R!',
      obstacleAhead: 'Obstacle Ahead',
    };

    item.innerHTML = `
      <span class="alert-item__icon">${alert.severity === 'danger' ? '🚨' : '⚠️'}</span>
      <div class="alert-item__content">
        <div class="alert-item__message">${typeNames[alert.type] || alert.type}</div>
        <div class="alert-item__time">${time}</div>
      </div>
    `;

    list.insertBefore(item, list.firstChild);
    while (list.children.length > 15) list.removeChild(list.lastChild);
  }

  _updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  _startRenderLoop() {
    const render = () => {
      this._drawSpeedChart();
      this._drawSafetyScore();
      this.animFrame = requestAnimationFrame(render);
    };
    render();
  }

  _drawSpeedChart() {
    const ctx = this.speedChartCtx;
    if (!ctx || this.speedHistory.length < 2) return;

    const w = this.chartW || 400;
    const h = this.chartH || 200;
    const pad = { top: 20, right: 10, bottom: 25, left: 35 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0c0c18';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Labels
      const label = Math.round(180 - (180 / 4) * i);
      ctx.font = '9px JetBrains Mono';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.textAlign = 'right';
      ctx.fillText(label, pad.left - 5, y + 3);
    }

    // Speed line
    const data = this.speedHistory;
    const step = plotW / (this.maxDataPoints - 1);

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    data.forEach((val, i) => {
      const x = pad.left + i * step;
      const y = pad.top + plotH - (val / 180) * plotH;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (data.length - 1) * step, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Speed line (solid)
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = pad.left + i * step;
      const y = pad.top + plotH - (val / 180) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00d4ff';
    ctx.stroke();

    // Temperature line (overlay, lighter)
    if (this.tempHistory.length > 1) {
      ctx.beginPath();
      this.tempHistory.forEach((val, i) => {
        const x = pad.left + i * step;
        const y = pad.top + plotH - ((val - 50) / 70) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 136, 0, 0.5)';
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Current value dot
    if (data.length > 0) {
      const lastX = pad.left + (data.length - 1) * step;
      const lastY = pad.top + plotH - (data[data.length - 1] / 180) * plotH;

      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#00d4ff';
      ctx.fill();
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Legend
    ctx.font = '9px Inter';
    ctx.fillStyle = '#00d4ff';
    ctx.textAlign = 'left';
    ctx.fillText('● Speed', pad.left + 5, h - 5);

    ctx.fillStyle = 'rgba(255, 136, 0, 0.7)';
    ctx.fillText('- - Temp', pad.left + 65, h - 5);
  }

  _drawSafetyScore() {
    const ctx = this.safetyCtx;
    if (!ctx) return;

    this.animatedSafetyScore += (this.safetyScore - this.animatedSafetyScore) * 0.05;

    const w = 120, h = 120;
    const cx = w / 2, cy = h / 2;
    const radius = 48;
    const lineWidth = 6;

    ctx.clearRect(0, 0, w, h);

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.stroke();

    // Score ring
    const pct = this.animatedSafetyScore / 100;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * pct;

    const gradient = ctx.createLinearGradient(0, 0, w, h);
    if (this.safetyScore >= 80) {
      gradient.addColorStop(0, '#00ff88');
      gradient.addColorStop(1, '#00d4ff');
    } else if (this.safetyScore >= 60) {
      gradient.addColorStop(0, '#ffe600');
      gradient.addColorStop(1, '#ff8800');
    } else {
      gradient.addColorStop(0, '#ff8800');
      gradient.addColorStop(1, '#ff2d55');
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Update number display
    const numEl = document.getElementById('safety-score-number');
    const gradeEl = document.getElementById('safety-score-grade');
    if (numEl) numEl.textContent = Math.round(this.animatedSafetyScore);
    if (gradeEl) {
      if (this.safetyScore >= 90) gradeEl.textContent = 'EXCELLENT';
      else if (this.safetyScore >= 80) gradeEl.textContent = 'GREAT';
      else if (this.safetyScore >= 70) gradeEl.textContent = 'GOOD';
      else if (this.safetyScore >= 60) gradeEl.textContent = 'FAIR';
      else gradeEl.textContent = 'NEEDS WORK';
    }
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}

window.analytics = new Analytics();
