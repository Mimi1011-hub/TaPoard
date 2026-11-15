import { I18n } from './core/i18n.js';
import { KeyStore } from './core/keys.js';
import { Store } from './core/store.js';
import { PhoneApp } from './phone/phone-app.js';

const i18n = new I18n(localStorage, navigator.language, async (language) => {
  const response = await fetch(`/v4/i18n/${language}.json`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
});

i18n.init().then(() => {
  document.title = i18n.t('app.name');
  const app = new PhoneApp({
    windowObject: window,
    documentObject: document,
    navigatorObject: navigator,
    storage: localStorage,
    sessionStorage,
    i18n,
    store: new Store(),
    keyStore: new KeyStore(localStorage, location, history),
    nodes: {
      app: document.querySelector('#phone-app'),
      topbar: document.querySelector('#topbar'),
      deck: document.querySelector('#deck'),
      message: document.querySelector('#message'),
      offline: document.querySelector('#offline'),
      disconnected: document.querySelector('#disconnected'),
      menu: document.querySelector('#menu-root'),
    },
  });
  app.start();
}).catch(() => {
  document.querySelector('#disconnected').hidden = false;
});
