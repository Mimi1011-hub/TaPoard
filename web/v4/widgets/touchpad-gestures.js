export class TouchpadGesture {
  constructor(node, sender, options, context) {
    Object.assign(this, { node, sender, options, context });
    this.pointers = new Map(); this.lastTapEnd = 0; this.dragging = false;
    this.down = (event) => this.begin(event); this.moveEvent = (event) => this.move(event); this.endEvent = (event) => this.end(event);
    node.addEventListener('pointerdown', this.down); node.addEventListener('pointermove', this.moveEvent);
    node.addEventListener('pointerup', this.endEvent); node.addEventListener('pointercancel', this.endEvent);
    if (context.pcWindow) this.bindPc();
  }

  click(control) {
    this.sender.button('buttonDown', control); this.sender.button('buttonUp', control); this.context.feedback.tap(true);
  }

  startDrag() {
    if (this.dragging) return;
    this.dragging = true; this.node.classList.add('dragging'); this.sender.button('buttonDown', 'left'); this.context.feedback.tap(true);
    clearInterval(this.keepTimer); this.keepTimer = setInterval(() => this.sender.keepalive(), 500);
  }

  stopDrag() {
    clearInterval(this.keepTimer); this.keepTimer = null;
    if (!this.dragging) return;
    this.dragging = false; this.node.classList.remove('dragging'); this.sender.button('buttonUp', 'left');
  }

  moveBy(dx, dy, elapsed) {
    let factor = this.options.speed * 0.3;
    if (this.options.acceleration && elapsed > 0) factor *= 1 + Math.min(2, Math.max(0, Math.hypot(dx, dy) / elapsed - 0.25) * 1.5);
    this.restX += dx * factor; this.restY += dy * factor;
    const x = Math.trunc(this.restX); const y = Math.trunc(this.restY);
    this.restX -= x; this.restY -= y; this.sender.move(x, y);
  }

  begin(event) {
    event.stopPropagation();
    if (this.context.pcWindow && event.pointerType === 'mouse' && event.button === 2) {
      this.click('right'); this.sender.release(); if (event.cancelable) event.preventDefault(); return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.pointers.has(event.pointerId)) return;
    if (this.node.setPointerCapture) try { this.node.setPointerCapture(event.pointerId); } catch (error) { /* unavailable */ }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: event.timeStamp || Date.now() });
    this.maxPointers = Math.max(this.maxPointers || 0, this.pointers.size);
    if (this.pointers.size === 1) {
      this.downTime = Date.now(); this.travel = 0; this.longFired = false; this.restX = 0; this.restY = 0; this.restScroll = 0;
      this.tapThenTouch = this.options.tapToClick && this.downTime - this.lastTapEnd < 300;
      clearTimeout(this.longTimer);
      if (this.options.longPress !== 'none') this.longTimer = setTimeout(() => {
        if (this.pointers.size !== 1 || this.travel > 8) return;
        this.longFired = true;
        if (this.options.longPress === 'rightClick') this.click('right'); else this.startDrag();
      }, 500);
    } else clearTimeout(this.longTimer);
    this.node.classList.add('adjusting');
    if (event.cancelable) event.preventDefault();
  }

  move(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.stopPropagation();
    const now = event.timeStamp || Date.now(); const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
    const elapsed = now - pointer.time;
    Object.assign(pointer, { x: event.clientX, y: event.clientY, time: now });
    this.travel += Math.abs(dx) + Math.abs(dy);
    if (this.travel > 8) clearTimeout(this.longTimer);
    if (event.cancelable) event.preventDefault();
    if (this.pointers.size === 1 && this.maxPointers === 1) {
      if (this.tapThenTouch && this.travel > 8) { this.tapThenTouch = false; this.startDrag(); }
      this.moveBy(dx, dy, elapsed);
    } else if (this.pointers.size >= 2 && this.options.twoFingerScroll) {
      this.restScroll += dy / this.pointers.size * 4;
      const delta = Math.trunc(this.restScroll);
      if (delta) { this.restScroll -= delta; this.sender.wheel(delta); }
    }
  }

  end(event) {
    if (!this.pointers.has(event.pointerId)) return;
    event.stopPropagation();
    this.pointers.delete(event.pointerId);
    if (event.cancelable) event.preventDefault();
    if (this.pointers.size > 0) return;
    clearTimeout(this.longTimer); this.node.classList.remove('adjusting');
    const tap = event.type === 'pointerup' && !this.longFired && Date.now() - this.downTime < 250 && this.travel < 10 * this.maxPointers;
    if (this.dragging) this.stopDrag();
    else if (tap && this.options.tapToClick) {
      this.click(this.maxPointers >= 2 ? 'right' : 'left');
      if (this.maxPointers === 1) this.lastTapEnd = Date.now();
    }
    this.maxPointers = 0; this.tapThenTouch = false; this.sender.release();
  }

  bindPc() {
    this.wheel = (event) => {
      event.preventDefault(); event.stopPropagation();
      const value = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      const delta = -Math.round(value * 1.2);
      if (delta) { this.sender.wheel(Math.max(-1200, Math.min(1200, delta))); this.sender.release(); }
    };
    this.node.addEventListener('wheel', this.wheel, { passive: false });
  }

  destroy() {
    clearTimeout(this.longTimer); clearInterval(this.keepTimer); this.stopDrag(); this.sender.release();
    this.node.removeEventListener('pointerdown', this.down); this.node.removeEventListener('pointermove', this.moveEvent);
    this.node.removeEventListener('pointerup', this.endEvent); this.node.removeEventListener('pointercancel', this.endEvent);
    if (this.wheel) this.node.removeEventListener('wheel', this.wheel);
  }
}
