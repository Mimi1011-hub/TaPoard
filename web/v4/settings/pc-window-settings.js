import { el } from '../core/dom.js';

const choices = {
  startup: [['none', 'pc.startup.none'], ['window', 'pc.startup.window'], ['fullscreen', 'pc.startup.fullscreen']],
  startTopmost: [['last', 'pc.topmost.last'], ['on', 'pc.topmost.on'], ['off', 'pc.topmost.off']],
  buttonSize: [['small', 'pc.size.small'], ['medium', 'pc.size.medium'], ['large', 'pc.size.large']],
  aspect: [['keep', 'pc.aspect.keep'], ['fill', 'pc.aspect.fill']],
};

export class PcWindowSettings {
  constructor(options) {
    Object.assign(this, options);
    this.saving = Promise.resolve();
    this.controls = {};
  }

  start() {
    this.root.appendChild(el('h2', '', this.i18n.t('settings.nav.pc')));
    Object.keys(choices).forEach((name) => {
      this.addSelect(name);
      if (name === 'startTopmost') this.root.appendChild(el('p', 'settings-note', this.i18n.t('pc.startTopmost.hint')));
    });
    this.addRange();
    ['autoHideBar', 'showInfo', 'confirmClose'].forEach((name) => this.addCheck(name));
    this.runtime = el('p', '', this.i18n.t('pc.runtimeUnavailable'));
    this.openButton = this.button('pc.open', () => this.open(false));
    this.fullButton = this.button('pc.openFull', () => this.open(true));
    this.root.append(this.runtime, this.openButton, this.fullButton);
  }

  async active(value) {
    if (!value || this.loaded) return;
    this.loaded = true;
    try {
      this.show(await this.api.get('/api/pc-window'));
    } catch (error) {
      this.onError(error.message);
    }
  }

  addSelect(name) {
    const select = el('select', '');
    choices[name].forEach(([value, key]) => {
      const option = el('option', '', this.i18n.t(key));
      option.value = value;
      select.appendChild(option);
    });
    this.addField(name, select);
  }

  addRange() {
    const input = el('input', '');
    input.type = 'range';
    input.min = '30';
    input.max = '100';
    input.step = '5';
    this.opacityOutput = el('output', '');
    input.addEventListener('input', () => { this.opacityOutput.textContent = `${input.value}%`; });
    this.addField('opacity', input, this.opacityOutput);
  }

  addCheck(name) {
    const input = el('input', '');
    input.type = 'checkbox';
    this.addField(name, input);
  }

  addField(name, input, extra) {
    const label = el('label', 'settings-field', this.i18n.t(`pc.${name}`));
    label.appendChild(input);
    if (extra) label.appendChild(extra);
    input.name = name;
    input.addEventListener('change', () => this.save());
    this.controls[name] = input;
    this.root.appendChild(label);
  }

  collect() {
    const value = {};
    Object.keys(this.controls).forEach((name) => {
      const input = this.controls[name];
      value[name] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    });
    return value;
  }

  save() {
    const body = this.collect();
    this.saving = this.saving
      .then(() => this.api.post('/api/pc-window', body))
      .then((value) => this.show(value))
      .catch((error) => this.onError(error.message));
  }

  show(view) {
    const options = view.options;
    Object.keys(this.controls).forEach((name) => {
      if (this.controls[name].type === 'checkbox') this.controls[name].checked = Boolean(options[name]);
      else this.controls[name].value = options[name];
    });
    this.opacityOutput.textContent = `${options.opacity}%`;
    this.runtime.hidden = view.runtimeAvailable;
    this.openButton.disabled = !view.runtimeAvailable;
    this.fullButton.disabled = !view.runtimeAvailable;
    this.openButton.textContent = this.i18n.t(view.open ? 'pc.focus' : 'pc.open');
  }

  async open(fullscreen) {
    try {
      this.show(await this.api.post('/api/pc-window/open', { fullscreen }, 15000));
    } catch (error) {
      this.onError(error.message);
    }
  }

  button(key, run) {
    const button = el('button', '', this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }
}
