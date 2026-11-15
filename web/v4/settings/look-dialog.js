import { clear, el } from '../core/dom.js';

// Asks before the PC replaces the layout: keep a copy of the current look first, go on without, or stop.
export class LookDialog {
  constructor(options) {
    Object.assign(this, options);
    this.node = el('dialog', 'look-dialog');
    this.documentObject.body.appendChild(this.node);
  }

  // Resolves to { go: false }, or { go: true, save: false }, or { go: true, save: true, name }.
  ask(reason, full, defaultName) {
    return new Promise((resolve) => {
      const done = (value) => {
        this.node.removeEventListener('cancel', onCancel);
        if (this.node.open) this.node.close();
        resolve(value);
      };
      const onCancel = (event) => { event.preventDefault(); done({ go: false }); };
      clear(this.node);
      this.node.appendChild(el('h2', '', this.i18n.t('lookDialog.title')));
      this.node.appendChild(el('p', 'look-dialog-reason', reason));
      this.node.appendChild(el('p', 'look-dialog-note', this.i18n.t(full ? 'lookDialog.full' : 'lookDialog.question')));
      const name = el('input', 'look-dialog-name');
      name.type = 'text'; name.maxLength = 40; name.value = defaultName; name.disabled = full;
      name.setAttribute('aria-label', this.i18n.t('looks.name'));
      this.node.appendChild(name);
      const buttons = el('div', 'look-dialog-buttons');
      const save = this.button('lookDialog.save', () => done({ go: true, save: true, name: name.value }));
      save.disabled = full;
      save.classList.add('is-primary');
      buttons.append(
        this.button('lookDialog.cancel', () => done({ go: false })),
        this.button('lookDialog.skip', () => done({ go: true, save: false })),
        save,
      );
      this.node.appendChild(buttons);
      this.node.addEventListener('cancel', onCancel);
      this.node.showModal();
      (full ? buttons.firstChild : name).focus();
    });
  }

  button(key, run) {
    const button = el('button', '', this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }
}
