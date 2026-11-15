import { clear, el } from '../core/dom.js';

export class PairingScreen {
  constructor(container, dependencies) {
    this.container = container;
    this.api = dependencies.api;
    this.i18n = dependencies.i18n;
    this.documentObject = dependencies.documentObject;
    this.onApproved = dependencies.onApproved;
    this.timer = null;
    this.attempt = null;
    this.visibility = () => this.visibilityChanged(this.documentObject.hidden);
    this.build();
    this.documentObject.addEventListener('visibilitychange', this.visibility);
  }

  build() {
    clear(this.container);
    this.container.appendChild(el('div', 'disconnected-mark', 'T'));
    this.container.appendChild(el('h1', '', this.i18n.t('connection.missingTitle')));
    this.container.appendChild(el('p', 'pair-intro', this.i18n.t('connection.missingMessage')));
    const label = el('label', 'pair-name-label');
    label.appendChild(el('span', '', this.i18n.t('pair.deviceName')));
    this.name = el('input', 'pair-name');
    this.name.value = this.i18n.t('pair.defaultName');
    this.name.maxLength = 80;
    label.appendChild(this.name);
    this.button = el('button', 'pair-request', this.i18n.t('pair.request'));
    this.button.type = 'button';
    this.status = el('p', 'pair-status');
    this.status.setAttribute('role', 'status');
    this.button.addEventListener('click', () => this.start());
    this.container.append(label, this.button, this.status);
  }

  async start() {
    this.button.disabled = true;
    this.status.textContent = this.i18n.t('pair.requesting');
    try {
      this.attempt = await this.api.post('/api/pair/start', { name: this.name.value.trim() || this.i18n.t('pair.defaultName') }, 8000);
      this.code = el('strong', 'pair-code', this.attempt.code || '');
      this.status.textContent = '';
      this.status.append(this.code, el('span', 'pair-instructions', this.i18n.t('pair.instructions')));
      this.poll();
    } catch (error) {
      this.button.disabled = false;
      this.status.textContent = error.serverError || this.i18n.t('error.network');
    }
  }

  expired() {
    return this.attempt && this.attempt.expires && Date.now() > Date.parse(this.attempt.expires);
  }

  async poll() {
    clearTimeout(this.timer);
    if (!this.attempt || this.documentObject.hidden) return;
    if (this.expired()) { this.finish('pair.expired'); return; }
    try {
      const result = await this.api.withKey(this.attempt.secret).get(`/api/pair/status?id=${encodeURIComponent(this.attempt.id)}`, 8000);
      if (result.status === 'approved') {
        const token = result.token;
        this.destroy();
        this.onApproved(token);
        return;
      }
      if (result.status === 'denied') { this.finish('pair.denied'); return; }
      if (result.status === 'expired') { this.finish('pair.expired'); return; }
      this.timer = setTimeout(() => this.poll(), 2000);
    } catch (error) {
      this.status.textContent = error.serverError || this.i18n.t('error.network');
      this.timer = setTimeout(() => this.poll(), 3000);
    }
  }

  finish(key) {
    clearTimeout(this.timer);
    this.attempt = null;
    this.button.disabled = false;
    this.status.textContent = this.i18n.t(key);
  }

  visibilityChanged(hidden) {
    clearTimeout(this.timer);
    if (!hidden && this.attempt) this.poll();
  }

  destroy() {
    clearTimeout(this.timer);
    this.documentObject.removeEventListener('visibilitychange', this.visibility);
  }
}
