import { clear, el } from '../core/dom.js';
import { Backups } from './backups.js';
import { LookDialog } from './look-dialog.js';
import { Looks } from './looks.js';
import { Presets } from './presets.js';
import { ServerChange } from './server-change.js';

// The "saved" section: presets, saved looks and backups.
export class Saved {
  constructor(options) {
    Object.assign(this, options);
    clear(this.root);
    this.root.appendChild(el('h2', '', this.i18n.t('saved.title')));
    const block = () => {
      const node = el('section', 'appearance-block saved-block');
      this.root.appendChild(node);
      return node;
    };
    const shared = {
      api: this.api, editor: this.editor, preview: this.preview, i18n: this.i18n,
      confirmFn: this.confirmFn, promptFn: this.promptFn, onError: this.onError, onNotice: this.onNotice,
    };
    this.looks = new Looks(Object.assign({ root: block(), settle: this.settle }, shared));
    this.serverChange = new ServerChange({
      api: this.api, i18n: this.i18n, looks: this.looks, settle: this.settle, reload: this.reload, notify: this.onNotice,
      dialog: new LookDialog({ i18n: this.i18n, documentObject: this.documentObject }),
    });
    this.looks.serverChange = this.serverChange;
    this.presets = new Presets(Object.assign({ root: block(), serverChange: this.serverChange }, shared));
    this.backups = new Backups(Object.assign({ root: block(), serverChange: this.serverChange }, shared));
    this.root.insertBefore(this.presets.root, this.looks.root);
  }

  start() { return Promise.all([this.presets.load(), this.looks.load(), this.backups.load()]); }

  // The preview now shows another orientation or page: the preset text names where it will go.
  targetChanged() { this.presets.render(); }
}
