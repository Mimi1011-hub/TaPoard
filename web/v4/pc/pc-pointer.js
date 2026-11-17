import { SwipeMotion } from '../deck/swipe-motion.js';

// Same as 3.x: clocks, weather, PC info and slideshows can be used to move the window; widgets with their own gestures cannot.
const INTERACTIVE =
  'button,a,input,select,textarea,label,.audio-fader,.touchpad-widget,.wheel-widget,.keypad-widget,.phone-menu,.menu-backdrop,.offline-band';

export class PcPointer {
  constructor(context) {
    this.context = context;
    this.state = { resizable: false, barVisible: true };
    this.edgeSize = 10;
    this.wheelRest = 0;
    this.wheelAt = 0;
    this.swipe = new SwipeMotion(context.deckNode, {
      enabled: context.swipeEnabled,
      onPage: context.movePage,
      pages: context.pages,
      windowObject: context.windowObject,
    });
    this.down = (event) => this.pointerDown(event);
    this.move = (event) => this.pointerMove(event);
    this.up = (event) => this.pointerUp(event);
    this.hover = (event) => this.pointerHover(event);
    this.menu = (event) => event.preventDefault();
    this.wheel = (event) => this.pageWheel(event);
    const documentObject = context.documentObject;
    documentObject.addEventListener('pointerdown', this.down, true);
    documentObject.addEventListener('pointermove', this.move, true);
    documentObject.addEventListener('pointerup', this.up, true);
    documentObject.addEventListener('pointercancel', this.up, true);
    documentObject.addEventListener('pointermove', this.hover, { passive: true });
    documentObject.addEventListener('contextmenu', this.menu);
    context.appNode.addEventListener('wheel', this.wheel, { passive: false });
  }
  set(value) {
    this.state.resizable = !!value.resizable;
    this.state.barVisible = !!value.barVisible;
  }
  post(message) {
    this.context.post(message);
  }
  empty(target) {
    return !(target && target.closest && target.closest(INTERACTIVE));
  }
  edgeAt(x, y) {
    if (!this.state.resizable) return '';
    const view = this.context.windowObject;
    const top = !this.state.barVisible && y < this.edgeSize;
    const bottom = y >= view.innerHeight - this.edgeSize;
    const left = x < this.edgeSize;
    const right = x >= view.innerWidth - this.edgeSize;
    return `${top ? 'top' : bottom ? 'bottom' : ''}${left ? 'left' : right ? 'right' : ''}`;
  }
  point(event) {
    const ratio = this.context.windowObject.devicePixelRatio || 1;
    return { x: event.screenX * ratio, y: event.screenY * ratio };
  }
  start(mode) {
    this.press.mode = mode;
    this.post(
      mode === 'drag'
        ? `drag:${Math.max(0, Math.min(1, this.press.clientX / Math.max(1, this.context.windowObject.innerWidth))).toFixed(3)}`
        : `resize:${this.press.edge}`,
    );
  }
  pointerDown(event) {
    this.post('raise');
    this.press = null;
    const button = event.target.closest && event.target.closest('button.deck-button');
    if (event.button !== 0 || (!button && !this.empty(event.target))) return;
    if (button && !this.context.swipeEnabled()) return;
    if (!button) {
      event.preventDefault();
      try {
        this.context.documentObject.documentElement.setPointerCapture(event.pointerId);
      } catch (error) {
        /* unavailable */
      }
    }
    const point = this.point(event);
    this.lastScreen = point;
    this.press = {
      id: event.pointerId,
      start: point,
      clientX: event.clientX,
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
      mode: '',
      button: !!button,
      edge: this.edgeAt(event.clientX, event.clientY),
    };
    if (this.press.edge) this.start('resize');
    else if (this.swipe.begin(event)) this.press.swipe = true;
    else if (!button) this.start('drag');
  }
  pointerMove(event) {
    if (!this.press || event.pointerId !== this.press.id) return;
    event.preventDefault();
    const dx = event.clientX - this.press.x;
    const dy = event.clientY - this.press.y;
    if (!this.press.mode) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (this.press.button && this.swipe.horizontal(event)) this.press.mode = 'swipe';
      else if (this.press.button) return;
      else if (Date.now() - this.press.time < 250 && this.swipe.horizontal(event, 6)) this.press.mode = 'swipe';
      else this.start('drag');
    }
    if (this.press.mode === 'swipe') {
      this.swipe.follow(event);
      return;
    }
    if (this.press.swipe) {
      this.swipe.cancel();
      this.press.swipe = false;
    }
    const point = this.point(event);
    this.lastScreen = point;
    this.post(`move:${Math.round(point.x - this.press.start.x)},${Math.round(point.y - this.press.start.y)}`);
  }
  pointerUp(event) {
    if (!this.press || event.pointerId !== this.press.id) return;
    const press = this.press;
    this.press = null;
    try {
      this.context.documentObject.documentElement.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* unavailable */
    }
    if (press.mode === 'swipe') {
      this.swipe.end(event);
    } else {
      if (press.swipe) this.swipe.cancel();
      if (press.mode) this.post('dragend');
    }
  }
  pointerHover(event) {
    if (event.buttons) return;
    const edge = this.empty(event.target) ? this.edgeAt(event.clientX, event.clientY) : '';
    const cursors = {
      top: 'ns-resize',
      bottom: 'ns-resize',
      left: 'ew-resize',
      right: 'ew-resize',
      topleft: 'nwse-resize',
      bottomright: 'nwse-resize',
      topright: 'nesw-resize',
      bottomleft: 'nesw-resize',
    };
    this.context.documentObject.documentElement.style.cursor = edge ? cursors[edge] : '';
  }
  pageWheel(event) {
    if (event.ctrlKey) {
      event.preventDefault();
      return;
    }
    if (event.target.closest('.wheel-widget,.touchpad-widget')) return;
    event.preventDefault();
    const now = Date.now();
    if (now - this.wheelAt > 400) this.wheelRest = 0;
    this.wheelAt = now;
    this.wheelRest += event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    if (Math.abs(this.wheelRest) < 80) return;
    this.context.movePage(this.wheelRest > 0 ? 1 : -1);
    this.wheelRest = 0;
  }
  rebase() {
    if (this.press && this.lastScreen) this.press.start = this.lastScreen;
  }
}
