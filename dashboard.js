/* ============================================
   Dashboard Module – Speedometer & Gauges
   ============================================ */

class Dashboard {
  constructor() {
    this.speedCanvas = null;
    this.speedCtx = null;
    this.currentSpeed = 0;
    this.animatedSpeed = 0;
    this.animFrame = null;
  }

  init() {
    this.speedCanvas = document.getElementById('speedometer-canvas');
    if (this.speedCanvas) {
      this.speedCtx = this.speedCanvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      this.speedCanvas.width = 260 * dpr;
      this.speedCanvas.height = 260 * dpr;
      this.speedCtx.scale(dpr, dpr);
    }

    this._startRenderLoop();

    // Listen for sensor updates
    window.sensorSim.on('update', (data) => this.updateData(data));
    window.sensorSim.on('alert', (alert) => this.addAlert(alert));

    // Listen for ALITA speaking
    window.alita.on('speakStart', (data) => this.showVoiceMessage(data.text, true));
    window.alita.on('speakEnd', () => this.showVoiceMessage('', false));
  }

  updateData(data) {
    this.currentSpeed = data.speed;

    // Update speed display text
    const speedVal = document.getElementById('speed-value');
    if (speedVal) speedVal.textContent = Math.round(data.speed);

    // Gear
    const gearEl = document.getElementById('gear-display');
    if (gearEl) gearEl.textContent = `GEAR ${data.gear}`;

    // RPM
    const rpmEl = document.getElementById('rpm-value');
    if (rpmEl) rpmEl.textContent = Math.round(data.rpm).toLocaleString();

    // Temperature bar
    const tempBar = document.getElementById('temp-bar');
    const tempVal = document.getElementById('temp-value');
    if (tempBar) {
      const pct = Math.min(100, ((data.engineTemp - 50) / 70) * 100);
      tempBar.style.width = pct + '%';
      if (data.engineTemp > 105) {
        tempBar.style.background = 'linear-gradient(90deg, #ff2d55, #ff0033)';
      } else if (data.engineTemp > 90) {
        tempBar.style.background = 'linear-gradient(90deg, #ff8800, #ff2d55)';
      } else {
        tempBar.style.background = 'linear-gradient(90deg, #00ff88, #ffe600, #ff8800)';
      }
    }
    if (tempVal) tempVal.textContent = Math.round(data.engineTemp) + '°C';

    // Stats
    this._updateStat('stat-distance', data.distanceTraveled.toFixed(1));
    this._updateStat('stat-fuel', Math.round(data.fuelLevel) + '%');
    this._updateStat('stat-avgspeed', data.avgSpeed);

    const mins = Math.floor(data.rideDuration / 60);
    const secs = data.rideDuration % 60;
    this._updateStat('stat-duration', `${mins}:${secs.toString().padStart(2, '0')}`);

    // Update status dot
    const statusDot = document.getElementById('engine-status-dot');
    if (statusDot) {
      statusDot.className = 'status-dot';
      if (!data.engineRunning) statusDot.classList.add('offline');
      else if (data.engineTemp > 105) statusDot.classList.add('danger');
      else if (data.engineTemp > 90 || data.speed > 100) statusDot.classList.add('warning');
    }
  }

  _updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  addAlert(alert) {
    const feed = document.getElementById('alert-feed');
    if (!feed) return;

    const icons = {
      speedWarning: '⚡',
      speedDanger: '🚨',
      tempWarning: '🌡️',
      tempDanger: '🔥',
      blindSpotLeft: '◀️',
      blindSpotLeftDanger: '🚨',
      blindSpotRight: '▶️',
      blindSpotRightDanger: '🚨',
      obstacleAhead: '⛔',
    };

    const messages = {
      speedWarning: `Speed warning: ${Math.round(alert.value)} km/h`,
      speedDanger: `DANGER! Speed: ${Math.round(alert.value)} km/h — Slow down!`,
      tempWarning: `Engine temp rising: ${Math.round(alert.value)}°C`,
      tempDanger: `CRITICAL! Engine temp: ${Math.round(alert.value)}°C`,
      blindSpotLeft: `Left blind spot: object at ${alert.value}cm`,
      blindSpotLeftDanger: `LEFT SIDE DANGER! Object at ${alert.value}cm`,
      blindSpotRight: `Right blind spot: object at ${alert.value}cm`,
      blindSpotRightDanger: `RIGHT SIDE DANGER! Object at ${alert.value}cm`,
      obstacleAhead: `OBSTACLE AHEAD! Distance: ${alert.value}cm`,
    };

    const item = document.createElement('div');
    item.className = `alert-item ${alert.severity}`;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    item.innerHTML = `
      <span class="alert-item__icon">${icons[alert.type] || '⚠️'}</span>
      <div class="alert-item__content">
        <div class="alert-item__message">${messages[alert.type] || alert.type}</div>
        <div class="alert-item__time">${time}</div>
      </div>
    `;

    feed.insertBefore(item, feed.firstChild);

    // Keep only last 20 alerts
    while (feed.children.length > 20) {
      feed.removeChild(feed.lastChild);
    }

    // ALITA voice response for alerts
    this._handleAlertVoice(alert);
  }

