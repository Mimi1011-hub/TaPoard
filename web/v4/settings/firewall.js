import { el } from '../core/dom.js';

export class Firewall {
  constructor(options) {
    Object.assign(this, options);
  }

  mount(root) {
    this.status = el('p', 'firewall-status');
    this.repair = el('button', '', this.i18n.t('connect.firewallRepair'));
    this.repair.type = 'button';
    this.repair.addEventListener('click', () => this.startRepair().catch(this.onError));
    this.result = el('p', 'firewall-result');
    root.append(el('h3', '', this.i18n.t('connect.firewall')), this.status, this.repair, this.result);
  }

  text(value) {
    const where = value.networks ? this.i18n.t('connect.firewallNetworks', { networks: value.networks }) : '';
    const profile = ['public', 'private', 'domain'].indexOf(value.profile) >= 0 ? value.profile : 'unknown';
    const parts = [this.i18n.t(`connect.firewallProfile.${profile}`, { where })];
    if (value.rulesChecked) parts.push(this.i18n.t(value.httpRule && value.mdnsRule ? 'connect.firewallRules.ok' : 'connect.firewallRules.missing'));
    if (value.blockRules) parts.push(this.i18n.t('connect.firewallBlockRules', { count: value.blockRules }));
    if (value.blockAllInbound && value.profile === 'public') parts.push(this.i18n.t('connect.firewallBlockAll'));
    return parts.join(' ');
  }

  async load() {
    const value = await this.api.get('/api/firewall', 15000);
    this.status.textContent = this.text(value);
    this.result.textContent = value.scriptAvailable ? value.repairMessage || '' : this.i18n.t('connect.firewallNoScript');
    this.repair.disabled = !value.scriptAvailable || value.repair === 'running';
    return value;
  }

  async startRepair() {
    this.repair.disabled = true;
    try {
      const value = await this.api.post('/api/firewall/repair', {}, 15000);
      this.result.textContent = value.repairMessage || '';
      this.wait();
    } catch (error) {
      this.repair.disabled = false;
      throw error;
    }
  }

  wait() {
    this.timer = setTimeout(async () => {
      try {
        const value = await this.load();
        if (value.repair === 'running') this.wait();
      } catch (error) {
        this.onError(error);
      }
    }, 1500);
  }
}
