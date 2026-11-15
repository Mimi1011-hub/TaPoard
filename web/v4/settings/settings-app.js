import { Api } from '../core/api.js';
import { Store } from '../core/store.js';
import { SyncLoop } from '../core/sync.js';
import { EditorState } from './editor-state.js';
import { History } from './history.js';
import { Saver } from './saver.js';

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
