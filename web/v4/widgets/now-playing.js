import { clear, el } from '../core/dom.js';
import { appendWidgetName } from './common.js';

function time(value) {
  if (!Number.isFinite(value) || value < 0) return '—:—';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function sample() {
  return {
    available: true,
    active: true,
    title: 'preview.song',
    artist: 'preview.artist',
    album: 'preview.album',
    app: 'preview.app',
    playing: true,
    canPlayPause: true,
    canNext: true,
    canPrevious: true,
    position: 83,
    duration: 225,
    artVersion: 'preview',
  };
}

export class NowPlayingWidget {
  constructor(context) {
    this.context = context;
    this.timer = null;
    this.artVersion = '';
    this.artUrl = '';
    this.compactClick = (event) => {
      if (!event.target.closest('.now-playing-control')) this.command('playPause');
    };
  }

  mount(node, item, state) {
    this.node = node;
    this.item = item;
    this.options = Object.assign({ showArt: true, showControls: true, showProgress: true }, item.options || {});
    this.shape = `${item.width || 1}x${item.height || 1}`;
    node.classList.add('now-playing-widget', `now-playing-${this.shape}`);
    node.classList.toggle('now-playing-labelled', !item.hideLabel && !!item.name);
    if (this.shape === '2x1' && !this.context.preview) node.addEventListener('click', this.compactClick);
    this.update(state);
    this.timer = setInterval(() => this.updateProgress(), 250);
  }

  update(state) {
    this.media = this.context.preview ? sample() : Object.assign({}, state.media || {});
    ['title', 'artist', 'album', 'app'].forEach((name) => {
      if (this.context.preview) this.media[name] = this.context.i18n.t(this.media[name]);
    });
    this.received = Date.now();
    this.position = Number(this.media.position) || 0;
    if (this.options.showArt && !this.context.preview && this.media.artVersion && this.media.artVersion !== this.artVersion)
      this.loadArt(this.media.artVersion);
    this.render();
  }

  async loadArt(version) {
    this.artVersion = version;
    try {
      const blob = await this.context.api.blob(`/api/media/art?v=${encodeURIComponent(version)}`, 10000);
      if (this.artVersion !== version) return;
      const URLClass = this.context.documentObject.defaultView.URL;
      if (this.artUrl) URLClass.revokeObjectURL(this.artUrl);
      this.artUrl = URLClass.createObjectURL(blob);
      this.render();
    } catch (_) {
      this.artUrl = '';
    }
  }

  render() {
    clear(this.node);
    if (!this.media.available) return this.message('nowPlaying.unavailable');
    if (!this.media.active) return this.message('nowPlaying.empty');
    const compact = this.shape === '2x1';
    const square = this.shape === '2x2';
    const tall = this.shape === '3x3' || this.shape === '4x4';
    const sideTall = this.shape === '4x3';
    if (this.options.showArt) this.node.appendChild(this.art());
    const content = el('div', 'now-playing-content');
    const info = el('div', 'now-playing-info');
    info.append(el('strong', 'now-playing-title', this.media.title || this.context.i18n.t('nowPlaying.unknown')));
    info.appendChild(el('span', 'now-playing-artist', this.media.artist || ''));
    if (!compact && !square) info.appendChild(el('span', 'now-playing-album', this.media.album || ''));
    if (!compact && !square && !tall) info.appendChild(el('span', 'now-playing-app', this.media.app || ''));
    content.appendChild(info);
    if (this.options.showProgress && Number(this.media.duration) > 0) content.appendChild(this.progress(tall || sideTall));
    if (!compact && this.options.showControls) content.appendChild(this.controls(tall));
    this.node.appendChild(content);
    appendWidgetName(this.node, this.item);
  }

  art() {
    const wrap = el('div', 'now-playing-art');
    if (this.artUrl) {
      const image = el('img', 'now-playing-picture');
      image.alt = '';
      image.src = this.artUrl;
      wrap.appendChild(image);
    } else wrap.appendChild(el('span', 'now-playing-note', '♪'));
    return wrap;
  }

  progress(showTime) {
    const wrap = el('div', 'now-playing-progress');
    const track = el('div', 'now-playing-track');
    this.progressFill = el('span', 'now-playing-fill');
    track.appendChild(this.progressFill);
    wrap.appendChild(track);
    if (showTime) {
      this.timeText = el('small', 'now-playing-time');
      wrap.appendChild(this.timeText);
    }
    this.updateProgress();
    return wrap;
  }

  updateProgress() {
    if (!this.media || !this.progressFill) return;
    const elapsed = this.media.playing ? (Date.now() - this.received) / 1000 : 0;
    const position = Math.min(Number(this.media.duration) || 0, this.position + elapsed);
    this.progressFill.style.width = `${Math.max(0, Math.min(100, (100 * position) / this.media.duration))}%`;
    if (this.timeText) this.timeText.textContent = `${time(position)} / ${time(this.media.duration)}`;
  }

  controls(large) {
    const controls = el('div', `now-playing-controls now-playing-control${large ? ' is-large' : ''}`);
    [['previous', '⏮', this.media.canPrevious], ['playPause', this.media.playing ? '⏸' : '▶', this.media.canPlayPause],
      ['next', '⏭', this.media.canNext]].forEach(([command, symbol, enabled]) => {
      const button = el('button', 'now-playing-control', symbol);
      button.type = 'button';
      button.disabled = !enabled;
      button.dataset.command = command;
      button.setAttribute('aria-label', this.context.i18n.t(`nowPlaying.${command}`));
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.context.feedback.tap(true);
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.command(command);
      });
      controls.appendChild(button);
    });
    return controls;
  }

  async command(command) {
    if (this.context.preview) return;
    try { await this.context.api.post('/api/media/command', { command }, 8000); }
    catch (error) { this.context.showError(error); }
  }

  message(key) {
    this.node.append(el('span', 'now-playing-note', '♪'), el('strong', 'now-playing-message', this.context.i18n.t(key)));
    appendWidgetName(this.node, this.item);
  }

  destroy() {
    clearInterval(this.timer);
    this.node.removeEventListener('click', this.compactClick);
    if (this.artUrl) this.context.documentObject.defaultView.URL.revokeObjectURL(this.artUrl);
  }
}
