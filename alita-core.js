/* ============================================
   ALITA Core – AI Personality & Voice Engine
   ============================================ */

class AlitaCore {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.isSpeaking = false;
    this.speechQueue = [];
    this.emotionState = 'calm'; // calm, alert, warning, critical
    this.listeners = {};
    this.lastMessage = '';
    this.initialized = false;

    // Personality config
    this.personality = {
      name: 'ALITA',
      pitchCalm: 1.1,
      pitchAlert: 1.15,
      pitchWarning: 1.2,
      pitchCritical: 1.25,
      rateCalm: 0.95,
      rateAlert: 1.0,
      rateWarning: 1.05,
      rateCritical: 1.1,
    };

    // Response templates
    this.responses = {
      greetings: [
        "Good {timeOfDay}, rider! I'm ALITA, your ride companion. All systems are online. Let's ride!",
        "Hey there! ALITA here. I've run all diagnostics — everything looks perfect. Ready when you are!",
        "Welcome back! I've been waiting for you. Systems check complete. Let's hit the road!",
      ],
      farewell: [
        "Great ride today! You covered {distance} kilometers in {duration}. Your safety score is {score}. See you next time!",
        "Ride complete! That was a smooth one. Rest well, and I'll be here when you need me again.",
        "Trip ended. Overall, you rode safely and efficiently. Take care, rider!",
      ],
      smoothRiding: [
        "You're riding beautifully. Keep it up!",
        "Smooth and steady — I like your style.",
        "Perfect riding posture detected. You're doing great!",
      ],
      speedWarning: [
        "Hey, you're going a bit fast. Current speed is {speed} km/h. Please ease up a little.",
        "Speed alert! {speed} km/h detected. I recommend slowing down for safety.",
        "Careful with the throttle! {speed} km/h is above the comfort zone. Please slow down.",
      ],
      blindSpotLeft: [
        "Careful! I'm sensing something in your left blind spot.",
        "Heads up! Object detected on your left side. Stay alert.",
        "Left side alert! I've detected a vehicle approaching from your left.",
      ],
      blindSpotRight: [
        "Watch out! Something is approaching from your right blind spot.",
        "Right side alert! I'm picking up an object on your right.",
        "Stay cautious! I'm detecting movement on your right side.",
      ],
      obstacleAhead: [
        "Obstacle detected ahead! Please slow down and be ready to stop.",
        "Warning! I'm detecting something on the road ahead. Reduce speed now.",
        "Careful ahead! My sensors are picking up an obstacle. Slow down!",
      ],
      temperatureNormal: [
        "Engine temperature is normal at {temp}°C. All good!",
      ],
      temperatureWarning: [
        "Engine temperature is rising — {temp}°C. Keep an eye on it.",
        "Temperature alert: {temp}°C. It's getting warm. Consider taking a break soon.",
      ],
      temperatureCritical: [
        "Critical! Engine temperature at {temp}°C! Please stop and let the engine cool down immediately!",
        "Danger! Engine overheating at {temp}°C! Pull over now for safety!",
      ],
      navigationTurn: [
        "In {distance}, {direction}.",
        "{direction} ahead in {distance}.",
      ],
      navigationArriving: [
        "You're almost there! Destination is just {distance} away.",
        "Nearly there! Your destination is coming up in {distance}.",
      ],
      trafficAhead: [
        "Traffic detected ahead. I'd suggest reducing speed.",
        "Looks like there's some congestion ahead. Slow down.",
      ],
      systemCheck: [
        "Running diagnostics... GPS online. Sensors active. Bluetooth connected. All systems nominal.",
        "System check complete. All sensors responding. GPS locked. We're good to go!",
      ],
      encouragement: [
        "You're an excellent rider! Maintaining great form.",
        "This is some smooth riding. You really know your machine!",
        "I feel safe with you behind the handlebars!",
      ],
      routeSuggestion: [
        "I'm setting up the fastest route for you. ETA approximately {eta} minutes.",
        "Route calculated. I'll guide you turn by turn. Estimated time: {eta} minutes.",
      ],
    };

    this._initVoice();
  }

  _initVoice() {
    // Load voices (async in some browsers)
    const loadVoices = () => {
      const voices = this.synth.getVoices();
      // Prefer a female English voice
      this.voice = voices.find(v => v.name.includes('Female') && v.lang.startsWith('en')) ||
                   voices.find(v => v.name.includes('Samantha')) ||
                   voices.find(v => v.name.includes('Zira')) ||
                   voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
                   voices.find(v => v.lang.startsWith('en-')) ||
                   voices.find(v => v.lang.startsWith('en')) ||
                   voices[0];
      this.initialized = true;
    };

    if (this.synth.getVoices().length) {
      loadVoices();
    }
    this.synth.onvoiceschanged = loadVoices;
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // Set emotion state
  setEmotion(state) {
    if (this.emotionState !== state) {
      this.emotionState = state;
      this.emit('emotionChange', state);
    }
  }

  // Get a random response from category
  getResponse(category, vars = {}) {
    const templates = this.responses[category];
    if (!templates || templates.length === 0) return '';
    const template = templates[Math.floor(Math.random() * templates.length)];
    return this._fillTemplate(template, vars);
  }

  _fillTemplate(template, vars) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    // Fill time of day
    const hour = new Date().getHours();
    let timeOfDay = 'day';
    if (hour < 12) timeOfDay = 'morning';
    else if (hour < 17) timeOfDay = 'afternoon';
    else timeOfDay = 'evening';
    result = result.replace(/\{timeOfDay\}/g, timeOfDay);
    return result;
  }

  // Speak a message
  speak(text, priority = 'normal') {
    if (!text) return;

    if (priority === 'critical') {
      // Cancel current speech and push to front
      this.synth.cancel();
      this.speechQueue.unshift(text);
    } else {
      this.speechQueue.push(text);
    }

    this._processQueue();
  }

  // Speak a response from a category
  speakResponse(category, vars = {}, priority = 'normal') {
    const text = this.getResponse(category, vars);
    if (text) {
      this.speak(text, priority);
    }
    return text;
  }

  _processQueue() {
    if (this.isSpeaking || this.speechQueue.length === 0) return;

    const text = this.speechQueue.shift();
    this.lastMessage = text;
    this.isSpeaking = true;

    const utterance = new SpeechSynthesisUtterance(text);

    // Set voice properties based on emotion
    if (this.voice) utterance.voice = this.voice;
    utterance.pitch = this.personality[`pitch${this._capitalize(this.emotionState)}`] || 1.1;
    utterance.rate = this.personality[`rate${this._capitalize(this.emotionState)}`] || 0.95;
    utterance.volume = 1;

    utterance.onstart = () => {
      this.emit('speakStart', { text, emotion: this.emotionState });
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.emit('speakEnd', { text });
      this._processQueue();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this._processQueue();
    };

    this.synth.speak(utterance);
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Stop all speech
  silence() {
    this.synth.cancel();
    this.speechQueue = [];
    this.isSpeaking = false;
  }
}

// Global instance
window.alita = new AlitaCore();
