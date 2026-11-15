import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { I18n, chooseLanguage } from '../web/v4/core/i18n.js';

class MemoryStorage {
  constructor(values) { this.values = Object.assign({}, values); }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
  setItem(key, value) { this.values[key] = value; }
}

const ja = JSON.parse(await fs.readFile(new URL('../web/v4/i18n/ja.json', import.meta.url), 'utf8'));
const en = JSON.parse(await fs.readFile(new URL('../web/v4/i18n/en.json', import.meta.url), 'utf8'));
assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort(), 'Japanese and English keys match');
assert.equal(chooseLanguage('auto', 'ja-JP'), 'ja');
assert.equal(chooseLanguage(null, 'en-US'), 'en');
assert.equal(chooseLanguage('en', 'ja-JP'), 'en');

const dictionaries = { ja: Object.assign({}, ja), en: Object.assign({}, en) };
delete dictionaries.ja['action.failed'];
const i18n = new I18n(new MemoryStorage({ 'tapoard-lang': 'ja' }), 'en-US', async (language) => dictionaries[language]);
await i18n.init();
assert.equal(i18n.t('deck.page', { current: 2, total: 4 }), '2 / 4', 'parameters are inserted');
assert.equal(i18n.t('action.failed', { error: 'X' }), 'The action failed. X', 'English is the fallback');
assert.equal(i18n.t('missing.key'), 'missing.key', 'the key is the final fallback');
await i18n.setLanguage('en');
assert.equal(i18n.language, 'en');
assert.equal(i18n.t('menu.keepAwake'), 'Keep screen awake');
console.log('PASS i18n: language choice, fallback, parameters and matching dictionary keys');
