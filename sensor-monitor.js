/* ============================================
   Sensor Monitor Module – Radar & Hardware
   ============================================ */

class SensorMonitor {
  constructor() {
    this.radarCanvas = null;
    this.radarCtx = null;
    this.animFrame = null;
    this.radarAngle = 0;
    this.serialLines = [];
    this.maxSerialLines = 40;
  }

  init() {
    this.radarCanvas = document.getElementById('radar-canvas');
    if (this.radarCanvas) {
      this.radarCtx = this.radarCanvas.getContext('2d');
      this._resizeRadar();
      window.addEventListener('resize', () => this._resizeRadar());
    }

    window.sensorSim.on('update', (data) => this._onUpdate(data));
    this._startRenderLoop();
  }

  _resizeRadar() {
    if (!this.radarCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.radarCanvas.parentElement.getBoundingClientRect();
    this.radarCanvas.width = rect.width * dpr;
    this.radarCanvas.height = rect.height * dpr;
    this.radarCtx.scale(dpr, dpr);
    this.radarW = rect.width;
    this.radarH = rect.height;
  }

  _onUpdate(data) {
    // Update sensor cards
    this._updateSensor('sensor-speed', Math.round(data.speed), 'km/h');
    this._updateSensor('sensor-rpm', Math.round(data.rpm).toLocaleString(), 'RPM');
    this._updateSensor('sensor-temp', Math.round(data.engineTemp), '°C');
    this._updateSensor('sensor-fuel', Math.round(data.fuelLevel), '%');
    this._updateSensor('sensor-battery', data.batteryVoltage.toFixed(1), 'V');
    this._updateSensor('sensor-heading', Math.round(data.heading), '°');
    this._updateSensor('sensor-left-prox', data.leftProximity >= 999 ? 'Clear' : data.leftProximity, data.leftProximity >= 999 ? '' : 'cm');
    this._updateSensor('sensor-right-prox', data.rightProximity >= 999 ? 'Clear' : data.rightProximity, data.rightProximity >= 999 ? '' : 'cm');

    // GPS
    const gpsEl = document.getElementById('sensor-gps');
    if (gpsEl) gpsEl.textContent = `${data.gps.lat.toFixed(4)}, ${data.gps.lng.toFixed(4)}`;

    // Hardware statuses
    this._updateHardware('hw-esp32', data.engineRunning);
    this._updateHardware('hw-bluetooth', data.bluetoothConnected);
    this._updateHardware('hw-gps', data.gpsLocked);
    this._updateHardware('hw-ultrasonic', data.engineRunning);
    this._updateHardware('hw-temp-sensor', data.engineRunning);

    // Serial log
    this._addSerialLine(data);
  }

  _updateSensor(id, value, unit) {
    const valEl = document.getElementById(id + '-val');
    const unitEl = document.getElementById(id + '-unit');
    if (valEl) valEl.textContent = value;
    if (unitEl) unitEl.textContent = unit;
  }

  _updateHardware(id, online) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = online ? 'ONLINE' : 'OFFLINE';
      el.className = 'hardware-item__status ' + (online ? 'online' : 'offline');
    }
  }

  _addSerialLine(data) {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    const lines = [
      { class: 'line-info', text: `[${now}] TICK` },
      { class: 'line-sensor', text: `  SPD: ${Math.round(data.speed)} | RPM: ${Math.round(data.rpm)} | GEAR: ${data.gear}` },
      { class: 'line-sensor', text: `  TEMP: ${Math.round(data.engineTemp)}°C | FUEL: ${Math.round(data.fuelLevel)}% | BAT: ${data.batteryVoltage.toFixed(1)}V` },
    ];

    if (data.leftProximity < 999) {
      lines.push({ class: 'line-warning', text: `  ⚠ LEFT_PROX: ${data.leftProximity}cm` });
    }
    if (data.rightProximity < 999) {
      lines.push({ class: 'line-warning', text: `  ⚠ RIGHT_PROX: ${data.rightProximity}cm` });
    }
    if (data.frontProximity < 999) {
      lines.push({ class: 'line-error', text: `  ⛔ FRONT_PROX: ${data.frontProximity}cm` });
    }

    this.serialLines.push(...lines);
    while (this.serialLines.length > this.maxSerialLines) this.serialLines.shift();

    const terminal = document.getElementById('serial-terminal');
    if (terminal) {
      terminal.innerHTML = this.serialLines.map(l =>
        `<div class="${l.class}">${l.text}</div>`
      ).join('');
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  _startRenderLoop() {
    const render = () => {
      this._drawRadar();
      this.animFrame = requestAnimationFrame(render);
    };
    render();
  }

  _drawRadar() {
    const ctx = this.radarCtx;
    if (!ctx) return;

    const w = this.radarW || 360;
    const h = this.radarH || 200;
    const cx = w / 2;
    const cy = h * 0.85;
    const maxR = Math.min(w * 0.4, h * 0.7);

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    // Radar rings
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (maxR / 3) * i, Math.PI, 0, false);
      ctx.strokeStyle = `rgba(0, 212, 255, ${0.05 + i * 0.02})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Radar lines
    for (let angle = 0; angle <= 180; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - Math.cos(rad) * maxR, cy - Math.sin(rad) * maxR);
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Sweep
    this.radarAngle = (this.radarAngle + 2) % 180;
    const sweepRad = (this.radarAngle * Math.PI) / 180;
    const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    sweepGrad.addColorStop(0, 'rgba(0, 212, 255, 0.2)');
    sweepGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const sweepWidth = 15 * Math.PI / 180;
    ctx.arc(cx, cy, maxR, Math.PI + sweepRad - sweepWidth, Math.PI + sweepRad, false);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();

    // Bike icon (center)
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.fill();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Proximity objects
    const data = window.sensorSim.data;

    // Left proximity
    if (data.leftProximity < 999) {
      const dist = (1 - data.leftProximity / 300) * maxR;
      const objX = cx - dist * 0.9;
      const objY = cy - dist * 0.3;
      this._drawRadarBlip(ctx, objX, objY, data.leftProximity < 80 ? '#ff2d55' : '#ff8800');
    }

    // Right proximity
    if (data.rightProximity < 999) {
      const dist = (1 - data.rightProximity / 300) * maxR;
      const objX = cx + dist * 0.9;
      const objY = cy - dist * 0.3;
      this._drawRadarBlip(ctx, objX, objY, data.rightProximity < 80 ? '#ff2d55' : '#ff8800');
    }

    // Front proximity
    if (data.frontProximity < 999) {
      const dist = (1 - data.frontProximity / 300) * maxR;
      const objY = cy - dist;
      this._drawRadarBlip(ctx, cx, objY, data.frontProximity < 80 ? '#ff2d55' : '#ff8800');
    }

    // Labels
    ctx.font = '9px Orbitron';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'center';
    ctx.fillText('FRONT', cx, cy - maxR - 5);
    ctx.fillText('LEFT', cx - maxR - 5, cy);
    ctx.fillText('RIGHT', cx + maxR + 5, cy);

    // Zone labels
    ctx.font = '8px JetBrains Mono';
    ctx.fillStyle = 'rgba(0,212,255,0.2)';
    ctx.fillText('1m', cx + (maxR / 3) + 5, cy - 5);
    ctx.fillText('2m', cx + (maxR / 3) * 2 + 5, cy - 5);
    ctx.fillText('3m', cx + maxR + 5, cy - 5);
  }

  _drawRadarBlip(ctx, x, y, color) {
    // Glow
    const pulseScale = 1 + 0.3 * Math.sin(Date.now() / 300);
    ctx.beginPath();
    ctx.arc(x, y, 10 * pulseScale, 0, Math.PI * 2);
    ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('#', '');
    // Simpler approach
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Solid blip
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}

window.sensorMonitor = new SensorMonitor();
