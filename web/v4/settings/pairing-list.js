import { clear, el } from '../core/dom.js';

export class PairingList {
  constructor(options) {
    Object.assign(this, options);
    this.revision = null;
  }

  mount(root) {
    this.pending = el('div', 'pairing-list');
    this.devices = el('div', 'pairing-list');
    root.append(el('h3', '', this.i18n.t('connect.pending')), this.pending, el('h3', '', this.i18n.t('connect.devices')), this.devices);
  }

  async refresh(force) {
    const value = await this.api.get('/api/pair/manage');
    if (!force && value.revision === this.revision) return;
    this.revision = value.revision;
    this.render(value);
  }

  render(value) {
    clear(this.pending);
    clear(this.devices);
    (value.pending || []).forEach((request) => {
      const row = el('div', 'pair-request-row');
      const text = el('div', 'pair-text');
      text.append(el('strong', 'pair-code', request.code), el('span', '', request.name), el('small', '', request.address));
      const buttons = el('div', 'pair-buttons');
      buttons.append(this.action('connect.allow', () => this.decide(request, true)), this.action('connect.deny', () => this.decide(request, false)));
      row.append(text, buttons);
      this.pending.appendChild(row);
    });
    (value.devices || []).forEach((device) => {
      const row = el('div', 'pair-request-row');
      const text = el('div', 'pair-text');
      const created = new Date(device.created);
      text.append(el('span', '', device.name), el('small', '', Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString()));
      row.appendChild(text);
      row.appendChild(this.action('connect.revoke', async () => {
        if (!await this.confirmDialog.ask(this.i18n.t('connect.revokeConfirm'))) return;
        await this.api.post('/api/pair/manage', { id: device.id, revoke: true });
        await this.refresh(true);
      }));
      this.devices.appendChild(row);
    });
    if (!this.pending.firstChild) this.pending.appendChild(el('p', 'settings-empty', this.i18n.t('connect.noPending')));
    if (!this.devices.firstChild) this.devices.appendChild(el('p', 'settings-empty', this.i18n.t('connect.noDevices')));
  }

  action(key, run) {
    const button = el('button', '', this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', () => Promise.resolve(run()).catch(this.onError));
    return button;
  }

  async decide(request, approve) {
    const value = await this.api.post('/api/pair/manage', { id: request.id, code: request.code, approve });
    this.revision = null;
    this.render(value);
  }
}
