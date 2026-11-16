import { clear, el } from '../core/dom.js';
import { actionError } from './action-validation.js';

const actions = ['custom-url', 'custom-clipboard', 'custom-audio-output', 'custom-audio-input'];

export class CatalogInputDialog {
  constructor(options) {
    Object.assign(this, options);
    this.node = el('dialog', 'confirm-dialog catalog-input-dialog');
    this.documentObject.body.appendChild(this.node);
  }

  handles(action) { return actions.indexOf(action) >= 0; }

  async ask(action, item) {
    if (!this.handles(action)) return item;
    let devices = [];
    if (item.type === 'audioDevice') {
      try {
        const response = await this.api.get('/api/devices');
        devices = (response.devices || []).filter((device) => device.target === item.deviceTarget);
      } catch (error) {
        this.onError(error.serverError || error.message);
        return null;
      }
    }
    return new Promise((resolve) => this.open(item, devices, resolve));
  }

  open(item, devices, resolve) {
    clear(this.node);
    this.node.appendChild(el('h2', '', this.i18n.t('catalogInput.title')));
    const error = el('p', 'catalog-dialog-error');
    let control;
    if (item.type === 'audioDevice') control = this.deviceSelect(devices);
    else {
      control = item.type === 'clipboard' ? el('textarea') : el('input');
      if (item.type === 'clipboard') control.maxLength = 32768;
      else {
        control.type = 'url';
        control.maxLength = 2048;
        control.placeholder = 'https://';
      }
    }
    const label = el('label', 'inspector-field');
    label.append(el('span', '', this.i18n.t(`catalogInput.${item.type}`)), control);
    this.node.append(label, error);
    const done = (value) => {
      this.node.removeEventListener('cancel', cancel);
      if (this.node.open) this.node.close();
      resolve(value);
    };
    const cancel = (event) => { event.preventDefault(); done(null); };
    const buttons = el('div', 'look-dialog-buttons');
    const place = this.button('catalogInput.place', () => {
      const message = item.type === 'audioDevice' ? (control.value ? '' : this.i18n.t('validation.device'))
        : actionError(this.i18n, item.type, control.value);
      error.textContent = message;
      if (message) return;
      if (item.type === 'url') item.url = control.value;
      if (item.type === 'clipboard') item.text = control.value;
      if (item.type === 'audioDevice') {
        const device = devices.find((value) => value.id === control.value);
        Object.assign(item, { deviceId: device.id, deviceTarget: device.target, deviceName: device.name });
      }
      done(item);
    });
    place.disabled = item.type === 'audioDevice' && !devices.length;
    if (!devices.length && item.type === 'audioDevice') error.textContent = this.i18n.t('validation.noDevices');
    buttons.append(this.button('common.cancel', () => done(null)), place);
    this.node.appendChild(buttons);
    this.node.addEventListener('cancel', cancel);
    this.node.showModal();
    control.focus();
  }

  deviceSelect(devices) {
    const select = el('select');
    devices.forEach((device) => {
      const option = el('option', '', device.name);
      option.value = device.id;
      select.appendChild(option);
    });
    return select;
  }

  button(key, run) {
    const button = el('button', '', this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }
}
