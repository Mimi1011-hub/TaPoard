import { clear, el } from '../core/dom.js';

function base64(bytes) {
  let value = '';
  const source = new Uint8Array(bytes);
  for (let index = 0; index < source.length; index += 1) value += String.fromCharCode(source[index]);
  return btoa(value);
}

export function downloadPreset(documentObject, response) {
  const raw = atob(response.data);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  const link = documentObject.createElement('a');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
  link.href = url;
  link.download = response.name;
  link.click();
  URL.revokeObjectURL(url);
}

export class PresetFiles {
  constructor(options) {
    Object.assign(this, options);
    this.input = el('input');
    this.input.type = 'file';
    this.input.accept = '.tppreset,application/json';
    this.input.hidden = true;
    this.input.addEventListener('change', () => this.read());
    this.dialog = el('dialog', 'preset-import-dialog');
    this.documentObject.body.append(this.input, this.dialog);
  }

  importButton() {
    const button = el('button', 'saved-primary', this.i18n.t('presets.import'));
    button.type = 'button';
    button.addEventListener('click', () => this.input.click());
    return button;
  }

  async read() {
    const file = this.input.files[0];
    this.input.value = '';
    if (!file) return;
    try {
      this.data = base64(await file.arrayBuffer());
      this.preview = await this.api.post('/api/presets/import', { data: this.data }, 15000);
      this.show();
    } catch (error) {
      this.onError(error.serverError || error.message);
    }
  }

  show() {
    clear(this.dialog);
    this.dialog.appendChild(el('h2', '', this.i18n.t('presets.importTitle')));
    const list = el('div', 'preset-import-list');
    const available = Math.max(0, this.preview.available || 0);
    this.preview.presets.forEach((preset, position) => {
      const label = el('label', 'preset-import-row');
      const input = el('input');
      input.type = 'checkbox';
      input.value = String(preset.index);
      input.checked = position < available;
      const side = this.i18n.t(`saved.side.${preset.orientation}`);
      label.append(input, el('span', '', this.i18n.t('presets.importSummary', {
        name: preset.name,
        side,
        columns: preset.columns,
        rows: preset.rows,
        count: preset.buttons,
      })));
      list.appendChild(label);
    });
    this.dialog.append(list, el('p', 'saved-note', this.i18n.t('presets.importAvailable', { count: available })));
    this.safety(this.preview.safety || {});
    const buttons = el('div', 'look-dialog-buttons');
    const cancel = el('button', '', this.i18n.t('common.cancel'));
    this.accept = el('button', 'is-primary', this.i18n.t('presets.importAction'));
    cancel.type = 'button';
    this.accept.type = 'button';
    cancel.addEventListener('click', () => this.dialog.close());
    this.accept.addEventListener('click', () => this.import());
    buttons.append(cancel, this.accept);
    this.dialog.appendChild(buttons);
    list.addEventListener('change', () => this.limit());
    this.limit();
    this.dialog.showModal();
  }

  safety(safety) {
    const box = el('div', 'preset-import-safety');
    box.appendChild(el('h3', '', this.i18n.t('presets.safetyTitle')));
    const values = [];
    if (safety.apps) values.push(this.i18n.t('presets.safetyApps', { count: safety.apps }));
    if (safety.urls) values.push(this.i18n.t('presets.safetyUrls', { count: safety.urls }));
    if (safety.texts) values.push(this.i18n.t('presets.safetyTexts', { count: safety.texts }));
    const summary = values.join(this.i18n.t('presets.safetySeparator'));
    box.appendChild(el('p', '', values.length ? `${summary} ${this.i18n.t('presets.safetyNote')}` : this.i18n.t('presets.safetyNone')));
    if (safety.paths && safety.paths.length) {
      const paths = el('ul');
      safety.paths.forEach((path) => paths.appendChild(el('li', '', path)));
      box.appendChild(paths);
    }
    this.dialog.appendChild(box);
  }

  checked() {
    return Array.from(this.dialog.querySelectorAll('input:checked')).map((input) => Number(input.value));
  }

  limit() {
    const available = Math.max(0, this.preview.available || 0);
    const full = this.checked().length >= available;
    this.dialog.querySelectorAll('input:not(:checked)').forEach((input) => { input.disabled = full; });
    this.accept.disabled = this.checked().length < 1;
  }

  async import() {
    try {
      const response = await this.api.post('/api/presets/import', { data: this.data, selected: this.checked() }, 15000);
      this.dialog.close();
      await this.onImported(response.presets || []);
    } catch (error) {
      this.onError(error.serverError || error.message);
    }
  }

  async export(ids) {
    try {
      downloadPreset(this.documentObject, await this.api.post('/api/presets/export', { ids }, 15000));
    } catch (error) {
      this.onError(error.serverError || error.message);
    }
  }
}
