export function chooseLanguage(preference, navigatorLanguage) {
  if (preference === 'ja' || preference === 'en') return preference;
  return String(navigatorLanguage || '').toLowerCase().indexOf('ja') === 0 ? 'ja' : 'en';
}

export class I18n {
  constructor(storage, navigatorLanguage, loadLanguage) {
    this.storage = storage;
    this.navigatorLanguage = navigatorLanguage;
    this.loadLanguage = loadLanguage;
    this.dictionaries = {};
    this.listeners = new Set();
    this.language = chooseLanguage(storage.getItem('tapoard-lang'), navigatorLanguage);
  }

  async init() {
    await this.ensure('en');
    await this.ensure(this.language);
    return this;
  }

  async ensure(language) {
    if (!this.dictionaries[language]) this.dictionaries[language] = await this.loadLanguage(language);
  }

  async setLanguage(preference) {
    this.storage.setItem('tapoard-lang', preference);
    this.language = chooseLanguage(preference, this.navigatorLanguage);
    await this.ensure(this.language);
    this.listeners.forEach((listener) => listener(this.language));
  }

  t(key, params) {
    const current = this.dictionaries[this.language] || {};
    const english = this.dictionaries.en || {};
    let value = Object.prototype.hasOwnProperty.call(current, key)
      ? current[key]
      : Object.prototype.hasOwnProperty.call(english, key)
        ? english[key]
        : key;
    Object.keys(params || {}).forEach((name) => {
      value = value.split(`{${name}}`).join(String(params[name]));
    });
    return value;
  }

  apply(root) {
    const scope = root || null;
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = this.t(node.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-label]').forEach((node) => {
      node.setAttribute('aria-label', this.t(node.getAttribute('data-i18n-label')));
    });
    const documentElement = scope.documentElement || (scope.ownerDocument && scope.ownerDocument.documentElement);
    if (documentElement) documentElement.lang = this.language;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
