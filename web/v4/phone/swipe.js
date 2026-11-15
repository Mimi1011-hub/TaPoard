export class Swipe {
  constructor(root, storage, onPage) {
    this.root = root;
    this.storage = storage;
    this.onPage = onPage;
    this.start = null;
    root.addEventListener('pointerdown', (event) => this.down(event));
    root.addEventListener('pointerup', (event) => this.up(event));
    root.addEventListener('pointercancel', () => { this.start = null; });
  }

  down(event) {
    if (this.storage.getItem('tapoard-swipe') === 'off') return;
    this.start = { x: event.clientX, y: event.clientY };
  }

  up(event) {
    if (!this.start) return;
    const dx = event.clientX - this.start.x;
    const dy = event.clientY - this.start.y;
    this.start = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    this.onPage(dx < 0 ? 1 : -1);
  }
}
