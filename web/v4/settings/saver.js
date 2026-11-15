export class Saver {
  constructor(api, editor, options) {
    this.api = api;
    this.editor = editor;
    this.delay = options.delay === undefined ? 600 : options.delay;
    this.onStatus = options.onStatus || (() => {});
    this.onConflict = options.onConflict || (() => {});
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
        this.editor.restoreSaved();
        this.onStatus('failed', error.serverError || error.message);
      }
    } finally {
      this.saving = false;
      if (this.editor.dirty && !this.blocked) this.schedule(0);
    }
  }

  pause() { this.blocked = true; clearTimeout(this.timer); }
  resume() { this.blocked = false; }
}
