/* ============================================
   Demo Scenario – Automated Ride Simulation
   ============================================ */

class DemoScenario {
  constructor() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentEventIndex = -1;
    this.timeline = null;
    this.startTime = null;
    this.elapsed = 0;
    this.pausedAt = 0;

    // Demo events timeline (time in seconds from start)
    this.events = [
      {
        time: 0,
        id: 'ignition',
        title: 'Ignition & Startup',
        description: 'Rider starts the bike, ALITA boots up',
        icon: '🔑',
        action: (sim, alita) => {
          sim.start();
          sim.setProfile('city');
          sim.setTargetSpeed(0);
          sim.setValues({ engineTemp: 45 });
          alita.setEmotion('calm');
          const text = alita.speakResponse('greetings');
          this._addTranscript('ALITA', text);
          this._addTranscript('SYSTEM', '🔑 Engine started. All systems initializing...');
        }
      },
      {
        time: 5,
        id: 'diagnostics',
        title: 'System Diagnostics',
        description: 'ALITA runs full system check',
        icon: '🔍',
        action: (sim, alita) => {
          const text = alita.speakResponse('systemCheck');
          this._addTranscript('ALITA', text);
          this._addTranscript('SYSTEM', '✅ GPS locked. ✅ Bluetooth paired. ✅ Sensors active.');
        }
      },
      {
        time: 12,
        id: 'route',
        title: 'Route Planning',
        description: 'ALITA suggests route and calculates ETA',
        icon: '🗺️',
        action: (sim, alita) => {
          const text = alita.speakResponse('routeSuggestion', { eta: '22' });
          this._addTranscript('ALITA', text);
          window.navigation.setProgress(0);
          this._addTranscript('SYSTEM', '📍 Route set: MG Road → JM Road → Destination (12.5 km)');
        }
      },
      {
        time: 18,
        id: 'city_start',
        title: 'City Riding Begins',
        description: 'Rider enters city traffic at moderate speed',
        icon: '🏙️',
        action: (sim, alita) => {
          sim.setProfile('city');
          sim.setTargetSpeed(35);
          alita.speak("Alright, we're in the city now. I'll keep an eye on everything. Ride safe!");
          this._addTranscript('ALITA', "Alright, we're in the city now. I'll keep an eye on everything. Ride safe!");
          window.navigation.setProgress(0.1);
        }
      },
      {
        time: 25,
        id: 'nav_turn',
        title: 'Navigation: Turn Right',
        description: 'ALITA provides turn-by-turn guidance',
        icon: '➡️',
        action: (sim, alita) => {
          sim.setTargetSpeed(25);
          alita.speak("In 200 meters, turn right onto FC Road.");
          this._addTranscript('ALITA', "In 200 meters, turn right onto FC Road.");
          window.navigation.setProgress(0.2);
        }
      },
      {
        time: 32,
        id: 'smooth_riding',
        title: 'Smooth Riding Feedback',
        description: 'ALITA compliments the rider',
        icon: '😊',
        action: (sim, alita) => {
          sim.setTargetSpeed(40);
          const text = alita.speakResponse('smoothRiding');
          this._addTranscript('ALITA', text);
          window.navigation.setProgress(0.3);
        }
      },
      {
        time: 40,
        id: 'blind_spot',
        title: '⚠️ Blind Spot Alert',
        description: 'Object detected in left blind spot',
        icon: '🚨',
        action: (sim, alita) => {
          sim.setValues({ leftProximity: 70 });
          alita.setEmotion('alert');
          const text = alita.speakResponse('blindSpotLeft', {}, 'critical');
          this._addTranscript('ALITA', text);
          this._addTranscript('SYSTEM', '⚠️ Ultrasonic sensor: Object at 70cm on LEFT');

          // Clear after a few seconds
          setTimeout(() => {
            sim.setValues({ leftProximity: 999 });
            alita.setEmotion('calm');
          }, 4000);
        }
      },
      {
        time: 50,
        id: 'highway',
        title: 'Highway Entry',
        description: 'Rider accelerates onto highway',
        icon: '🛣️',
        action: (sim, alita) => {
          sim.setProfile('highway');
          sim.setTargetSpeed(75);
          alita.speak("We're entering the highway. Opening up the throttle. Enjoy the ride!");
          this._addTranscript('ALITA', "We're entering the highway. Opening up the throttle. Enjoy the ride!");
          window.navigation.setProgress(0.45);
        }
      },
      {
        time: 58,
        id: 'encouragement',
        title: 'Rider Encouragement',
        description: 'ALITA encourages the rider',
        icon: '💪',
        action: (sim, alita) => {
          sim.setTargetSpeed(85);
          const text = alita.speakResponse('encouragement');
          this._addTranscript('ALITA', text);
          window.navigation.setProgress(0.55);
        }
      },
      {
        time: 66,
        id: 'traffic',
        title: 'Traffic Ahead',
        description: 'ALITA detects traffic congestion',
        icon: '🚗',
        action: (sim, alita) => {
          sim.setTargetSpeed(30);
          alita.setEmotion('warning');
          const text = alita.speakResponse('trafficAhead');
          this._addTranscript('ALITA', text);
          this._addTranscript('SYSTEM', '🚗 Traffic density increased. Reducing recommended speed.');
          window.navigation.setProgress(0.6);

          setTimeout(() => alita.setEmotion('calm'), 4000);
        }
      },
      {
        time: 75,
        id: 'obstacle',
        title: '🛑 Obstacle Detected!',
        description: 'Obstacle detected directly ahead',
        icon: '⛔',
        action: (sim, alita) => {
          sim.setValues({ frontProximity: 60 });
          sim.setTargetSpeed(10);
          alita.setEmotion('critical');
          const text = alita.speakResponse('obstacleAhead', {}, 'critical');
          this._addTranscript('ALITA', text);
          this._addTranscript('SYSTEM', '⛔ FRONT SENSOR: Obstacle at 60cm! Emergency alert!');

          setTimeout(() => {
            sim.setValues({ frontProximity: 999 });
            sim.setTargetSpeed(40);
            alita.setEmotion('calm');
            alita.speak("Obstacle cleared. You can accelerate again. Well handled!");
            this._addTranscript('ALITA', "Obstacle cleared. You can accelerate again. Well handled!");
          }, 5000);
        }
      },
      {
        time: 88,
        id: 'temp_warning',
        title: '🌡️ Temperature Rising',
        description: 'Engine temperature warning',
        icon: '🔥',
        action: (sim, alita) => {
          sim.setValues({ engineTemp: 95 });
          alita.setEmotion('warning');
          const text = alita.speakResponse('temperatureWarning', { temp: 95 });
          this._addTranscript('ALITA', text);
          window.navigation.setProgress(0.75);

          setTimeout(() => {
            sim.setValues({ engineTemp: 82 });
            alita.setEmotion('calm');
            alita.speak("Engine temperature is dropping back to normal. Good.");
            this._addTranscript('ALITA', "Engine temperature is dropping back to normal. Good.");
          }, 5000);
        }
      },
      {
        time: 100,
        id: 'approaching',
        title: 'Approaching Destination',
        description: 'Almost at the destination',
        icon: '📍',
        action: (sim, alita) => {
          sim.setTargetSpeed(25);
          sim.setProfile('city');
          alita.speak("We're getting close! Your destination is about 1 kilometer ahead on the right.");
          this._addTranscript('ALITA', "We're getting close! Your destination is about 1 kilometer ahead on the right.");
          window.navigation.setProgress(0.9);
        }
      },
      {
        time: 110,
        id: 'arrival',
        title: '🏁 Ride Complete!',
        description: 'Arrival and ride summary',
        icon: '🏁',
        action: (sim, alita) => {
          sim.setTargetSpeed(0);
          window.navigation.setProgress(1.0);
          this._addTranscript('SYSTEM', '🏁 Destination reached! Engine idle.');

          setTimeout(() => {
            const summary = sim.getRideSummary();
            alita.setEmotion('calm');
            const text = alita.speakResponse('farewell', {
              distance: summary.distance,
              duration: summary.duration,
              score: Math.round(window.analytics.safetyScore),
            });
            this._addTranscript('ALITA', text);

            setTimeout(() => {
              sim.stop();
              this._addTranscript('SYSTEM', '🔒 Engine off. Systems entering standby. Goodbye, rider!');
              this.isPlaying = false;
              this._updateControls();
            }, 3000);
          }, 2000);
        }
      },
    ];

