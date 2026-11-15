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
    const rotate = el('button', '', this.i18n.t('connect.rotate'));
    rotate.type = 'button';
    rotate.addEventListener('click', () => this.rotate().catch((error) => this.onError(this.authMessage(error))));
    this.root.appendChild(rotate);
    this.pairing.mount(this.root);
    this.firewall.mount(this.root);
    await Promise.all([this.qr.load(), this.pairing.refresh(true), this.firewall.load()]);
  }

  active(value) {
    clearTimeout(this.pollTimer);
    if (!value) return;
    const poll = async () => {
      try {
        await this.pairing.refresh(false);
      } catch (error) {
        this.onError(this.authMessage(error));
      }
      this.pollTimer = setTimeout(poll, 2000);
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
