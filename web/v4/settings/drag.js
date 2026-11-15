export class PreviewDrag {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.active = null;
    this.down = (event) => this.start(event);
    this.move = (event) => this.drag(event);
    this.up = (event) => this.end(event);
    container.addEventListener('pointerdown', this.down);
    container.addEventListener('pointermove', this.move);
    container.addEventListener('pointerup', this.up);
    container.addEventListener('pointercancel', this.up);
  }

  start(event) {
    const hit = event.target.closest('.preview-hit[data-draggable="true"]');
    if (!hit) return;
    event.preventDefault();
    this.active = { hit, pointerId: event.pointerId, moved: false, startX: event.clientX, startY: event.clientY, cell: null };
    if (hit.setPointerCapture) hit.setPointerCapture(event.pointerId);
    this.options.onSelect(hit);
  }

  cell(event) {
    const rect = this.container.getBoundingClientRect();
    const columns = this.options.columns(), rows = this.options.rows();
    return {
      row: Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - rect.top) * rows / rect.height))),
      column: Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - rect.left) * columns / rect.width))),
    };
  }

  drag(event) {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    if (Math.hypot(event.clientX - this.active.startX, event.clientY - this.active.startY) > 5) this.active.moved = true;
    if (!this.active.moved) return;
    event.preventDefault();
    const cell = this.cell(event);
    const valid = this.options.canDrop(this.active.hit, cell);
    this.active.cell = cell;
    this.active.valid = valid;
    this.container.classList.toggle('is-invalid-drop', !valid);
    this.options.onHover(this.active.hit, cell, valid);
  }

  end(event) {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    event.preventDefault();
    const active = this.active;
    this.active = null;
    this.container.classList.remove('is-invalid-drop');
    this.options.onHover(null);
    if (active.moved && active.cell && active.valid) this.options.onDrop(active.hit, active.cell);
    else if (!active.moved) this.options.onSelect(active.hit);
  }

  destroy() {
    this.container.removeEventListener('pointerdown', this.down);
    this.container.removeEventListener('pointermove', this.move);
    this.container.removeEventListener('pointerup', this.up);
    this.container.removeEventListener('pointercancel', this.up);
  }
}
