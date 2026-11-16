export class Saver {
  constructor(api, editor, options) {
    this.api = api;
    this.editor = editor;
    this.delay = options.delay === undefined ? 600 : options.delay;
    this.onStatus = options.onStatus || (() => {});
    this.onConflict = options.onConflict || (() => {});
    this.onRejected = options.onRejected || (() => {});
    this.timer = 0;
    this.saving = false;
    this.blocked = false;
    editor.subscribe((event) => {
      if (event.source === 'edit' || event.source === 'history') this.schedule();
    });
  }

  schedule(delay = this.delay) {
    if (this.blocked) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), delay);
  }

  async save() {
    clearTimeout(this.timer);
    if (this.blocked || this.saving || !this.editor.dirty) return;
    this.saving = true;
    this.failed = false;
    let failed = false;
    const revision = this.editor.revision;
    const body = { baseVersion: this.editor.version, deck: JSON.parse(JSON.stringify(this.editor.deck)) };
    this.onStatus('saving');
    try {
      await this.api.post('/api/v3/deck', body, 10000);
      const response = await this.api.get('/api/v3/deck', 10000);
      this.editor.acceptSaved(response, revision);
      this.onStatus('saved');
    } catch (error) {
      if (error.status === 409) { this.blocked = true; this.onConflict(error); }
      else {
        // 400 means the server refused this layout, so go back to the last saved one.
        // Other errors (timeout, server busy) keep the edits; the next edit tries again.
        failed = true;
        this.failed = true;
        if (error.status === 400) {
          this.editor.restoreSaved();
          this.onRejected(error.serverError || error.message);
        }
        this.onStatus('failed', error.serverError || error.message);
      }
    } finally {
      this.saving = false;
      if (this.editor.dirty && !this.blocked && !failed) this.schedule(0);
    }
  }

  // Saves what is still waiting. True when the PC now has everything that is on the screen.
  async flush() {
    for (let attempt = 0; attempt < 5 && this.editor.dirty && !this.blocked; attempt += 1) {
      if (this.saving) await new Promise((resolve) => setTimeout(resolve, 50));
      else await this.save();
      if (this.failed) return false;
    }
    return !this.editor.dirty && !this.blocked;
  }

  pause() { this.blocked = true; clearTimeout(this.timer); }
  resume() { this.blocked = false; }
}