  _handleAlertVoice(alert) {
    const alita = window.alita;
    switch (alert.type) {
      case 'speedWarning':
      case 'speedDanger':
        alita.setEmotion(alert.severity === 'danger' ? 'critical' : 'warning');
        alita.speakResponse('speedWarning', { speed: Math.round(alert.value) }, alert.severity === 'danger' ? 'critical' : 'normal');
        break;
      case 'blindSpotLeft':
      case 'blindSpotLeftDanger':
        alita.setEmotion('alert');
        alita.speakResponse('blindSpotLeft', {}, 'critical');
        break;
      case 'blindSpotRight':
      case 'blindSpotRightDanger':
        alita.setEmotion('alert');
        alita.speakResponse('blindSpotRight', {}, 'critical');
        break;
      case 'obstacleAhead':
        alita.setEmotion('critical');
        alita.speakResponse('obstacleAhead', {}, 'critical');
        break;
      case 'tempWarning':
        alita.setEmotion('warning');
        alita.speakResponse('temperatureWarning', { temp: Math.round(alert.value) });
        break;
      case 'tempDanger':
        alita.setEmotion('critical');
        alita.speakResponse('temperatureCritical', { temp: Math.round(alert.value) }, 'critical');
        break;
    }

    // Reset emotion after delay
    setTimeout(() => alita.setEmotion('calm'), 5000);
  }

  showVoiceMessage(text, speaking) {
    const indicator = document.getElementById('alita-voice-indicator');
    const messageEl = document.getElementById('alita-voice-message');
    const waveEl = document.getElementById('voice-wave');

    if (indicator) indicator.classList.toggle('speaking', speaking);
    if (messageEl) messageEl.textContent = text || 'Awaiting next event...';
    if (waveEl) waveEl.classList.toggle('active', speaking);
  }

  // Render speedometer
  _startRenderLoop() {
    const render = () => {
      // Smooth speed animation
      this.animatedSpeed += (this.currentSpeed - this.animatedSpeed) * 0.08;
      this._drawSpeedometer(this.animatedSpeed);
      this.animFrame = requestAnimationFrame(render);
    };
    render();
  }

  _drawSpeedometer(speed) {
    const ctx = this.speedCtx;
    if (!ctx) return;

    const w = 260, h = 260;
    const cx = w / 2, cy = h / 2;
    const radius = 110;

    ctx.clearRect(0, 0, w, h);

    // Arc angles
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalAngle = endAngle - startAngle;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle, false);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Speed arc
    const speedPct = Math.min(1, speed / 180);
    const speedAngle = startAngle + speedPct * totalAngle;

    // Gradient for speed arc
    const gradient = ctx.createLinearGradient(0, h, w, 0);
    if (speed > 110) {
      gradient.addColorStop(0, '#ff2d55');
      gradient.addColorStop(1, '#ff8800');
    } else if (speed > 80) {
      gradient.addColorStop(0, '#00d4ff');
      gradient.addColorStop(1, '#ff8800');
    } else {
      gradient.addColorStop(0, '#00d4ff');
      gradient.addColorStop(1, '#7b2dff');
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, speedAngle, false);
    ctx.lineWidth = 8;
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Glow effect
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, speedAngle, false);
    ctx.lineWidth = 16;
    ctx.strokeStyle = speed > 110 ? 'rgba(255, 45, 85, 0.15)' : 'rgba(0, 212, 255, 0.15)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Speed tick marks
    for (let i = 0; i <= 18; i++) {
      const angle = startAngle + (i / 18) * totalAngle;
      const isMajor = i % 3 === 0;
      const tickLen = isMajor ? 15 : 8;
      const outerR = radius - 15;
      const innerR = outerR - tickLen;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.lineTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
      ctx.stroke();

      // Speed labels for major ticks
      if (isMajor) {
        const labelR = innerR - 14;
        const label = (i / 18 * 180).toFixed(0);
        ctx.font = '9px Orbitron';
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx + Math.cos(angle) * labelR, cy + Math.sin(angle) * labelR);
      }
    }

    // Needle dot at speed position
    const dotR = radius - 2;
    const dotX = cx + Math.cos(speedAngle) * dotR;
    const dotY = cy + Math.sin(speedAngle) * dotR;

    ctx.beginPath();
    ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
    ctx.fillStyle = speed > 110 ? '#ff2d55' : '#00d4ff';
    ctx.fill();
    ctx.shadowColor = speed > 110 ? '#ff2d55' : '#00d4ff';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner circle decoration
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(123, 45, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}

window.dashboard = new Dashboard();
