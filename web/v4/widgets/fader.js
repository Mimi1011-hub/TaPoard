import { el } from '../core/dom.js';

const svgNamespace = 'http://www.w3.org/2000/svg';

function faderIcon(target, documentObject) {
  const svg = documentObject.createElementNS(svgNamespace, 'svg');
  const add = (name, values) => {
    const node = documentObject.createElementNS(svgNamespace, name);
    Object.keys(values).forEach((key) => node.setAttribute(key, values[key]));
    svg.appendChild(node);
  };
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (target === 'mic') {
    add('rect', { x: '17', y: '6', width: '14', height: '25', rx: '7' });
    add('path', { d: 'M11 24a13 13 0 0 0 26 0M24 37v6m-7 0h14' });
  } else {
    add('path', { d: 'M8 19h8l10-8v26l-10-8H8z' });
    add('path', { d: 'M33 18c3 3 3 9 0 12m5-17c6 6 6 16 0 22' });
  }
  return svg;
}

export class FaderWidget {
  constructor(context) {
    this.context = context;
    this.tracking = false;
    this.pending = null;
    this.inFlight = false;
    this.finishing = false;
    this.lastSent = 0;
    this.timer = null;
  }

  mount(node, item, state) {
    this.node = node;
    this.item = item;
    this.target = item.target;
    this.horizontal = (item.width || 1) > (item.height || 1);
    node.classList.add('audio-fader');
    if (this.horizontal) node.classList.add('horizontal');
    this.mute = el('button', 'audio-mute');
    this.mute.appendChild(faderIcon(this.target, node.ownerDocument));
    this.mute.type = 'button';
    this.mute.setAttribute('aria-label', this.context.i18n.t(this.target === 'mic' ? 'fader.micMute' : 'fader.speakerMute'));
    this.track = el('div', `fader-track${this.horizontal ? ' horizontal-track' : ''}`);
    this.track.setAttribute('role', 'slider');
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', '100');
    this.level = el('span', 'fader-level');
    this.thumb = el('span', 'fader-thumb');
    this.track.append(this.level, this.thumb);
    this.label = el('span', 'fader-value');
    node.append(this.mute, this.track, this.label);
    if (this.context.preview) { this.update(state); return; }
    this.onMute = (event) => { event.stopPropagation(); this.context.feedback.tap(true); this.sendMute(); };
    this.down = (event) => this.start(event);
    this.move = (event) => this.drag(event);
    this.up = (event) => this.end(event);
    this.mute.addEventListener('click', this.onMute);
    this.track.addEventListener('pointerdown', this.down);
    this.track.addEventListener('pointermove', this.move);
    this.track.addEventListener('pointerup', this.up);
    this.track.addEventListener('pointercancel', this.up);
    this.update(state);
  }

  audio(state) {
    const audio = state.audio || {};
    const prefix = this.target === 'mic' ? 'mic' : 'speaker';
    return { value: Number.isFinite(audio[`${prefix}Volume`]) ? audio[`${prefix}Volume`] : 0,
      muted: !!audio[`${prefix}Muted`], available: audio[`${prefix}Available`] !== false };
  }

  update(state) {
    const value = this.audio(state);
    this.mute.disabled = !value.available;
    this.track.classList.toggle('disabled', !value.available);
    this.node.classList.toggle('muted', value.muted);
    this.node.classList.toggle('unavailable', !value.available);
    if (!this.tracking && !this.finishing) this.paint(value.value);
  }

  paint(value) {
    this.current = Math.round(Math.max(0, Math.min(100, value)));
    if (this.horizontal) { this.level.style.width = `${this.current}%`; this.thumb.style.left = `calc(${this.current}% - 5px)`; }
    else { this.level.style.height = `${this.current}%`; this.thumb.style.bottom = `calc(${this.current}% - 5px)`; }
    this.track.setAttribute('aria-valuenow', this.current);
    this.label.textContent = `${this.current}%`;
  }

  start(event) {
    if (this.mute.disabled) return;
    event.stopPropagation(); event.preventDefault();
    this.context.feedback.prepare(); this.context.feedback.tap(false);
    this.tracking = true;
    if (this.track.setPointerCapture) this.track.setPointerCapture(event.pointerId);
    this.drag(event);
  }

  drag(event) {
    if (!this.tracking) return;
    event.stopPropagation(); event.preventDefault();
    const rect = this.track.getBoundingClientRect();
    const value = this.horizontal ? (event.clientX - rect.left) * 100 / rect.width : (rect.bottom - event.clientY) * 100 / rect.height;
    this.paint(value);
    this.context.feedback.tap(false);
    this.pending = this.current;
    this.pump(false);
  }

  end(event) {
    if (!this.tracking) return;
    event.stopPropagation(); event.preventDefault();
    this.tracking = false;
    this.pending = this.current;
    this.finishing = true;
    clearTimeout(this.timer);
    this.pump(true);
  }

  pump(finalRequest) {
    if (this.inFlight || this.pending === null) return;
    const wait = finalRequest ? 0 : Math.max(0, 80 - (Date.now() - this.lastSent));
    if (wait) { clearTimeout(this.timer); this.timer = setTimeout(() => this.pump(false), wait); return; }
    const volume = this.pending;
    this.pending = null;
    this.inFlight = true;
    this.lastSent = Date.now();
    const final = !!(finalRequest && this.finishing);
    const body = { target: this.target, volume };
    if (final) body.final = true;
    this.context.api.post('/api/audio', body, 8000).then((result) => this.apply(result), (error) => this.failed(error)).then(() => {
      this.inFlight = false;
      if (this.pending !== null) this.pump(this.finishing);
      else if (this.finishing) this.finishing = false;
    });
  }

  async sendMute() {
    try { this.apply(await this.context.api.post('/api/audio', { target: this.target, toggleMute: true }, 8000)); }
    catch (error) { this.failed(error); }
  }

  // The PC answers with only this fader's device filled in, so the other device's values are kept.
  apply(result) {
    if (!result || !result.audio) return;
    const prefix = this.target === 'mic' ? 'mic' : 'speaker';
    const audio = Object.assign({}, this.context.state().audio || {});
    ['Volume', 'Muted', 'Available'].forEach((name) => {
      audio[`${prefix}${name}`] = result.audio[`${prefix}${name}`];
    });
    this.context.patch({ audio, revision: result.revision });
  }

  failed(error) {
    this.context.showError(error);
    this.context.refresh().catch(() => {});
  }

  destroy() {
    clearTimeout(this.timer);
    if (this.context.preview) return;
    this.mute.removeEventListener('click', this.onMute);
    this.track.removeEventListener('pointerdown', this.down);
    this.track.removeEventListener('pointermove', this.move);
    this.track.removeEventListener('pointerup', this.up);
    this.track.removeEventListener('pointercancel', this.up);
  }
}
