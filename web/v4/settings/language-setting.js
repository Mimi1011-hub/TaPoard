import { el } from '../core/dom.js';

export class LanguageSetting {
  constructor(options) {
    Object.assign(this, options);
  }

  mount(root) {
    const label = el('label', 'settings-field', this.i18n.t('general.language'));
    this.select = el('select', 'settings-select');
    [['auto', this.i18n.t('general.languageAuto')]].concat(
      this.view.languages.map((language) => [language.id, language.name]),
    ).forEach(([value, name]) => {
      const option = el('option', '', name);
      option.value = value;
      this.select.appendChild(option);
    });
    this.select.value = this.view.preference;
    this.select.addEventListener('change', () => this.change());
    label.appendChild(this.select);
    root.appendChild(label);
  }

  async change() {
    try {
      const view = await this.api.post('/api/v3/language', { preference: this.select.value });
      await this.i18n.setLanguage(view.language, false);
      this.documentObject.location.reload();
    } catch (error) {
      this.onError(error.serverError || error.message);
    }
  }
}
