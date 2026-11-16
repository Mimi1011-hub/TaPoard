import { picturePoint, pictureViewport } from '../deck/background-transform.js';

// Moves and zooms the background picture on the settings preview: drag to move, wheel to zoom.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Where the picture sits for a position: its drawn size and how far it sticks out of the screen.
export function pictureLayout(position, imageWidth, imageHeight, width, height) {
  const fitScale = position.fit === 'contain'
    ? Math.min(width / imageWidth, height / imageHeight)
    : Math.max(width / imageWidth, height / imageHeight);
  const scale = fitScale * position.zoom;
  const overX = imageWidth * scale - width, overY = imageHeight * scale - height;
  return { scale, overX, overY, left: -overX * position.x / 100, top: -overY * position.y / 100 };
}

// The position after the picture point under (fromX, fromY) is brought to (toX, toY) with a new zoom.
export function movePicture(position, size, zoom, fromX, fromY, toX, toY) {
  const before = pictureLayout(position, size.imageWidth, size.imageHeight, size.width, size.height);
  const next = Object.assign({}, position, { fit: position.fit, x: position.x, y: position.y, zoom: clamp(zoom, 1, 5) });
  const after = pictureLayout(next, size.imageWidth, size.imageHeight, size.width, size.height);
  const pictureX = (fromX - before.left) / before.scale, pictureY = (fromY - before.top) / before.scale;
  if (after.overX > 0) next.x = clamp(-(toX - pictureX * after.scale) / after.overX * 100, 0, 100);
  if (after.overY > 0) next.y = clamp(-(toY - pictureY * after.scale) / after.overY * 100, 0, 100);
  return next;
}

export class BackgroundAdjust {
  constructor(preview, onChange) {
    this.preview = preview;
    this.onChange = onChange;
    this.active = false;
    this.point = null;
    this.down = (event) => this.start(event);
    this.move = (event) => this.drag(event);
    this.up = () => { this.point = null; };
    this.wheel = (event) => this.zoom(event);
  }

  begin(value) {
    this.value = value;
    if (this.active) return;
    this.active = true;
    const screen = this.preview.screen;
    this.preview.overlay.style.pointerEvents = 'none';
    screen.classList.add('is-adjusting-background');
    screen.addEventListener('pointerdown', this.down);
    screen.addEventListener('pointermove', this.move);
    screen.addEventListener('pointerup', this.up);
    screen.addEventListener('pointercancel', this.up);
    screen.addEventListener('wheel', this.wheel, { passive: false });
  }

  end() {
    if (!this.active) return;
    this.active = false;
    this.point = null;
    const screen = this.preview.screen;
    this.preview.overlay.style.pointerEvents = '';
    screen.classList.remove('is-adjusting-background');
    screen.removeEventListener('pointerdown', this.down);
    screen.removeEventListener('pointermove', this.move);
    screen.removeEventListener('pointerup', this.up);
    screen.removeEventListener('pointercancel', this.up);
    screen.removeEventListener('wheel', this.wheel);
  }

  position() {
    const name = this.preview.orientation;
    if (!this.value[name]) this.value[name] = { fit: 'cover', x: 50, y: 50, zoom: 1 };
    return this.value[name];
  }

  size() {
    const rect = this.preview.shell.getBoundingClientRect();
    const view = pictureViewport(this.position(), rect.width, rect.height);
    return {
      left: rect.left, top: rect.top, screenWidth: rect.width, screenHeight: rect.height, width: view.width, height: view.height,
      imageWidth: this.value.imageWidth || rect.width, imageHeight: this.value.imageHeight || rect.height,
    };
  }

  start(event) {
    event.preventDefault();
    const size = this.size();
    const position = Object.assign({}, this.position());
    const point = picturePoint(position, size.screenWidth, size.screenHeight, event.clientX - size.left, event.clientY - size.top);
    this.point = { x: point.x, y: point.y, position };
    if (this.preview.screen.setPointerCapture) this.preview.screen.setPointerCapture(event.pointerId);
  }

  drag(event) {
    if (!this.point) return;
    const size = this.size(), start = this.point.position;
    const point = picturePoint(start, size.screenWidth, size.screenHeight, event.clientX - size.left, event.clientY - size.top);
    this.apply(movePicture(start, size, start.zoom, this.point.x, this.point.y, point.x, point.y));
  }

  zoom(event) {
    event.preventDefault();
    const size = this.size(), position = this.position();
    const point = picturePoint(position, size.screenWidth, size.screenHeight, event.clientX - size.left, event.clientY - size.top);
    const zoom = Math.round(position.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1) * 100) / 100;
    this.apply(movePicture(position, size, zoom, point.x, point.y, point.x, point.y));
  }

  apply(position) {
    this.value[this.preview.orientation] = position;
    this.onChange(this.value);
  }
}
