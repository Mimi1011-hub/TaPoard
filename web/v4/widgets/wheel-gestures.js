export class VerticalWheelGesture {
  constructor(node, sender, options, feedback) {
    Object.assign(this, { node, sender, options, feedback });
    this.ridges = node.querySelector('.wheel-ridges');
    this.down = (event) => this.begin(event);
    this.moveEvent = (event) => this.move(event);
    this.endEvent = (event) => this.end(event);
    node.addEventListener('pointerdown', this.down);
    node.addEventListener('pointermove', this.moveEvent);
    node.addEventListener('pointerup', this.endEvent);
    node.addEventListener('pointercancel', this.endEvent);
  }

  begin(event) {
    if (this.tracking) return;
    event.stopPropagation();
    this.tracking = true; this.pointerId = event.pointerId;
    this.startY = this.lastY = event.clientY; this.travel = 0; this.moved = false;
    this.started = Date.now(); this.offset = this.offset || 0;
    this.node.classList.add('adjusting');
    if (this.node.setPointerCapture) try { this.node.setPointerCapture(event.pointerId); } catch (error) { /* unavailable */ }
    clearInterval(this.keepTimer); this.keepTimer = setInterval(() => this.sender.keepalive(), 500);
    if (event.cancelable) event.preventDefault();
  }

  move(event) {
    if (!this.tracking || event.pointerId !== this.pointerId) return;
    event.stopPropagation();
    const delta = this.lastY - event.clientY;
    this.lastY = event.clientY;
    if (Math.abs(event.clientY - this.startY) > 4) this.moved = true;
    this.travel += delta;
    this.offset = (this.offset - delta) % 24;
    if (this.ridges) this.ridges.style.backgroundPositionY = `${this.offset}px`;
    const steps = this.travel > 0 ? Math.floor(this.travel / this.options.sensitivity) : Math.ceil(this.travel / this.options.sensitivity);
    if (steps) {
      this.travel -= steps * this.options.sensitivity;
      this.sender.steps(steps);
      for (let index = 0; index < Math.abs(steps); index += 1) this.feedback.tap(false);
    }
    if (event.cancelable) event.preventDefault();
  }

  end(event) {
    if (!this.tracking || event.pointerId !== this.pointerId) return;
    event.stopPropagation();
    this.tracking = false; clearInterval(this.keepTimer); this.keepTimer = null;
    this.node.classList.remove('adjusting');
    if (!this.moved && event.type === 'pointerup' && this.options.middleClick && Date.now() - this.started < 400) {
      this.sender.button('buttonDown', 'middle'); this.sender.button('buttonUp', 'middle'); this.feedback.tap(true);
    }
    this.sender.release();
    if (event.cancelable) event.preventDefault();
  }

  destroy() {
    clearInterval(this.keepTimer);
    if (this.tracking) this.sender.release();
    this.node.removeEventListener('pointerdown', this.down); this.node.removeEventListener('pointermove', this.moveEvent);
    this.node.removeEventListener('pointerup', this.endEvent); this.node.removeEventListener('pointercancel', this.endEvent);
  }
}

export class RotaryWheelGesture {
  constructor(node, sender, options, feedback) {
    Object.assign(this, { node, sender, options, feedback });
    this.dial = node.querySelector('.wheel-dial'); this.rotation = 0;
    this.down = (event) => this.begin(event); this.moveEvent = (event) => this.move(event); this.endEvent = (event) => this.end(event);
    node.addEventListener('pointerdown', this.down); node.addEventListener('pointermove', this.moveEvent);
    node.addEventListener('pointerup', this.endEvent); node.addEventListener('pointercancel', this.endEvent);
  }

  polar(event) {
    const rect = this.node.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2); const dy = event.clientY - (rect.top + rect.height / 2);
    return { angle: Math.atan2(dy, dx) * 180 / Math.PI, inside: Math.hypot(dx, dy) < Math.min(rect.width, rect.height) * 0.18 };
  }

  begin(event) {
    if (this.tracking) return;
    event.stopPropagation();
    const point = this.polar(event);
    this.tracking = true; this.pointerId = event.pointerId; this.moved = false; this.sweep = 0;
    this.startedInCenter = point.inside; this.lastAngle = point.inside ? null : point.angle; this.started = Date.now();
    this.node.classList.add('adjusting');
    if (this.node.setPointerCapture) try { this.node.setPointerCapture(event.pointerId); } catch (error) { /* unavailable */ }
    clearInterval(this.keepTimer); this.keepTimer = setInterval(() => this.sender.keepalive(), 500);
    if (event.cancelable) event.preventDefault();
  }

  move(event) {
    if (!this.tracking || event.pointerId !== this.pointerId) return;
    event.stopPropagation();
    const point = this.polar(event);
    if (event.cancelable) event.preventDefault();
    if (point.inside) { this.lastAngle = null; return; }
    if (this.lastAngle === null) { this.lastAngle = point.angle; this.moved = true; return; }
    let delta = point.angle - this.lastAngle;
    if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
    this.lastAngle = point.angle;
    if (Math.abs(delta) > 0.5) this.moved = true;
    this.sweep += delta; this.rotation += delta;
    if (this.dial) this.dial.style.transform = `translate(-50%,-50%) rotate(${this.rotation.toFixed(1)}deg)`;
    const steps = this.sweep > 0 ? Math.floor(this.sweep / this.options.sensitivity) : Math.ceil(this.sweep / this.options.sensitivity);
    if (steps) {
      this.sweep -= steps * this.options.sensitivity; this.sender.steps(-steps);
      for (let index = 0; index < Math.abs(steps); index += 1) this.feedback.tap(false);
    }
  }

  end(event) {
    if (!this.tracking || event.pointerId !== this.pointerId) return;
    event.stopPropagation();
    this.tracking = false; clearInterval(this.keepTimer); this.keepTimer = null; this.node.classList.remove('adjusting');
    if (!this.moved && this.startedInCenter && event.type === 'pointerup' && this.options.middleClick && Date.now() - this.started < 400) {
      this.sender.button('buttonDown', 'middle'); this.sender.button('buttonUp', 'middle'); this.feedback.tap(true);
    }
    this.sender.release();
    if (event.cancelable) event.preventDefault();
  }

  destroy() {
    clearInterval(this.keepTimer);
    if (this.tracking) this.sender.release();
    this.node.removeEventListener('pointerdown', this.down); this.node.removeEventListener('pointermove', this.moveEvent);
    this.node.removeEventListener('pointerup', this.endEvent); this.node.removeEventListener('pointercancel', this.endEvent);
  }
}
