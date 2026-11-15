import { Api } from '../core/api.js';
import { Feedback } from '../core/feedback.js';
import { SyncLoop } from '../core/sync.js';
import { ViewAnnouncer } from '../core/view.js';
import { getViewId } from '../core/view-id.js';
import { DeckBackground } from '../deck/background.js';
import { DeckGrid } from '../deck/grid.js';
import { isDisplayWidget } from '../widgets/registry.js';
import { PhoneMenu } from './menu.js';
import { PairingScreen } from './pairing.js';
import { Swipe } from './swipe.js';
import { TopBar } from './topbar.js';

export class PhoneApp {
  constructor(dependencies) {
    Object.assign(this, dependencies);
    this.key = this.keyStore.read();
    this.media = this.windowObject.matchMedia('(orientation: portrait)');
    this.messageTimer = null;
    this.signature = '';
    this.viewId = getViewId(this.sessionStorage, this.windowObject.crypto);
    this.feedback = new Feedback(this.storage, this.navigatorObject, this.windowObject);
  }

  start() {
    this.i18n.apply(this.documentObject);
    this.documentObject.addEventListener('pointerdown', () => this.feedback.prepare(), { passive: true });
    this.i18n.subscribe(() => {
      this.i18n.apply(this.documentObject);
      this.signature = '';
      if (this.store.get()) this.render(this.store.get());
      else if (this.pairing) this.pairing.build();
    });
    this.store.subscribe((state) => this.render(state));
    const orientationChanged = () => { this.signature = ''; this.render(this.store.get()); };
    if (this.media.addEventListener) this.media.addEventListener('change', orientationChanged);
    else this.media.addListener(orientationChanged);
    this.documentObject.addEventListener('visibilitychange', () => this.visibilityChanged());
    if (!this.key) this.disconnected();
    else this.connect();
  }

  connect() {
    if (this.pairing) { this.pairing.destroy(); this.pairing = null; }
    this.api = new Api(this.key, this.windowObject.fetch.bind(this.windowObject));
    const context = {
      api: this.api, i18n: this.i18n, feedback: this.feedback, viewId: this.viewId,
      documentObject: this.documentObject, state: () => this.store.get(),
      patch: (value) => this.store.update(value), refresh: () => this.sync.refresh(),
      showError: (error) => this.showError(error),
    };
    this.grid = new DeckGrid(context, (item) => this.press(item));
    this.background = new DeckBackground(this.nodes.deck.parentNode, this.api);
    this.announcer = new ViewAnnouncer(this.api, this.viewId);
    this.topbar = new TopBar(this.nodes.topbar, this.api, this.i18n, (page, orientation) => this.localPage(page, orientation), () => this.menu.open(), (error) => this.showError(error));
    this.menu = new PhoneMenu(this.nodes.menu, {
      storage: this.storage, i18n: this.i18n, keyStore: this.keyStore,
      documentObject: this.documentObject, wakeLock: this.navigatorObject.wakeLock,
      NoSleepClass: this.windowObject.NoSleep, onDisconnect: () => this.disconnect(),
    });
    new Swipe(this.nodes.deck, this.storage, (delta) => this.topbar.move(delta));
    this.sync = new SyncLoop(this.api, this.store, {
      viewId: this.viewId, visibleIds: () => this.visibleIds(),
      onOffline: (offline) => { this.nodes.offline.hidden = !offline; },
      onAuthLost: () => { this.keyStore.clear(); this.disconnect(); },
    });
    this.signature = '';
    this.nodes.app.hidden = false;
    this.nodes.disconnected.hidden = true;
    this.sync.start();
  }

  orientation() { return this.media.matches ? 'portrait' : 'landscape'; }

  render(state) {
    if (!state || !state.deck || !this.grid) return;
    const orientation = this.orientation();
    const orientationDeck = state.deck[orientation];
    if (!orientationDeck || !orientationDeck.pages || !orientationDeck.pages.length) return;
    const page = Math.max(0, Math.min((state.current && state.current[orientation]) || 0, orientationDeck.pages.length - 1));
    this.topbar.update(page, orientationDeck.pages.length, orientation);
    const signature = `${state.version || ''}|${orientation}|${page}|${this.i18n.language}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.grid.render(this.nodes.deck, orientationDeck, page, state.widgetDefinitions, state);
    } else this.grid.update(state);
    this.background.update(state.background, orientation);
    this.menu.setDeck(state.deck);
    this.i18n.apply(this.documentObject);
    if (!this.documentObject.hidden) this.announcer.announce(this.visibleIds()).catch(() => {});
  }

  localPage(page, orientation) {
    const state = this.store.get();
    if (!state || !state.current) return;
    state.current[orientation] = page;
    this.render(state);
  }

  visibleIds() {
    if (this.documentObject.hidden) return [];
    const state = this.store.get();
    if (!state || !state.deck) return [];
    const orientation = this.orientation();
    const page = (state.current && state.current[orientation]) || 0;
    const target = state.deck[orientation] && state.deck[orientation].pages[page];
    return target ? (target.items || []).filter((item) => isDisplayWidget(item.type)).map((item) => item.id).filter(Boolean) : [];
  }

  async press(item) {
    this.feedback.tap(true);
    try { await this.api.post('/api/action', { action: 'launch', id: item.id }, 8000); }
    catch (error) { this.showError(error); }
  }

  showError(error) {
    clearTimeout(this.messageTimer);
    this.nodes.message.textContent = this.i18n.t('action.failed', { error: error.serverError || this.i18n.t('error.network') });
    this.nodes.message.hidden = false;
    this.messageTimer = setTimeout(() => { this.nodes.message.hidden = true; }, 4000);
  }

  visibilityChanged() {
    const hidden = this.documentObject.hidden;
    if (this.sync) this.sync.setHidden(hidden);
    if (this.menu) this.menu.visibilityChanged(hidden);
    if (this.pairing) this.pairing.visibilityChanged(hidden);
    if (this.announcer) {
      if (hidden) this.announcer.clear();
      else this.announcer.announce(this.visibleIds()).catch(() => {});
    }
  }

  disconnect() {
    if (this.sync) this.sync.stop();
    if (this.menu) this.menu.releaseWake();
    if (this.grid) this.grid.destroy();
    if (this.background) this.background.destroy();
    if (this.announcer) this.announcer.clear();
    this.signature = '';
    this.disconnected();
  }

  disconnected() {
    this.nodes.app.hidden = true;
    this.nodes.offline.hidden = true;
    this.nodes.disconnected.hidden = false;
    if (this.pairing) this.pairing.destroy();
    const openApi = new Api('', this.windowObject.fetch.bind(this.windowObject));
    this.pairing = new PairingScreen(this.nodes.disconnected, {
      api: openApi, i18n: this.i18n, documentObject: this.documentObject,
      onApproved: (token) => { this.key = token; this.keyStore.save(token); this.connect(); },
    });
    this.i18n.apply(this.documentObject);
  }
}
