/* ============================================
   Voice Recognition – Talk to ALITA
   Complete rewrite for robust speech I/O
   ============================================ */

class VoiceRecognition {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = false;
    this.continuous = false;
    this.awake = true; // Always awake — no wake word needed
    this.awakeTimeout = null;
    this.listeners = {};
    this._speechUnlocked = false;
    this._speaking = false; // Track if we're in a speak cycle

    // Command map: regex patterns → handler functions
    this.commands = [
      // Wake word (still supported but not required)
      { pattern: /\b(hey|hi|hello|ok)\s*alita\b/i, handler: () => this._onWakeWord() },

      // Engine / Ride controls
      { pattern: /\b(start|begin)\s*(the\s*)?(ride|engine|bike|simulation)\b/i, handler: () => this._startRide() },
      { pattern: /\b(stop|end|finish)\s*(the\s*)?(ride|engine|bike|simulation)\b/i, handler: () => this._stopRide() },

      // Speed queries
      { pattern: /\b(how fast|what('?s| is)\s*(my|the|current)?\s*speed|speed\s*check)\b/i, handler: () => this._querySpeed() },

      // Temperature queries
      { pattern: /\b(what('?s| is)\s*(the\s*)?(engine\s*)?temp(erature)?|engine\s*temp|how hot)\b/i, handler: () => this._queryTemp() },

      // Fuel queries
      { pattern: /\b(what('?s| is)\s*(the\s*)?fuel|fuel\s*(level|check|status)|how much fuel)\b/i, handler: () => this._queryFuel() },

      // Safety / Score
      { pattern: /\b(safety\s*score|how\s*(am\s*i|safe)|ride\s*score|my\s*score)\b/i, handler: () => this._querySafety() },

      // Status / System check
      { pattern: /\b(system\s*(check|status)|status\s*(report|check|update)?|diagnostics|run\s*check)\b/i, handler: () => this._systemCheck() },

      // Location
      { pattern: /\b(where\s*am\s*i|my\s*location|gps|current\s*location)\b/i, handler: () => this._queryLocation() },

      // Navigation
      { pattern: /\b(navigate|navigation|directions?|take\s*me|go\s*to|route)\b/i, handler: () => this._queryNavigation() },

      // Demo
      { pattern: /\b(start|play|run|begin)\s*(the\s*)?(demo|scenario|simulation)\b/i, handler: () => this._startDemo() },
      { pattern: /\b(stop|pause|end)\s*(the\s*)?(demo|scenario|simulation)\b/i, handler: () => this._pauseDemo() },
      { pattern: /\b(reset)\s*(the\s*)?(demo|scenario|simulation)\b/i, handler: () => this._resetDemo() },

      // Ride feedback
      { pattern: /\b(how\s*(am\s*i\s*doing|is\s*(my|the)\s*ride)|ride\s*(feedback|summary|report)|give\s*me\s*(feedback|summary))\b/i, handler: () => this._rideFeedback() },

      // RPM
      { pattern: /\b(what('?s| is)\s*(the\s*)?rpm|rpm\s*(check)?|revs?)\b/i, handler: () => this._queryRPM() },

      // Greetings
      { pattern: /\b(good\s*(morning|afternoon|evening|night)|hello|hi|hey)\b/i, handler: () => this._greet() },

      // Thanks
      { pattern: /\b(thank(s| you)|appreciate|good\s*job|well\s*done|nice)\b/i, handler: () => this._thanks() },

      // Help
      { pattern: /\b(help|what\s*can\s*you\s*do|commands?|options?)\b/i, handler: () => this._help() },

      // Who are you
      { pattern: /\b(who\s*are\s*you|what\s*are\s*you|your\s*name|introduce)\b/i, handler: () => this._introduce() },
    ];

    this._init();
  }

  _init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[ALITA Voice] Speech Recognition not supported.');
      this.isSupported = false;
      return;
    }

    this.isSupported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => this._onResult(event);
    this.recognition.onend = () => this._onEnd();
    this.recognition.onerror = (event) => this._onError(event);
    this.recognition.onstart = () => {
      this.isListening = true;
      this.emit('listeningChange', true);
      console.log('[ALITA Voice] 🎤 Listening started');
    };
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // Start listening
  startListening() {
    if (!this.isSupported || this.isListening) return;
    try {
      this.recognition.start();
      console.log('[ALITA Voice] Starting recognition...');
    } catch (e) {
      console.log('[ALITA Voice] Recognition already started');
    }
  }

  // Stop listening
  stopListening() {
    if (!this.isSupported) return;
    this.isListening = false;
    this.continuous = false;
    try {
      this.recognition.stop();
    } catch (e) {}
    this.emit('listeningChange', false);
  }

  // Toggle — called when mic button is tapped
  toggle() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.awake = true;
      this.continuous = true;
      // Unlock speech synthesis on user gesture
      this._unlockSpeech();
      this.startListening();
    }
  }

  _onResult(event) {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (interimTranscript) {
      this.emit('interim', interimTranscript);
    }

    if (finalTranscript) {
      console.log('[ALITA Voice] 📝 Heard:', finalTranscript);
      this.emit('transcript', finalTranscript);
      this._processCommand(finalTranscript);
    }
  }

  _onEnd() {
    this.isListening = false;
    this.emit('listeningChange', false);
    console.log('[ALITA Voice] Recognition ended. Speaking:', this._speaking, 'Continuous:', this.continuous);

    // Only auto-restart if NOT currently speaking and continuous mode is on
    if (this.continuous && !this._speaking) {
      setTimeout(() => {
        if (this.continuous && !this._speaking) {
          console.log('[ALITA Voice] Auto-restarting recognition...');
          this.startListening();
        }
      }, 500);
    }
  }

  _onError(event) {
    if (event.error === 'no-speech' || event.error === 'aborted') {
      return; // Normal, will auto-restart via _onEnd
    }
    console.warn('[ALITA Voice] Error:', event.error);
    this.emit('error', event.error);
  }

  _processCommand(text) {
    const cleaned = text.trim().toLowerCase();
    console.log('[ALITA Voice] 🔍 Processing:', cleaned);

    // Try to match a command
    for (const cmd of this.commands) {
      const match = cleaned.match(cmd.pattern);
      if (match) {
        console.log('[ALITA Voice] ✅ Matched command:', cmd.pattern.toString());
        this.emit('command', cleaned);
        cmd.handler(match);
        return;
      }
    }

    // No match
    console.log('[ALITA Voice] ❌ No command matched');
    this._notUnderstood(cleaned);
  }

  // Central speak method — stops recognition, speaks, then resumes
  _say(text) {
    console.log('[ALITA Voice] 🤖 ALITA says:', text);
    this._speaking = true;

    // Step 1: Stop recognition to free the audio pipeline
    const wasContinuous = this.continuous;
    this.continuous = false; // Prevent auto-restart during speech
    try { this.recognition.stop(); } catch(e) {}

    // Step 2: Small delay to let recognition fully stop, then speak
    setTimeout(() => {
      // Cancel any pending speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // Use ALITA's voice settings if available
      if (window.alita && window.alita.voice) {
        utterance.voice = window.alita.voice;
      }
      utterance.pitch = 1.1;
      utterance.rate = 0.95;
      utterance.volume = 1;

      utterance.onstart = () => {
        console.log('[ALITA Voice] 🔊 Speech started');
        this.emit('speakStart', { text });
        // Update ALITA's status
        if (window.alita) {
          window.alita.isSpeaking = true;
          window.alita.lastMessage = text;
          window.alita.emit('speakStart', { text });
        }
      };

      utterance.onend = () => {
        console.log('[ALITA Voice] 🔇 Speech ended');
        this._speaking = false;
        if (window.alita) {
          window.alita.isSpeaking = false;
          window.alita.emit('speakEnd', { text });
        }

        // Step 3: Resume listening after speech is completely done
        if (wasContinuous) {
          setTimeout(() => {
            this.continuous = true;
            console.log('[ALITA Voice] 🎤 Resuming recognition after speech');
            this.startListening();
          }, 600);
        }
      };

      utterance.onerror = (e) => {
        console.error('[ALITA Voice] Speech error:', e.error);
        this._speaking = false;
        // Resume even on error
        if (wasContinuous) {
          setTimeout(() => {
            this.continuous = true;
            this.startListening();
          }, 600);
        }
      };

      window.speechSynthesis.speak(utterance);
      console.log('[ALITA Voice] 📢 Utterance queued');

      // Chrome bug workaround: sometimes onend doesn't fire
      // Set a maximum timeout based on text length
      const maxWait = Math.max(5000, text.length * 80);
      setTimeout(() => {
        if (this._speaking) {
          console.log('[ALITA Voice] ⚠️ Speech timeout, forcing resume');
          this._speaking = false;
          if (wasContinuous) {
            this.continuous = true;
            this.startListening();
          }
        }
      }, maxWait);

    }, 300); // 300ms delay to let recognition stop
  }

  _unlockSpeech() {
    if (!this._speechUnlocked) {
      // Chrome requires user gesture before speechSynthesis works
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      this._speechUnlocked = true;
      console.log('[ALITA Voice] 🔓 Speech synthesis unlocked');
    }
  }

  _respond(responses) {
    const text = responses[Math.floor(Math.random() * responses.length)];
    this._say(text);
  }

  // === Command Handlers ===

  _onWakeWord() {
    this.awake = true;
    this.emit('awakeChange', true);
    this._respond([
      "Yes? I'm here. What do you need?",
      "Hey! I'm listening. Go ahead.",
      "ALITA here. What can I do for you?",
      "I'm all ears. What's up?",
    ]);
  }

  _startRide() {
    if (window.sensorSim && window.sensorSim.running) {
      this._say("The engine is already running! We're good to go.");
      return;
    }
    if (window.sensorSim) {
      window.sensorSim.start();
      window.sensorSim.setProfile('city');
      window.sensorSim.setTargetSpeed(35);
    }
    this._respond([
      "Engine started! All systems are online. Let's ride!",
      "Firing up the engine. Sensors active, GPS locked. Ready to roll!",
      "Starting up! Everything looks good. Have a safe ride!",
    ]);
  }

  _stopRide() {
    if (window.sensorSim && !window.sensorSim.running) {
      this._say("The engine is already off.");
      return;
    }
    if (window.sensorSim) {
      window.sensorSim.setTargetSpeed(0);
      setTimeout(() => {
        window.sensorSim.stop();
      }, 2000);
    }
    this._say("Ride complete! Engine shutting down. See you next time!");
  }

  _querySpeed() {
    const speed = window.sensorSim ? Math.round(window.sensorSim.data.speed) : 0;
    if (window.sensorSim && !window.sensorSim.running) {
      this._say("The engine is off. Start a ride first!");
      return;
    }
    this._respond([
      `You're currently going ${speed} kilometers per hour.`,
      `Current speed is ${speed} km/h. ${speed > 80 ? "That's a bit fast, be careful!" : "Looking good!"}`,
      `${speed} km/h right now. ${speed < 10 ? "Barely moving!" : "Cruising nicely!"}`,
    ]);
  }

  _queryTemp() {
    const temp = window.sensorSim ? Math.round(window.sensorSim.data.engineTemp) : 65;
    if (temp > 100) {
      this._say(`Engine temperature is ${temp} degrees. That's too high! Consider stopping to cool down.`);
    } else if (temp > 90) {
      this._say(`Engine temperature is ${temp} degrees. It's getting warm. Keep an eye on it.`);
    } else {
      this._say(`Engine temperature is ${temp} degrees Celsius. Perfectly normal!`);
    }
  }

  _queryFuel() {
    const fuel = window.sensorSim ? Math.round(window.sensorSim.data.fuelLevel) : 95;
    if (fuel < 20) {
      this._say(`Fuel level is at ${fuel} percent. You should refuel soon!`);
    } else {
      this._say(`Fuel level is at ${fuel} percent. You've got plenty of fuel.`);
    }
  }

  _querySafety() {
    const score = window.analytics ? Math.round(window.analytics.safetyScore) : 95;
    let grade = 'excellent';
    if (score < 60) grade = 'needs improvement';
    else if (score < 70) grade = 'fair';
    else if (score < 80) grade = 'good';
    else if (score < 90) grade = 'great';

    this._say(`Your safety score is ${score} out of 100. That's ${grade}!`);
  }

  _systemCheck() {
    const d = window.sensorSim ? window.sensorSim.data : {};
    this._say(
      `Running system diagnostics. ` +
      `GPS is ${d.gpsLocked ? 'locked' : 'searching'}. ` +
      `Bluetooth is ${d.bluetoothConnected ? 'connected' : 'disconnected'}. ` +
      `Engine is ${d.engineRunning ? 'running' : 'off'}. ` +
      `Battery at ${(d.batteryVoltage || 12.6).toFixed(1)} volts. ` +
      `All systems nominal!`
    );
  }

  _queryLocation() {
    const gps = window.sensorSim ? window.sensorSim.data.gps : { lat: 18.52, lng: 73.86 };
    this._say(
      `Your current GPS coordinates are ${gps.lat.toFixed(4)} north, ${gps.lng.toFixed(4)} east.`
    );
  }

  _queryNavigation() {
    if (window.navigation && window.navigation.instructions) {
      const instr = window.navigation.instructions[window.navigation.currentInstructionIndex];
      if (instr) {
        this._say(`Next instruction: ${instr.text}, in ${instr.distance}. I'm guiding you turn by turn.`);
        if (window.app) window.app.navigateTo('navigation');
        return;
      }
    }
    this._say("No active navigation route. Start the demo or a ride to see navigation.");
    if (window.app) window.app.navigateTo('navigation');
  }

  _startDemo() {
    if (window.app) window.app.navigateTo('demo');
    setTimeout(() => {
      if (window.demoScenario) window.demoScenario.play();
    }, 500);
    this._say("Starting the demo scenario. Sit back and enjoy the ride!");
  }

  _pauseDemo() {
    if (window.demoScenario) window.demoScenario.pause();
    this._say("Demo paused. Say 'start demo' to resume.");
  }

  _resetDemo() {
    if (window.demoScenario) window.demoScenario.reset();
    this._say("Demo reset. Ready for another run!");
  }

  _rideFeedback() {
    const d = window.sensorSim ? window.sensorSim.data : {};
    if (!d.engineRunning) {
      this._say("You're not riding right now. Start a ride and I'll give you real-time feedback!");
      return;
    }
    const score = window.analytics ? Math.round(window.analytics.smoothRidingScore) : 90;
    const speed = Math.round(d.speed || 0);
    const dist = (d.distanceTraveled || 0).toFixed(1);
    this._say(
      `Here's your ride update: You've covered ${dist} kilometers. ` +
      `Current speed is ${speed} km/h. ` +
      `Your smooth riding score is ${score} out of 100. ` +
      `${score > 85 ? "You're doing amazing!" : "Try to maintain a steadier throttle."}`
    );
  }

  _queryRPM() {
    const rpm = window.sensorSim ? Math.round(window.sensorSim.data.rpm) : 800;
    this._say(`Engine is running at ${rpm} RPM. ${rpm > 8000 ? "That's quite high, consider shifting up!" : "Sounds healthy!"}`);
  }

  _greet() {
    this._respond([
      "Hey there! How can I help you today?",
      "Hello, rider! Everything's looking good. Need anything?",
      "Hi! I'm ready to assist. Just ask away!",
    ]);
  }

  _thanks() {
    this._respond([
      "You're welcome! That's what I'm here for.",
      "Happy to help! Ride safe!",
      "Anytime! Just call my name if you need me again.",
    ]);
  }

  _help() {
    this._say(
      "Here's what you can ask me: " +
      "Say 'start ride' or 'stop ride' to control the engine. " +
      "Ask about your speed, temperature, fuel, or RPM. " +
      "Say 'safety score' for your ride rating. " +
      "Say 'system check' for a full diagnostics report. " +
      "Say 'where am I' for your location. " +
      "Or say 'start demo' for the full demo scenario. " +
      "I'm always here to help!"
    );
  }

  _introduce() {
    this._say(
      "I'm ALITA, your AI-powered bike assistant! " +
      "I monitor your ride in real-time using sensors for speed, temperature, and blind spot detection. " +
      "I provide voice-guided navigation, safety alerts, and ride feedback. " +
      "Think of me as your intelligent riding companion. Just talk to me!"
    );
  }

  _notUnderstood(text) {
    this._respond([
      `I didn't quite catch that. Try saying 'help' to see what I can do.`,
      `Hmm, I'm not sure what you mean. You can ask about speed, temperature, fuel, or say 'help'.`,
      `Sorry, I didn't understand "${text}". Try one of my commands — say 'help' for a list.`,
    ]);
  }
}

// Global instance
window.voiceRecognition = new VoiceRecognition();
