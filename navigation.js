/* ============================================
   Navigation Module – Route Visualization
   ============================================ */

class Navigation {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.animFrame = null;
    this.progress = 0;
    this.routePoints = [];
    this.currentInstructionIndex = 0;
    this.totalDistance = 12.5; // km
    this.eta = 22; // minutes

    // Simulated route waypoints (normalized 0-1)
    this.route = [
      { x: 0.15, y: 0.85 },
      { x: 0.2, y: 0.75 },
      { x: 0.25, y: 0.6 },
      { x: 0.35, y: 0.5 },
      { x: 0.45, y: 0.45 },
      { x: 0.55, y: 0.4 },
      { x: 0.6, y: 0.3 },
      { x: 0.65, y: 0.25 },
      { x: 0.7, y: 0.2 },
      { x: 0.8, y: 0.15 },
      { x: 0.85, y: 0.15 },
    ];

    // Turn-by-turn instructions
    this.instructions = [
      { direction: '↑', text: 'Head north on MG Road', distance: '2.3 km', icon: '⬆️' },
      { direction: '→', text: 'Turn right onto FC Road', distance: '1.5 km', icon: '➡️' },
      { direction: '↑', text: 'Continue straight on JM Road', distance: '3.2 km', icon: '⬆️' },
      { direction: '←', text: 'Turn left onto University Road', distance: '2.1 km', icon: '⬅️' },
      { direction: '→', text: 'Slight right onto Senapati Bapat Rd', distance: '1.8 km', icon: '↗️' },
      { direction: '↑', text: 'Continue to destination', distance: '1.6 km', icon: '📍' },
    ];

