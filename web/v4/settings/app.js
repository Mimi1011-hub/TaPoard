import { Api } from '../core/api.js';
import { I18n } from '../core/i18n.js';
import { Store } from '../core/store.js';
import { SyncLoop } from '../core/sync.js';
import { AdminKeyStore } from './admin-key.js';
import { SettingsShell } from './shell.js';

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
  const api = new Api(key, (path, options) => fetch(path, options));
  const store = new Store();
  const shell = new SettingsShell(nodes, i18n);
  shell.start();
  store.subscribe((state) => shell.updateConnection(state));
  const sync = new SyncLoop(api, store, {
    viewId: 'settings-window',
    onOffline: (offline) => shell.setOffline(offline),
    onAuthLost: () => {
      keys.clear();
      nodes.app.hidden = true;
      nodes.missing.hidden = false;
    },
  });
  sync.start();
  document.addEventListener('visibilitychange', () => sync.setHidden(document.hidden));
}).catch(() => {
  nodes.missing.hidden = false;
});
