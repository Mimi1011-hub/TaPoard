export class Feedback {
  constructor(storage, navigatorObject, windowObject) {
    this.storage = storage;
    this.navigatorObject = navigatorObject;
    this.windowObject = windowObject;
    this.audio = null;
    this.last = 0;
  }

  enabled() {
    return this.storage.getItem('tapoard-feedback') !== 'off';
  }

  canVibrate() {
    return typeof this.navigatorObject.vibrate === 'function';
  }

  prepare() {
    if (!this.enabled() || this.canVibrate()) return;
    const AudioContext = this.windowObject.AudioContext || this.windowObject.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!this.audio) this.audio = new AudioContext();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch (error) { this.audio = null; }
  }

  tap(strong) {
    if (!this.enabled() || Date.now() - this.last < 35) return;
    this.last = Date.now();
    if (this.canVibrate()) {
      this.navigatorObject.vibrate(strong ? 18 : 8);
      return;
    }
    this.click();
  }

  click() {
    if (!this.audio || this.audio.state !== 'running') return;
    const now = this.audio.currentTime;
    const oscillator = this.audio.createOscillator();
    const gain = this.audio.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1800, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    oscillator.connect(gain);
    gain.connect(this.audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.015);
  }
}
