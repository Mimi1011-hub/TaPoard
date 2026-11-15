import { clear, el } from '../core/dom.js';

export class ConfirmDialog {
  constructor(documentObject, i18n) {
    this.documentObject = documentObject;
    this.i18n = i18n;
    this.node = el('dialog', 'confirm-dialog');
    documentObject.body.appendChild(this.node);
  }

  ask(message) {
    return new Promise((resolve) => {
      const done = (answer) => {
        this.node.removeEventListener('cancel', cancel);
        if (this.node.open) this.node.close();
        resolve(answer);
      };
      const cancel = (event) => {
        event.preventDefault();
        done(false);
      };
      clear(this.node);
      this.node.appendChild(el('p', '', message));
      const buttons = el('div', 'look-dialog-buttons');
      buttons.append(this.button('common.cancel', () => done(false)), this.button('common.ok', () => done(true)));
      this.node.appendChild(buttons);
      this.node.addEventListener('cancel', cancel);
      this.node.showModal();
    });
  }

  button(key, run) {
    const button = el('button', '', this.i18n.t(key));
    button.type = 'button';
    button.addEventListener('click', run);
    return button;
  }
}
