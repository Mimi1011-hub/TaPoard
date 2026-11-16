const copy = (value) => JSON.parse(JSON.stringify(value));

export class History {
  constructor(editor, limit = 50) {
    this.editor = editor;
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.listeners = new Set();
    editor.subscribe((event) => {
      if (event.source === 'restore') {
        this.clear();
        return;
      }
      if (event.source !== 'edit') return;
      this.past.push(copy(event.before));
      if (this.past.length > this.limit) this.past.shift();
      this.future = [];
      this.emit();
    });
  }

  undo() {
    if (!this.past.length) return false;
    this.future.push(copy(this.editor.deck));
    this.editor.replaceDeck(this.past.pop(), 'history');
    this.emit();
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.past.push(copy(this.editor.deck));
    this.editor.replaceDeck(this.future.pop(), 'history');
    this.emit();
    return true;
  }

  clear() {
    this.past = [];
    this.future = [];
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }

  emit() { this.listeners.forEach((listener) => listener(this)); }
}
