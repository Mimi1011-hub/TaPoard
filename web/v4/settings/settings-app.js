import { Api } from '../core/api.js';
import { Store } from '../core/store.js';
import { SyncLoop } from '../core/sync.js';
import { EditorState } from './editor-state.js';
import { History } from './history.js';
import { Saver } from './saver.js';
import { Preview } from './preview.js';
import { Pages } from './pages.js';
import { GridSize } from './grid-size.js';
import { Catalog } from './catalog.js';
import { Inspector } from './inspector.js';
import { IconPicker } from './icon-picker.js';
import { Appearance } from './appearance.js';
import { BackgroundSettings } from './background-settings.js';
import { Saved } from './saved.js';
import { Connect } from './connect.js';
import { PcWindowSettings } from './pc-window-settings.js';
import { General } from './general.js';
import { AppImport } from './app-import.js';
import { ShortcutPacks } from './shortcut-packs.js';
import { ConfirmDialog } from './confirm-dialog.js';

export class SettingsApp {
  constructor(options) {
    Object.assign(this, options);
    this.api = new Api(options.key, options.fetchFn);
    this.store = new Store();
  }

  async start() {
    const response = await this.api.get('/api/v3/deck', 10000);
    this.editor = new EditorState(response);
    this.history = new History(this.editor);
    this.saver = new Saver(this.api, this.editor, {
      onStatus: (status, error) => this.setSaveStatus(status, error),
      onConflict: () => this.externalConflict(),
    });
    this.preview = new Preview({
      root: this.nodes.preview, editor: this.editor, api: this.api, i18n: this.i18n,
      onSelect: (selection) => { if (this.inspector) this.inspector.select(selection); },
      onError: (message) => this.shell.showNotice(message),
    });
    this.iconPicker = new IconPicker({ editor: this.editor, i18n: this.i18n, documentObject: this.documentObject, onError: (message) => this.shell.showNotice(message) });
    this.inspector = new Inspector({
      root: this.nodes.inspector, editor: this.editor, preview: this.preview, i18n: this.i18n,
      api: this.api,
      chooseSection: (section) => this.shell.chooseSection(section),
      onIcon: (selection) => this.iconPicker.open(selection),
      onError: (message) => this.shell.showNotice(message),
    });
    this.pages = new Pages({
      root: this.nodes.pages, editor: this.editor, preview: this.preview, i18n: this.i18n,
      confirmFn: this.confirmFn, onError: (message) => this.shell.showNotice(message),
    });
    this.gridSize = new GridSize({
      root: this.nodes.gridSize, editor: this.editor, i18n: this.i18n,
      orientation: () => this.preview.orientation, confirmFn: this.confirmFn,
      onError: (message) => this.shell.showNotice(message),
    });
    this.catalog = new Catalog({
      root: this.nodes.catalog, editor: this.editor, preview: this.preview, i18n: this.i18n, documentObject: this.documentObject,
      onError: (message) => this.shell.showNotice(message),
    });
    this.shortcutPacks = new ShortcutPacks({
      api: this.api, catalog: this.catalog, i18n: this.i18n, documentObject: this.documentObject,
      confirmDialog: new ConfirmDialog(this.documentObject, this.i18n),
      onError: (message) => this.shell.showNotice(message),
      onNotice: (message) => this.shell.showNotice(message),
    });
    this.catalog.appsExtra = () => this.shortcutPacks.importButton();
    await this.shortcutPacks.load();
    this.appImport = new AppImport({
      root: this.nodes.catalog, api: this.api, editor: this.editor, preview: this.preview, i18n: this.i18n,
      documentObject: this.documentObject, onNotice: (message) => this.shell.showNotice(message),
    });
    this.appearance = new Appearance({
      root: this.nodes.sections.appearance, api: this.api, editor: this.editor, preview: this.preview, iconPicker: this.iconPicker,
      i18n: this.i18n, confirmFn: this.confirmFn, promptFn: this.promptFn, onError: (message) => this.shell.showNotice(message),
    });
    await this.appearance.start();
    this.backgroundSettings = new BackgroundSettings({
      root: this.appearance.backgroundRoot, api: this.api, editor: this.editor, preview: this.preview, i18n: this.i18n,
      onError: (message) => this.shell.showNotice(message),
    });
    this.saved = new Saved({
      root: this.nodes.sections.saved, api: this.api, editor: this.editor, preview: this.preview, i18n: this.i18n,
      documentObject: this.documentObject, confirmFn: this.confirmFn, promptFn: this.promptFn,
      settle: async () => (await this.backgroundSettings.flush()) && this.saver.flush(),
      reload: () => this.reloadDeck(),
      onError: (message) => this.shell.showNotice(message),
      onNotice: (message, action) => this.shell.showNotice(message, action),
    });
    await this.saved.start();
    this.connect = new Connect({
      root: this.nodes.sections.connection, api: this.api, i18n: this.i18n, documentObject: this.documentObject,
      onError: (message) => this.shell.showNotice(message),
    });
    await this.connect.start();
    this.shell.sections.subscribe((section) => this.connect.active(section === 'connection'));
    this.pcWindowSettings = new PcWindowSettings({
      root: this.nodes.sections.pc, api: this.api, i18n: this.i18n,
      onError: (message) => this.shell.showNotice(message),
    });
    this.pcWindowSettings.start();
    this.shell.sections.subscribe((section) => this.pcWindowSettings.active(section === 'pc'));
    this.general = new General({
      root: this.nodes.sections.general, api: this.api, editor: this.editor, i18n: this.i18n,
      onError: (message) => this.shell.showNotice(message),
    });
    this.general.start();
    this.preview.onTarget = () => this.saved.targetChanged();
    this.editor.subscribe((event) => { if (event.source === 'load') this.saved.targetChanged(); });
    this.nodes.orientation.forEach((button) => button.addEventListener('click', () => {
      this.nodes.orientation.forEach((value) => value.classList.toggle('is-active', value === button));
      this.preview.setOrientation(button.dataset.orientation);
      this.pages.render(); this.gridSize.render(); this.backgroundSettings.orientationChanged();
    }));
    this.history.subscribe((history) => { this.nodes.undo.disabled = !history.past.length; });
    this.nodes.undo.addEventListener('click', () => this.history.undo());
    this.documentObject.addEventListener('keydown', (event) => this.keydown(event));
    this.store.subscribe((state) => this.stateChanged(state));
    this.sync = new SyncLoop(this.api, this.store, {
      viewId: 'settings-window',
      onOffline: (offline) => this.shell.setOffline(offline),
      onAuthLost: this.onAuthLost,
    });
    this.sync.start();
    this.documentObject.addEventListener('visibilitychange', () => this.sync.setHidden(this.documentObject.hidden));
    this.setSaveStatus('saved');
  }

