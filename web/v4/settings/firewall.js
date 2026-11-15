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
    root.append(el('h3', '', this.i18n.t('connect.firewall')), this.status, this.repair);
  }

  text(value) {
    const profile = this.i18n.t(`connect.firewallProfile.${value.profile || 'unknown'}`);
    if (!value.rulesChecked) return profile;
    const rules = value.httpRule && value.mdnsRule ? 'connect.firewallRules.ok' : 'connect.firewallRules.missing';
    return `${profile} ${this.i18n.t(rules)}`;
  }

  async load() {
    const value = await this.api.get('/api/firewall', 15000);
    this.status.textContent = value.repairMessage || this.text(value);
    this.repair.disabled = !value.scriptAvailable || value.repair === 'running';
    return value;
  }

  async startRepair() {
    this.repair.disabled = true;
    await this.api.post('/api/firewall/repair', {}, 15000);
    this.wait();
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
