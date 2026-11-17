const BLOCKED = '.audio-fader,.wheel-widget,.touchpad-widget,.keypad-widget';

export class SwipeMotion {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.windowObject = options.windowObject || window;
  }

  bind() {
    this.root.addEventListener('pointerdown', (event) => this.begin(event));
    this.root.addEventListener('pointermove', (event) => this.follow(event));
    this.root.ownerDocument.addEventListener('pointerup', (event) => this.end(event));
    this.root.ownerDocument.addEventListener('pointercancel', (event) => this.cancel(event));
    return this;
  }

  begin(event) {
    this.track = null;
    if (!this.options.enabled() || event.button !== 0) return false;
    if (event.target.closest && event.target.closest(BLOCKED)) return false;
    this.track = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      time: Date.now(),
    };
    return true;
  }

  distance(event) {
    if (!this.track || event.pointerId !== this.track.id) return null;
    return { x: event.clientX - this.track.x, y: event.clientY - this.track.y };
  }

  horizontal(event, minimum = 10) {
    const distance = this.distance(event);
    return !!distance && Math.abs(distance.x) > minimum && Math.abs(distance.x) > Math.abs(distance.y) * 1.5;
  }

  follow(event) {
    const distance = this.distance(event);
    if (!distance) return false;
    this.track.lastX = event.clientX;
    this.track.lastY = event.clientY;
    if (!this.horizontal(event)) return false;
    if (this.reduced()) return true;
    const pages = this.options.pages();
    const next = pages.page + (distance.x < 0 ? 1 : -1);
    const shift = next >= 0 && next < pages.total ? distance.x : distance.x / 4;
    const opacity = String(1 - Math.min(0.6, Math.abs(shift) / Math.max(1, this.root.clientWidth)));
    this.motion(`translateX(${shift}px)`, opacity, 0);
    return true;
  }

  end(event) {
    const distance = this.distance(event);
    if (!distance) return false;
    const elapsed = Date.now() - this.track.time;
    this.track = null;
    const needed = Math.max(40, Math.min(120, this.root.clientWidth * 0.08));
    if (elapsed > 900 || Math.abs(distance.x) < needed || Math.abs(distance.x) < Math.abs(distance.y) * 1.5) {
      this.snapBack();
      return false;
    }
    const pages = this.options.pages();
    const delta = distance.x < 0 ? 1 : -1;
    if (pages.page + delta < 0 || pages.page + delta >= pages.total) {
      this.snapBack();
      return true;
    }
    if (this.reduced()) {
      this.clear();
      this.options.onPage(delta);
      return true;
    }
    const direction = distance.x < 0 ? -1 : 1;
    this.motion(`translateX(${direction * this.root.clientWidth * 0.5}px)`, '0', 140);
    this.windowObject.setTimeout(async () => {
      await this.options.onPage(delta);
      this.slideIn(-direction);
    }, 140);
    return true;
  }

  cancel(event) {
    if (event && (!this.track || event.pointerId !== this.track.id)) return;
    this.track = null;
    this.snapBack();
  }

  snapBack() {
    if (this.reduced()) this.clear();
    else this.motion('', '', 180);
  }

  slideIn(from) {
    const distance = from * Math.min(160, this.root.clientWidth * 0.25);
    this.motion(`translateX(${distance}px)`, '0.2', 0);
    this.root.offsetWidth;
    this.motion('', '', 200);
  }

  motion(transform, opacity, milliseconds) {
    this.root.style.transition = milliseconds
      ? `transform ${milliseconds}ms ease-out, opacity ${milliseconds}ms ease-out`
      : 'none';
    this.root.style.transform = transform;
    this.root.style.opacity = opacity;
  }

  clear() {
    this.root.style.transition = 'none';
    this.root.style.transform = '';
    this.root.style.opacity = '';
  }

  reduced() {
    return !!(this.windowObject.matchMedia && this.windowObject.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
}
