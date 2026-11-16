import { clear, el } from '../core/dom.js';
import { Backups } from './backups.js';
import { LookDialog } from './look-dialog.js';
import { Looks } from './looks.js';
import { ServerChange } from './server-change.js';

// The "saved" section: saved looks and backups.
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
    this.backups = new Backups(Object.assign({ root: block(), serverChange: this.serverChange }, shared));
  }

  start() { return Promise.all([this.looks.load(), this.backups.load()]); }
}
