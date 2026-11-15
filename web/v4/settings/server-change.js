// Presets, saved looks and backups make the PC rewrite the layout in one go. They all follow the
// same steps: save what is waiting, ask, call the PC, read the layout again, offer one undo.
export class ServerChange {
  constructor(options) {
    Object.assign(this, options);
    this.busy = false;
  }

  // change: { reason, run: () => Promise<result>, done: (result) => text, undone: text, failed: text }
  async run(change) {
    if (this.busy) return false;
    this.busy = true;
    try {
      if (!await this.settle()) {
        this.notify(this.i18n.t('serverChange.unsaved'));
        return false;
      }
      const answer = await this.dialog.ask(change.reason, this.looks.full(), this.looks.defaultName());
      if (!answer.go) return false;
      if (answer.save && !await this.looks.save(answer.name)) return false;
      let result;
      try { result = await change.run(); }
      catch (error) {
        this.notify(`${change.failed} ${error.serverError || error.message}`);
        return false;
      }
      await this.reload();
      this.notify(change.done(result), { label: this.i18n.t('serverChange.undo'), run: () => this.undo(change.undone) });
      return true;
    } finally {
      this.busy = false;
    }
  }

  async undo(text) {
    try {
      await this.api.post('/api/page/undo', {}, 30000);
      await this.reload();
      this.notify(text);
    } catch (error) {
      this.notify(error.serverError || error.message);
    }
  }
}
