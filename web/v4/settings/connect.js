import { el } from '../core/dom.js';
import { ConfirmDialog } from './confirm-dialog.js';
import { ConnectQr } from './connect-qr.js';
import { PairingList } from './pairing-list.js';
import { Firewall } from './firewall.js';

export class Connect {
  constructor(options) {
    Object.assign(this, options);
    this.confirmDialog = new ConfirmDialog(this.documentObject, this.i18n);
    const error = (value) => this.onError(this.authMessage(value));
    this.qr = new ConnectQr({ api: this.api, i18n: this.i18n });
    this.pairing = new PairingList({ api: this.api, i18n: this.i18n, confirmDialog: this.confirmDialog, onError: error });
    this.firewall = new Firewall({ api: this.api, i18n: this.i18n, onError: error });
  }

  async start() {
    this.root.appendChild(el('h2', '', this.i18n.t('settings.nav.connection')));
    this.qr.mount(this.root);
    const rotate = el('button', 'settings-danger', this.i18n.t('connect.rotate'));
    rotate.type = 'button';
    rotate.addEventListener('click', () => this.rotate().catch((error) => this.onError(this.authMessage(error))));
    this.pairing.mount(this.root);
    this.root.appendChild(rotate);
    this.firewall.mount(this.root);
  }

  async active(value) {
    clearTimeout(this.pollTimer);
    this.shown = false;
    if (!value) return;
    if (!this.loaded) {
      this.loaded = true;
      try {
        await Promise.all([this.qr.load(), this.pairing.refresh(true), this.firewall.load()]);
      } catch (error) {
        this.onError(this.authMessage(error));
      }
    }
    this.shown = true;
    const poll = async () => {
      try {
        await this.pairing.refresh(false);
        this.pollFailed = false;
      } catch (error) {
        // One notice per outage is enough; the list simply catches up when the PC answers again.
        if (!this.pollFailed) this.onError(this.authMessage(error));
        this.pollFailed = true;
      }
      if (this.shown) this.pollTimer = setTimeout(poll, 2000);
    };
    this.pollTimer = setTimeout(poll, 2000);
  }

  async rotate() {
    if (!await this.confirmDialog.ask(this.i18n.t('connect.rotateConfirm'))) return;
    await this.api.post('/api/rotate', {});
    await Promise.all([this.qr.load(), this.pairing.refresh(true)]);
  }

  authMessage(error) {
    return error && (error.status === 401 || error.status === 403) ? this.i18n.t('connect.reopen') : error.message;
  }
}
