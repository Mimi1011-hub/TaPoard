import { clear, el } from '../core/dom.js';
import { downloadPreset } from './preset-files.js';

const two = (value) => String(value).padStart(2, '0');

// Saved looks: named copies of the whole screen (layout, icons, background) kept on the PC.
export class Looks {
  constructor(options) {
    Object.assign(this, options);
    this.styles = [];
    this.max = 20;
  }

  full() { return this.styles.length >= this.max; }

  defaultName() {
    const now = new Date();
    return this.i18n.t('looks.defaultName', { date: `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${two(now.getMinutes())}` });
  }

  date(iso) {
    const value = new Date(iso);
    if (isNaN(value)) return '';
    return `${value.getFullYear()}/${value.getMonth() + 1}/${value.getDate()} ${value.getHours()}:${two(value.getMinutes())}`;
  }

  async load() {
    try {
      const result = await this.api.get('/api/icon-styles', 10000);
      this.styles = result.styles || [];
      this.max = result.maxStyles || 20;
    } catch (error) { this.onError(error.serverError || error.message); }
    this.render();
  }

  // Saves the current screen under a name. Waits for edits that are still on their way to the PC.
  async save(name) {
    if (!await this.settle()) {
      this.onError(this.i18n.t('serverChange.unsaved'));
      return false;
    }
    try {
      await this.api.post('/api/icon-styles/save', { name: name || '' }, 30000);
      await this.load();
      return true;
    } catch (error) {
      this.onError(`${this.i18n.t('looks.saveFailed')} ${error.serverError || error.message}`);
      return false;
    }
  }

  async post(action, body) {
    try {
      await this.api.post(`/api/icon-styles/${action}`, body, 10000);
      await this.load();
      return true;
    } catch (error) {
      this.onError(error.serverError || error.message);
      return false;
    }
  }

  button(key, className, run) {
    const button = el('button', className, this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('h3', '', this.i18n.t('looks.title')));
    this.root.appendChild(el('p', 'saved-note', this.i18n.t('looks.note')));
    this.root.appendChild(el('p', 'saved-note', this.i18n.t('looks.exportNote')));
    const form = el('div', 'looks-form'), name = el('input');
    name.type = 'text'; name.maxLength = 40; name.placeholder = this.defaultName();
    name.setAttribute('aria-label', this.i18n.t('looks.name'));
    const save = this.button('looks.save', 'saved-primary', async () => {
      save.disabled = true;
      if (await this.save(name.value)) this.onNotice(this.i18n.t('looks.saved'));
      else save.disabled = this.full();
    });
    save.disabled = this.full();
    form.append(name, save, el('span', 'saved-count', `${this.styles.length} / ${this.max}`));
    this.root.appendChild(form);
    if (!this.styles.length) {
      this.root.appendChild(el('p', 'saved-note', this.i18n.t('looks.empty')));
      return;
    }
    this.styles.forEach((style) => this.root.appendChild(this.row(style)));
  }

  row(style) {
    const row = el('div', 'saved-row'), swatch = el('span', 'saved-swatch'), text = el('div', 'saved-text');
    const color = /^#[0-9a-f]{6}$/i.test(style.color || '') ? style.color : '';
    const color2 = /^#[0-9a-f]{6}$/i.test(style.color2 || '') ? style.color2 : '';
    swatch.style.background = color ? (color2 ? `linear-gradient(135deg, ${color}, ${color2})` : color) : '#111216';
    if (style.hasImage) swatch.textContent = '🖼';
    let note = this.i18n.t('looks.rowNote', { date: this.date(style.created), count: style.count });
    if (style.hasImage) note += this.i18n.t('looks.hasImage');
    text.append(el('strong', '', style.name), el('small', '', note));
    const actions = el('div', 'saved-actions');
    actions.append(
      this.button('looks.apply', '', () => this.apply(style)),
      this.button('looks.export', 'is-subtle', () => this.export(style)),
      this.button('looks.rename', 'is-subtle', () => {
        const next = this.promptFn(this.i18n.t('looks.renamePrompt'), style.name);
        if (next !== null && next !== undefined) this.post('rename', { id: style.id, name: next });
      }),
      this.button('looks.delete', 'is-subtle', async () => {
        if (!this.confirmFn(this.i18n.t('looks.deleteConfirm', { name: style.name }))) return;
        if (await this.post('delete', { id: style.id })) this.onNotice(this.i18n.t('looks.deleted', { name: style.name }));
      }),
    );
    row.append(swatch, text, actions);
    return row;
  }

  async export(style) {
    try {
      const response = await this.api.post('/api/icon-styles/export', { id: style.id }, 30000);
      downloadPreset(this.documentObject, response);
    } catch (error) {
      this.onError(error.serverError || error.message);
    }
  }

  apply(style) {
    return this.serverChange.run({
      reason: this.i18n.t('looks.confirm', { name: style.name }),
      run: () => this.api.post('/api/icon-styles/apply', { id: style.id }, 30000),
      done: (result) => this.i18n.t('looks.done', { name: style.name, count: result.changed }),
      undone: this.i18n.t('looks.undone', { name: style.name }),
      failed: this.i18n.t('looks.failed'),
    });
  }
}
