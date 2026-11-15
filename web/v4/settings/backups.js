import { clear, el } from '../core/dom.js';

// Backups made by earlier versions. 4.0 only lists them and can go back to one; it makes no new ones.
export class Backups {
  constructor(options) {
    Object.assign(this, options);
    this.backups = [];
  }

  async load() {
    try { this.backups = (await this.api.get('/api/backups', 10000)).backups || []; }
    catch (error) { this.onError(error.serverError || error.message); }
    this.render();
  }

  render() {
    clear(this.root);
    this.root.appendChild(el('h3', '', this.i18n.t('backups.title')));
    if (!this.backups.length) {
      this.root.appendChild(el('p', 'saved-note', this.i18n.t('backups.empty')));
      return;
    }
    this.root.appendChild(el('p', 'saved-note', this.i18n.t('backups.note')));
    this.backups.forEach((backup) => {
      const row = el('div', 'saved-row'), text = el('div', 'saved-text'), actions = el('div', 'saved-actions');
      const note = this.i18n.t('backups.rowNote', { landscape: backup.landscape, portrait: backup.portrait });
      text.append(el('strong', '', backup.time), el('small', '', note));
      const restore = el('button', '', this.i18n.t('backups.restore'));
      restore.type = 'button';
      restore.addEventListener('click', () => this.restore(backup));
      actions.appendChild(restore);
      row.append(text, actions);
      this.root.appendChild(row);
    });
  }

  restore(backup) {
    return this.serverChange.run({
      reason: this.i18n.t('backups.confirm', { time: backup.time }),
      run: () => this.api.post('/api/backups/restore', { id: backup.id }, 30000),
      done: (result) => this.i18n.t('backups.done', { time: backup.time, count: result.buttons }),
      undone: this.i18n.t('backups.undone', { time: backup.time }),
      failed: this.i18n.t('backups.failed'),
    });
  }
}
