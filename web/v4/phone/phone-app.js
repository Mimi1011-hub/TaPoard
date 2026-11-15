import { Api } from '../core/api.js';
import { SyncLoop } from '../core/sync.js';
import { getViewId } from '../core/view-id.js';
import { DeckGrid } from '../deck/grid.js';
import { PhoneMenu } from './menu.js';
import { Swipe } from './swipe.js';
import { TopBar } from './topbar.js';

export class PhoneApp {
  constructor(dependencies) {
    Object.assign(this, dependencies);
    this.key = this.keyStore.read();
    this.media = this.windowObject.matchMedia('(orientation: portrait)');
    this.messageTimer = null;
  }

  start() {
    this.i18n.apply(this.documentObject);
    this.i18n.subscribe(() => {
      this.i18n.apply(this.documentObject);
      this.render(this.store.get());
    });
    this.store.subscribe((state) => this.render(state));
    this.media.addEventListener ? this.media.addEventListener('change', () => this.render(this.store.get())) : this.media.addListener(() => this.render(this.store.get()));
    this.documentObject.addEventListener('visibilitychange', () => {
      if (this.sync) this.sync.setHidden(this.documentObject.hidden);
      if (this.menu) this.menu.visibilityChanged(this.documentObject.hidden);
    });
    if (!this.key) this.disconnected();
    else this.connect();
  }

  connect() {
    this.api = new Api(this.key, this.windowObject.fetch.bind(this.windowObject));
    this.grid = new DeckGrid(this.i18n, (item) => this.press(item));
    this.topbar = new TopBar(this.nodes.topbar, this.api, this.i18n, (page, orientation) => this.localPage(page, orientation), () => this.menu.open(), (error) => this.showError(error));
    this.menu = new PhoneMenu(this.nodes.menu, {
      storage: this.storage, i18n: this.i18n, keyStore: this.keyStore,
      documentObject: this.documentObject, wakeLock: this.navigatorObject.wakeLock,
      NoSleepClass: this.windowObject.NoSleep, onDisconnect: () => this.disconnect(),
    });
    new Swipe(this.nodes.deck, this.storage, (delta) => this.topbar.move(delta));
    this.sync = new SyncLoop(this.api, this.store, {
      viewId: getViewId(this.sessionStorage, this.windowObject.crypto),
      visibleIds: () => this.visibleIds(),
      onOffline: (offline) => { this.nodes.offline.hidden = !offline; },
      onAuthLost: () => { this.keyStore.clear(); this.disconnect(); },
    });
    this.nodes.app.hidden = false;
    this.nodes.disconnected.hidden = true;
    this.sync.start();
  }

  orientation() {
    return this.media.matches ? 'portrait' : 'landscape';
  }

  render(state) {
    if (!state || !state.deck) return;
    const orientation = this.orientation();
    const orientationDeck = state.deck[orientation];
    const page = Math.max(0, Math.min((state.current && state.current[orientation]) || 0, orientationDeck.pages.length - 1));
    this.topbar.update(page, orientationDeck.pages.length, orientation);
    this.grid.render(this.nodes.deck, orientationDeck, page, state.widgetDefinitions);
    this.menu.setDeck(state.deck);
    this.i18n.apply(this.documentObject);
  }

  localPage(page, orientation) {
    const state = this.store.get();
    if (!state || !state.current) return;
    state.current[orientation] = page;
    this.render(state);
  }

  visibleIds() {
    const state = this.store.get();
    if (!state || !state.deck) return [];
    const orientation = this.orientation();
    const page = (state.current && state.current[orientation]) || 0;
    const target = state.deck[orientation].pages[page];
    return target ? (target.items || []).map((item) => item.id) : [];
  }

  async press(item) {
    if (this.menu.feedbackEnabled() && this.navigatorObject.vibrate) this.navigatorObject.vibrate(10);
    try {
      await this.api.post('/api/action', { action: 'launch', id: item.id }, 8000);
    } catch (error) {
      this.showError(error);
    }
  }

  showError(error) {
    clearTimeout(this.messageTimer);
    this.nodes.message.textContent = this.i18n.t('action.failed', { error: error.serverError || this.i18n.t('error.network') });
    this.nodes.message.hidden = false;
    this.messageTimer = setTimeout(() => { this.nodes.message.hidden = true; }, 4000);
  }

  disconnect() {
    if (this.sync) this.sync.stop();
    if (this.menu) this.menu.releaseWake();
    this.disconnected();
  }

  disconnected() {
    this.nodes.app.hidden = true;
    this.nodes.offline.hidden = true;
    this.nodes.disconnected.hidden = false;
    this.i18n.apply(this.documentObject);
  }
}
