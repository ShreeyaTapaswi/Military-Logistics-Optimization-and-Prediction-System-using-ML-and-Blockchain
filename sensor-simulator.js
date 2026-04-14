/* ============================================
   Sensor Simulator – IoT Data Engine
   ============================================ */

class SensorSimulator {
  constructor() {
    this.running = false;
    this.interval = null;
    this.tickRate = 500; // ms
    this.listeners = {};
    this.profile = 'city'; // city, highway, mountain

    // Sensor state
    this.data = {
      speed: 0,
      targetSpeed: 0,
      rpm: 800,
      engineTemp: 65,
      fuelLevel: 92,
      batteryVoltage: 12.6,
      leftProximity: 999, // cm, 999 = nothing detected
      rightProximity: 999,
      frontProximity: 999,
      gps: { lat: 18.5204, lng: 73.8567 }, // Pune, India
      heading: 45,
      gear: 'N',
      engineRunning: false,
      bluetoothConnected: true,
      gpsLocked: true,
      distanceTraveled: 0,
      rideStartTime: null,
      rideDuration: 0,
      brakingEvents: 0,
      maxSpeed: 0,
      avgSpeed: 0,
      speedSamples: [],
    };

    // Profiles define behavior ranges
    this.profiles = {
      city: {
        speedRange: [0, 60],
        speedChangeRate: 3,
        tempRange: [65, 95],
        proximityChance: 0.15,
        trafficChance: 0.2,
      },
      highway: {
        speedRange: [60, 120],
        speedChangeRate: 5,
        tempRange: [70, 100],
        proximityChance: 0.05,
        trafficChance: 0.05,
      },
      mountain: {
        speedRange: [20, 50],
        speedChangeRate: 2,
        tempRange: [75, 105],
        proximityChance: 0.08,
        trafficChance: 0.1,
      },
    };

    // Alert thresholds
    this.thresholds = {
      speedWarning: 80,
      speedDanger: 110,
      tempWarning: 90,
      tempDanger: 105,
      proximityWarning: 150, // cm
      proximityDanger: 80,
    };

    // Track triggered alerts to avoid spam
    this._alertCooldowns = {};
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // Start simulation
  start() {
    if (this.running) return;
    this.running = true;
    this.data.engineRunning = true;
    this.data.rideStartTime = Date.now();
    this.data.rpm = 800;
    this.data.speed = 0;
    this.data.engineTemp = 65;

    this.interval = setInterval(() => this._tick(), this.tickRate);
    this.emit('start', this.data);
  }

  // Stop simulation
  stop() {
    if (!this.running) return;
    this.running = false;
    this.data.engineRunning = false;
    clearInterval(this.interval);
    this.interval = null;
    this.emit('stop', this.data);
  }

  // Set profile
  setProfile(profile) {
    if (this.profiles[profile]) {
      this.profile = profile;
      this.emit('profileChange', profile);
    }
  }

  // Set a specific target speed
  setTargetSpeed(speed) {
    this.data.targetSpeed = speed;
  }

  // Force sensor values (for demo)
  setValues(overrides) {
    Object.assign(this.data, overrides);
    this.emit('update', { ...this.data });
  }

  // Main simulation tick
  _tick() {
    const profile = this.profiles[this.profile];
    const d = this.data;

    // Update ride duration
    if (d.rideStartTime) {
      d.rideDuration = Math.floor((Date.now() - d.rideStartTime) / 1000);
    }

    // --- Speed simulation ---
    if (d.targetSpeed !== undefined && d.targetSpeed !== null) {
      const diff = d.targetSpeed - d.speed;
      const change = Math.min(Math.abs(diff), profile.speedChangeRate) * Math.sign(diff);
      d.speed = Math.max(0, d.speed + change + (Math.random() - 0.5) * 1.5);
    } else {
      // Random speed drift within profile range
      const [minS, maxS] = profile.speedRange;
      const drift = (Math.random() - 0.5) * profile.speedChangeRate * 2;
      d.speed = Math.max(minS, Math.min(maxS, d.speed + drift));
    }
    d.speed = Math.round(d.speed * 10) / 10;

    // Track max and avg speed
    if (d.speed > d.maxSpeed) d.maxSpeed = d.speed;
    d.speedSamples.push(d.speed);
    if (d.speedSamples.length > 600) d.speedSamples.shift();
    d.avgSpeed = Math.round(d.speedSamples.reduce((a, b) => a + b, 0) / d.speedSamples.length);

    // --- RPM calculation ---
    d.rpm = Math.round(800 + (d.speed / 180) * 10200 + (Math.random() - 0.5) * 200);

    // --- Gear calculation ---
    if (d.speed < 1) d.gear = 'N';
    else if (d.speed < 15) d.gear = '1';
    else if (d.speed < 30) d.gear = '2';
    else if (d.speed < 50) d.gear = '3';
    else if (d.speed < 75) d.gear = '4';
    else if (d.speed < 100) d.gear = '5';
    else d.gear = '6';

    // --- Engine Temperature ---
    const [minT, maxT] = profile.tempRange;
    const tempTrend = (d.speed / 180) * (maxT - minT) + minT;
    d.engineTemp += (tempTrend - d.engineTemp) * 0.02 + (Math.random() - 0.5) * 0.3;
    d.engineTemp = Math.round(d.engineTemp * 10) / 10;

    // --- Proximity Sensors ---
    if (Math.random() < profile.proximityChance) {
      const side = Math.random() < 0.5 ? 'leftProximity' : 'rightProximity';
      d[side] = Math.round(50 + Math.random() * 200);
    } else {
      // Gradually return to clear
      if (d.leftProximity < 999) d.leftProximity = Math.min(999, d.leftProximity + 30);
      if (d.rightProximity < 999) d.rightProximity = Math.min(999, d.rightProximity + 30);
    }

    // Front proximity (rare obstacle)
    if (Math.random() < 0.03) {
      d.frontProximity = Math.round(80 + Math.random() * 150);
    } else {
      if (d.frontProximity < 999) d.frontProximity = Math.min(999, d.frontProximity + 50);
    }

    // --- Fuel consumption ---
    d.fuelLevel = Math.max(0, d.fuelLevel - (d.speed / 180) * 0.008);
    d.fuelLevel = Math.round(d.fuelLevel * 100) / 100;

    // --- Battery ---
    d.batteryVoltage = 12.4 + Math.random() * 0.4;
    d.batteryVoltage = Math.round(d.batteryVoltage * 10) / 10;

    // --- Distance ---
    d.distanceTraveled += (d.speed / 3600) * (this.tickRate / 1000);
    d.distanceTraveled = Math.round(d.distanceTraveled * 100) / 100;

    // --- GPS drift ---
    d.gps.lat += (Math.random() - 0.5) * 0.0001;
    d.gps.lng += (Math.random() - 0.5) * 0.0001;
    d.heading += (Math.random() - 0.5) * 5;
    if (d.heading < 0) d.heading += 360;
    if (d.heading >= 360) d.heading -= 360;

    // Emit update
    this.emit('update', { ...d });

    // --- Check thresholds and emit alerts ---
    this._checkAlerts(d);
  }

  _checkAlerts(d) {
    // Speed warnings
    if (d.speed > this.thresholds.speedDanger) {
      this._emitAlert('speedDanger', 'danger', d.speed);
    } else if (d.speed > this.thresholds.speedWarning) {
      this._emitAlert('speedWarning', 'warning', d.speed);
    }

    // Temperature
    if (d.engineTemp > this.thresholds.tempDanger) {
      this._emitAlert('tempDanger', 'danger', d.engineTemp);
    } else if (d.engineTemp > this.thresholds.tempWarning) {
      this._emitAlert('tempWarning', 'warning', d.engineTemp);
    }

    // Proximity
    if (d.leftProximity < this.thresholds.proximityDanger) {
      this._emitAlert('blindSpotLeftDanger', 'danger', d.leftProximity);
    } else if (d.leftProximity < this.thresholds.proximityWarning) {
      this._emitAlert('blindSpotLeft', 'warning', d.leftProximity);
    }

    if (d.rightProximity < this.thresholds.proximityDanger) {
      this._emitAlert('blindSpotRightDanger', 'danger', d.rightProximity);
    } else if (d.rightProximity < this.thresholds.proximityWarning) {
      this._emitAlert('blindSpotRight', 'warning', d.rightProximity);
    }

    if (d.frontProximity < this.thresholds.proximityDanger) {
      this._emitAlert('obstacleAhead', 'danger', d.frontProximity);
    }
  }

  _emitAlert(type, severity, value) {
    const now = Date.now();
    const cooldown = severity === 'danger' ? 5000 : 8000;
    if (this._alertCooldowns[type] && now - this._alertCooldowns[type] < cooldown) return;
    this._alertCooldowns[type] = now;
    this.emit('alert', { type, severity, value });
  }

  // Get formatted ride summary
  getRideSummary() {
    const d = this.data;
    const mins = Math.floor(d.rideDuration / 60);
    const secs = d.rideDuration % 60;
    return {
      distance: d.distanceTraveled.toFixed(1),
      duration: `${mins}m ${secs}s`,
      maxSpeed: Math.round(d.maxSpeed),
      avgSpeed: d.avgSpeed,
      brakingEvents: d.brakingEvents,
      fuelUsed: (92 - d.fuelLevel).toFixed(1),
    };
  }
}

// Global instance
window.sensorSim = new SensorSimulator();
