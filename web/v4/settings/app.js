import { I18n } from '../core/i18n.js';
import { AdminKeyStore } from './admin-key.js';
import { SettingsShell } from './shell.js';
import { SettingsApp } from './settings-app.js';

const i18n = new I18n(localStorage, navigator.language, async (language) => {
  const response = await fetch(`/v4/i18n/${language}.json`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
});

const nodes = {
  app: document.querySelector('#settings-app'),
  missing: document.querySelector('#settings-missing'),
  connection: document.querySelector('#settings-connection'),
  offline: document.querySelector('#settings-offline'),
  conflict: document.querySelector('#settings-conflict'),
  nav: document.querySelector('#settings-nav'),
  notice: document.querySelector('#settings-notice'),
  sections: {
    layout: document.querySelector('#settings-section-layout'),
    appearance: document.querySelector('#settings-section-appearance'),
    saved: document.querySelector('#settings-section-saved'),
  },
};

i18n.init().then(() => {
  document.title = i18n.t('settings.title');
  i18n.apply(document);
  const keys = new AdminKeyStore(sessionStorage, location, history);
  const key = keys.read();
  if (!key) {
    nodes.missing.hidden = false;
    return;
  }
  nodes.app.hidden = false;
  const shell = new SettingsShell(nodes, i18n);
  shell.start();
  const settings = new SettingsApp({
    key, i18n, shell, nodes: Object.assign(nodes, {
      undo: document.querySelector('#settings-undo'),
      saveStatus: document.querySelector('#settings-save-status'),
      preview: document.querySelector('#settings-preview'),
      orientation: Array.from(document.querySelectorAll('[data-orientation]')),
      pages: document.querySelector('#settings-pages'),
      gridSize: document.querySelector('#settings-grid-size'),
      catalog: document.querySelector('#settings-section-layout'),
      inspector: document.querySelector('#settings-inspector'),
    }),
    documentObject: document,
    confirmFn: (message) => window.confirm(message),
    promptFn: (message, value) => window.prompt(message, value),
    fetchFn: (path, options) => fetch(path, options),
    onAuthLost: () => {
      keys.clear();
      nodes.app.hidden = true;
      nodes.missing.hidden = false;
    },
  });
  settings.start().catch((error) => shell.showNotice(error.message));
}).catch(() => {
  nodes.missing.hidden = false;
});
