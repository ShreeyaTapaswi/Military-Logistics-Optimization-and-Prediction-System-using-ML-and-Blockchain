/* ============================================
   App Controller – Main Application Logic
   ============================================ */

class App {
  constructor() {
    this.currentPage = 'dashboard';
    this.pages = ['dashboard', 'navigation', 'analytics', 'sensors', 'demo'];
    this.clockInterval = null;
  }

  init() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page) this.navigateTo(page);
      });
    });

    // Initialize modules
    window.dashboard.init();
    window.navigation.init();
    window.analytics.init();
    window.sensorMonitor.init();
    window.demoScenario.init();

    // Initialize voice recognition
    this._initVoiceRecognition();

    // Start clock
    this._startClock();

    // Show first page
    this.navigateTo('dashboard');

    // Splash screen
    this._hideSplash();
  }

  navigateTo(page) {
    if (!this.pages.includes(page)) return;

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    this.currentPage = page;
  }

  _startClock() {
    const update = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const el = document.getElementById('top-bar-time');
      if (el) el.textContent = timeStr;
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }

  _hideSplash() {
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash) splash.classList.add('hidden');
    }, 3000);
  }

  _initVoiceRecognition() {
    const vr = window.voiceRecognition;
    if (!vr || !vr.isSupported) {
      const micFab = document.getElementById('mic-fab');
      if (micFab) micFab.style.display = 'none';
      return;
    }

    const micFab = document.getElementById('mic-fab');
    const overlay = document.getElementById('voice-input-overlay');
    const transcriptEl = document.getElementById('voice-transcript-display');
    const statusEl = document.getElementById('voice-status');
    const testBtn = document.getElementById('voice-test-btn');
    const testInput = document.getElementById('voice-test-input');
    let overlayVisible = false;

    // Mic button click
    micFab.addEventListener('click', () => {
      vr.toggle();
      overlayVisible = !overlayVisible;
      overlay.classList.toggle('active', overlayVisible);
      if (!overlayVisible) {
        vr.stopListening();
      }
    });

    // Test button — type a command and click Test to simulate voice input
    if (testBtn && testInput) {
      testBtn.addEventListener('click', () => {
        const text = testInput.value.trim();
        if (!text) return;

        // Unlock speech synthesis on user gesture (button click)
        vr._unlockSpeech();

        console.log('[ALITA Test] Simulating command:', text);
        if (transcriptEl) {
          transcriptEl.textContent = `🎤 "${text}"`;
          transcriptEl.classList.remove('interim');
        }
        vr._processCommand(text);
        testInput.value = '';
      });

      // Also allow Enter key
      testInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          testBtn.click();
        }
      });
    }

    // Listening state changes
    vr.on('listeningChange', (isListening) => {
      micFab.classList.toggle('listening', isListening);
      if (statusEl) {
        statusEl.textContent = isListening ? 'LISTENING' : 'IDLE';
        statusEl.className = 'voice-input-header__status ' + (isListening ? 'listening' : 'idle');
      }
    });

    // Interim transcript
    vr.on('interim', (text) => {
      if (transcriptEl) {
        transcriptEl.textContent = text;
        transcriptEl.classList.add('interim');
      }
    });

    // Final transcript
    vr.on('transcript', (text) => {
      if (transcriptEl) {
        transcriptEl.textContent = `🎤 "${text}"`;
        transcriptEl.classList.remove('interim');
      }
    });

    // ALITA's speech responses — show in overlay
    vr.on('speakStart', ({ text }) => {
      if (transcriptEl) {
        const current = transcriptEl.textContent;
        transcriptEl.innerHTML = `<div style="margin-bottom:8px;color:var(--text-dim);font-size:12px;">${current}</div><div style="color:var(--neon-blue);font-size:13px;">🤖 ALITA: "${text}"</div>`;
        transcriptEl.classList.remove('interim');
      }
    });

    // Command recognized flash
    vr.on('command', () => {
      micFab.style.transform = 'scale(1.2)';
      setTimeout(() => { micFab.style.transform = ''; }, 200);
    });

    // Always show overlay when active
    vr.on('awakeChange', (awake) => {
      if (awake) {
        overlay.classList.add('active');
        overlayVisible = true;
      }
    });

    // Close overlay on outside click
    document.addEventListener('click', (e) => {
      if (overlayVisible && !overlay.contains(e.target) && !micFab.contains(e.target)) {
        overlayVisible = false;
        overlay.classList.remove('active');
      }
    });
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