    this.totalDuration = this.events[this.events.length - 1].time + 10;
  }

  init() {
    this._renderTimeline();
    this._updateControls();

    // Wire up buttons
    const playBtn = document.getElementById('demo-play-btn');
    const pauseBtn = document.getElementById('demo-pause-btn');
    const resetBtn = document.getElementById('demo-reset-btn');

    if (playBtn) playBtn.addEventListener('click', () => this.play());
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause());
    if (resetBtn) resetBtn.addEventListener('click', () => this.reset());
  }

  play() {
    if (this.isPlaying && !this.isPaused) return;

    if (this.isPaused) {
      // Resume
      this.isPaused = false;
      this.startTime = Date.now() - this.pausedAt * 1000;
      window.sensorSim.start();
    } else {
      // Start fresh
      this.reset();
      this.isPlaying = true;
      this.startTime = Date.now();
      this.currentEventIndex = -1;
      this._clearTranscript();
    }

    this._tick();
    this._updateControls();
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.pausedAt = this.elapsed;
    window.sensorSim.stop();
    if (this.timeline) cancelAnimationFrame(this.timeline);
    window.alita.silence();
    this._updateControls();
  }

  reset() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentEventIndex = -1;
    this.elapsed = 0;
    this.pausedAt = 0;
    this.startTime = null;

    if (this.timeline) cancelAnimationFrame(this.timeline);
    window.sensorSim.stop();
    window.alita.silence();
    window.navigation.setProgress(0);

    this._clearTranscript();
    this._renderTimeline();
    this._updateProgressBar(0);
    this._updateControls();
  }

  _tick() {
    if (!this.isPlaying || this.isPaused) return;

    this.elapsed = (Date.now() - this.startTime) / 1000;
    const progress = this.elapsed / this.totalDuration;
    this._updateProgressBar(progress);

    // Check for events to trigger
    for (let i = this.currentEventIndex + 1; i < this.events.length; i++) {
      if (this.elapsed >= this.events[i].time) {
        this.currentEventIndex = i;
        this._triggerEvent(this.events[i]);
        this._updateTimelineUI(i);
      } else {
        break;
      }
    }

    // Check if done
    if (this.elapsed >= this.totalDuration) {
      this.isPlaying = false;
      this._updateControls();
      return;
    }

    this.timeline = requestAnimationFrame(() => this._tick());
  }

  _triggerEvent(event) {
    event.action(window.sensorSim, window.alita);
  }

  _addTranscript(sender, text) {
    const container = document.getElementById('voice-transcript');
    if (!container) return;

    const item = document.createElement('div');
    item.className = `transcript-item ${sender === 'ALITA' ? 'alita' : 'system'}`;
    item.innerHTML = `
      <div class="transcript-item__sender">${sender}</div>
      <div class="transcript-item__text">${text}</div>
    `;

    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
  }

  _clearTranscript() {
    const container = document.getElementById('voice-transcript');
    if (container) container.innerHTML = '';
  }

  _renderTimeline() {
    const container = document.getElementById('demo-events');
    if (!container) return;

    container.innerHTML = this.events.map((event, i) => `
      <div class="demo-event" id="demo-event-${i}">
        <div class="demo-event__dot"></div>
        <div class="demo-event__content">
          <div class="demo-event__title">${event.icon} ${event.title}</div>
          <div class="demo-event__description">${event.description}</div>
        </div>
        <div class="demo-event__time">${event.time}s</div>
      </div>
    `).join('');
  }

  _updateTimelineUI(activeIndex) {
    this.events.forEach((_, i) => {
      const el = document.getElementById(`demo-event-${i}`);
      if (!el) return;
      el.className = 'demo-event';
      if (i < activeIndex) el.classList.add('completed');
      else if (i === activeIndex) el.classList.add('active');
    });
  }

  _updateProgressBar(progress) {
    const bar = document.getElementById('demo-progress');
    if (bar) bar.style.width = `${Math.min(100, progress * 100)}%`;
  }

  _updateControls() {
    const playBtn = document.getElementById('demo-play-btn');
    const pauseBtn = document.getElementById('demo-pause-btn');

    if (playBtn) {
      if (this.isPlaying && !this.isPaused) {
        playBtn.classList.remove('active');
        playBtn.innerHTML = '▶ PLAYING';
      } else {
        playBtn.classList.add('play');
        playBtn.innerHTML = '▶ PLAY';
      }
    }

    if (pauseBtn) {
      if (this.isPaused) {
        pauseBtn.classList.add('active');
        pauseBtn.innerHTML = '⏸ PAUSED';
      } else {
        pauseBtn.classList.remove('active');
        pauseBtn.innerHTML = '⏸ PAUSE';
      }
    }
  }

  destroy() {
    if (this.timeline) cancelAnimationFrame(this.timeline);
  }
}

window.demoScenario = new DemoScenario();