  keydown(event) {
    if (event.key === 'Delete' && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
      if (this.preview.removeSelected()) event.preventDefault();
      return;
    }
    if (!event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { if (this.history.undo()) event.preventDefault(); }
    else if (key === 'y' || (key === 'z' && event.shiftKey)) { if (this.history.redo()) event.preventDefault(); }
  }

  setSaveStatus(status, error) {
    this.nodes.saveStatus.textContent = error || this.i18n.t(`settings.save.${status}`);
    this.nodes.saveStatus.classList.toggle('is-error', status === 'failed');
  }

  stateChanged(state) {
    this.shell.updateConnection(state);
    if (this.preview) this.preview.updateRuntime(state);
    if (this.backgroundSettings && state.background) this.backgroundSettings.external(state.background);
    if (this.general) this.general.update(state);
    if (!this.editor || !state.version || state.version === this.editor.version || this.saver.saving) return;
    if (this.editor.dirty) this.externalConflict();
    else this.reloadDeck();
  }

  externalConflict() {
    this.saver.pause();
    this.shell.showConflict(() => this.reloadDeck(), () => {});
  }

  async reloadDeck() {
    const response = await this.api.get('/api/v3/deck', 10000);
    this.editor.load(response);
    this.saver.resume();
    this.history.clear();
    this.shell.hideConflict();
    this.setSaveStatus('saved');
  }
}
