import { el } from '../core/dom.js';

export class PcInfo {
  constructor(context) {
    this.context = context;
    this.frames = 0;
    this.fps = 0;
    this.pingValue = null;
    this.actionValue = null;
    this.node = el('div', 'pc-info');
    this.node.hidden = true;
    this.node.setAttribute('aria-live', 'off');
    this.badge = el('div', 'pc-view-only', context.i18n.t('pc.viewOnly'));
    this.badge.hidden = true;
    context.documentObject.body.append(this.node, this.badge);
  }
  ms(value) {
    return value === null ? '—' : `${value} ms`;
  }
  render() {
    const t = (key) => this.context.i18n.t(key);
    const lines = [
      `${t('pc.render')} ${this.fps} fps`,
      `${t('pc.roundtrip')} ${this.ms(this.pingValue)}`,
      `${t('pc.lastAction')} ${this.ms(this.actionValue)}`,
      t(this.context.connected() ? 'pc.connected' : 'pc.disconnected'),
    ];
    this.node.textContent = lines.join('\n');
  }
  tick(now) {
    this.frames += 1;
    if (now - this.since >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.since));
      this.frames = 0;
      this.since = now;
      this.render();
    }
    this.raf = this.context.windowObject.requestAnimationFrame((value) => this.tick(value));
  }
  async ping() {
    const started = Date.now();
    try {
      await this.context.api.get('/api/ping', 5000);
      this.pingValue = Date.now() - started;
    } catch (error) {
      this.pingValue = null;
    }
    this.render();
  }
  set(value) {
    const enabled = !!value.info;
    this.node.hidden = !enabled;
    this.badge.hidden = !value.viewOnly;
    if (enabled && !this.raf) {
      this.since = this.context.windowObject.performance.now();
      this.frames = 0;
      this.raf = this.context.windowObject.requestAnimationFrame((now) => this.tick(now));
      this.ping();
      this.pingTimer = setInterval(() => this.ping(), 2000);
    } else if (!enabled && this.raf) {
      this.context.windowObject.cancelAnimationFrame(this.raf);
      clearInterval(this.pingTimer);
      this.raf = null;
    }
    this.render();
  }
  actionLatency(value) {
    this.actionValue = value;
    this.render();
  }
}