    // Street grid for background
    this.gridLines = this._generateGrid();
    this.trafficZones = [];
    this.dashOffset = 0;
  }

  init() {
    this.canvas = document.getElementById('map-canvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this._resizeCanvas();
      window.addEventListener('resize', () => this._resizeCanvas());
    }

    // Listen for sensor updates to advance navigation
    window.sensorSim.on('update', (data) => this._onSensorUpdate(data));

    this._startRenderLoop();
    this._updateInstructionUI();
    this._generateTrafficZones();
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.canvasW = rect.width;
    this.canvasH = rect.height;
  }

  _generateGrid() {
    const lines = [];
    // Horizontal roads
    for (let i = 0; i < 15; i++) {
      const y = 0.05 + Math.random() * 0.9;
      const x1 = Math.random() * 0.3;
      const x2 = x1 + 0.3 + Math.random() * 0.5;
      lines.push({ x1, y1: y, x2, y2: y, major: Math.random() > 0.6 });
    }
    // Vertical roads
    for (let i = 0; i < 15; i++) {
      const x = 0.05 + Math.random() * 0.9;
      const y1 = Math.random() * 0.3;
      const y2 = y1 + 0.3 + Math.random() * 0.5;
      lines.push({ x1: x, y1, x2: x, y2, major: Math.random() > 0.6 });
    }
    return lines;
  }

  _generateTrafficZones() {
    this.trafficZones = [];
    for (let i = 0; i < 3; i++) {
      this.trafficZones.push({
        x: 0.2 + Math.random() * 0.6,
        y: 0.2 + Math.random() * 0.6,
        radius: 0.03 + Math.random() * 0.04,
      });
    }
  }

  setProgress(pct) {
    this.progress = Math.max(0, Math.min(1, pct));
    const instrIdx = Math.min(this.instructions.length - 1, Math.floor(this.progress * this.instructions.length));
    if (instrIdx !== this.currentInstructionIndex) {
      this.currentInstructionIndex = instrIdx;
      this._updateInstructionUI();
      this._announceNavigation();
    }

    // Update ETA and distance
    const remaining = (this.totalDistance * (1 - this.progress)).toFixed(1);
    const etaMins = Math.ceil(this.eta * (1 - this.progress));

    const etaEl = document.getElementById('nav-eta-time');
    const distEl = document.getElementById('nav-eta-distance');
    const progressBar = document.getElementById('nav-progress-fill');

    if (etaEl) etaEl.textContent = `${etaMins} min`;
    if (distEl) distEl.textContent = `${remaining} km remaining`;
    if (progressBar) progressBar.style.width = `${this.progress * 100}%`;
  }

  _announceNavigation() {
    const instr = this.instructions[this.currentInstructionIndex];
    if (instr) {
      window.alita.speak(`In ${instr.distance}, ${instr.text}.`);
    }
  }

  _updateInstructionUI() {
    const instr = this.instructions[this.currentInstructionIndex];
    if (!instr) return;

    const arrowEl = document.getElementById('nav-arrow');
    const textEl = document.getElementById('nav-text');
    const distEl = document.getElementById('nav-dist');

    if (arrowEl) arrowEl.textContent = instr.icon;
    if (textEl) textEl.textContent = instr.text;
    if (distEl) distEl.textContent = `in ${instr.distance}`;
  }

  _onSensorUpdate(data) {
    // Slowly advance progress based on speed
    if (data.speed > 0 && data.engineRunning) {
      this.setProgress(this.progress + (data.speed / 180) * 0.001);
    }
  }

  _startRenderLoop() {
    const render = () => {
      this._drawMap();
      this.animFrame = requestAnimationFrame(render);
    };
    render();
  }

  _drawMap() {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.canvasW || 400;
    const h = this.canvasH || 300;

    // Dark background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    // Grid / street network
    this.gridLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x1 * w, line.y1 * h);
      ctx.lineTo(line.x2 * w, line.y2 * h);
      ctx.lineWidth = line.major ? 1.5 : 0.5;
      ctx.strokeStyle = line.major ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
      ctx.stroke();
    });

    // Traffic zones
    this.trafficZones.forEach(zone => {
      const gradient = ctx.createRadialGradient(
        zone.x * w, zone.y * h, 0,
        zone.x * w, zone.y * h, zone.radius * w
      );
      gradient.addColorStop(0, 'rgba(255, 136, 0, 0.15)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(zone.x * w, zone.y * h, zone.radius * w, 0, Math.PI * 2);
      ctx.fill();
    });

    // Route line (dashed, animated)
    this.dashOffset -= 0.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = this.dashOffset;
    ctx.beginPath();
    this.route.forEach((pt, i) => {
      const x = pt.x * w, y = pt.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.stroke();
    ctx.setLineDash([]);

    // Traveled route (solid, glowing)
    const traveledIndex = Math.floor(this.progress * (this.route.length - 1));
    if (traveledIndex > 0) {
      const routeGrad = ctx.createLinearGradient(
        this.route[0].x * w, this.route[0].y * h,
        this.route[traveledIndex].x * w, this.route[traveledIndex].y * h
      );
      routeGrad.addColorStop(0, '#7b2dff');
      routeGrad.addColorStop(1, '#00d4ff');

      // Glow
      ctx.beginPath();
      for (let i = 0; i <= traveledIndex; i++) {
        const x = this.route[i].x * w, y = this.route[i].y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
      ctx.stroke();

      // Solid line
      ctx.beginPath();
      for (let i = 0; i <= traveledIndex; i++) {
        const x = this.route[i].x * w, y = this.route[i].y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = routeGrad;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Route waypoints (small dots)
    this.route.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 3, 0, Math.PI * 2);
      ctx.fillStyle = i <= traveledIndex ? 'rgba(0, 212, 255, 0.6)' : 'rgba(255,255,255,0.1)';
      ctx.fill();
    });

    // Start marker
    const start = this.route[0];
    ctx.beginPath();
    ctx.arc(start.x * w, start.y * h, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#7b2dff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(123, 45, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // End marker
    const end = this.route[this.route.length - 1];
    ctx.beginPath();
    ctx.arc(end.x * w, end.y * h, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ff2d55';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 45, 85, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current position (animated pulse)
    const posIdx = Math.min(this.route.length - 1, Math.floor(this.progress * (this.route.length - 1)));
    const nextIdx = Math.min(this.route.length - 1, posIdx + 1);
    const subProgress = (this.progress * (this.route.length - 1)) - posIdx;

    const currX = (this.route[posIdx].x + (this.route[nextIdx].x - this.route[posIdx].x) * subProgress) * w;
    const currY = (this.route[posIdx].y + (this.route[nextIdx].y - this.route[posIdx].y) * subProgress) * h;

    // Pulse ring
    const pulseScale = 1 + 0.3 * Math.sin(Date.now() / 400);
    ctx.beginPath();
    ctx.arc(currX, currY, 12 * pulseScale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(currX, currY, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.fill();

    // Inner dot
    ctx.beginPath();
    ctx.arc(currX, currY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00d4ff';
    ctx.fill();
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Direction arrow
    const heading = window.sensorSim.data.heading || 45;
    const arrowLen = 18;
    const arrowAngle = (heading - 90) * Math.PI / 180;
    const arrowX = currX + Math.cos(arrowAngle) * arrowLen;
    const arrowY = currY + Math.sin(arrowAngle) * arrowLen;

    ctx.beginPath();
    ctx.moveTo(currX, currY);
    ctx.lineTo(arrowX, arrowY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.stroke();

    // Label badges
    ctx.font = '9px Inter';
    ctx.fillStyle = 'rgba(123, 45, 255, 0.8)';
    ctx.fillText('START', start.x * w - 12, start.y * h + 18);

    ctx.fillStyle = 'rgba(255, 45, 85, 0.8)';
    ctx.fillText('DEST', end.x * w - 10, end.y * h + 18);
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}

window.navigation = new Navigation();
