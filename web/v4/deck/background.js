import { safeImageSource } from '../core/image-source.js';
import { hexRgb, keyShade, lightness, mixRgb, rgbCss } from './color.js';

function backgroundPosition(background, orientation) {
  const position = background[orientation] || {};
  return {
    fit: position.fit === 'contain' ? 'contain' : 'cover',
    x: Number.isFinite(position.x) ? position.x : 50,
    y: Number.isFinite(position.y) ? position.y : 50,
    zoom: position.zoom >= 1 ? position.zoom : 1,
  };
}

export class DeckBackground {
  constructor(target, api) {
    this.target = target;
    this.api = api;
    this.imageVersion = null;
    this.imageData = '';
    this.layer = target.ownerDocument.createElement('div');
    this.layer.className = 'deck-background';
    this.layer.setAttribute('aria-hidden', 'true');
    this.picture = target.ownerDocument.createElement('div');
    this.picture.className = 'deck-background-picture';
    this.shade = target.ownerDocument.createElement('div');
    this.shade.className = 'deck-background-shade';
    this.layer.append(this.picture, this.shade);
    target.insertBefore(this.layer, target.firstChild);
    this.resize = () => this.paint();
    target.ownerDocument.defaultView.addEventListener('resize', this.resize);
  }

  async update(background, orientation) {
    this.value = background || {};
    this.orientation = orientation;
    const wanted = this.value.image || '';
    if (wanted !== this.imageVersion) {
      this.imageVersion = wanted;
      this.imageData = '';
      if (wanted) {
        try {
          const result = await this.api.get('/api/background/image', 20000);
          if (wanted === this.imageVersion) this.imageData = safeImageSource(result.data);
        } catch (error) { if (wanted === this.imageVersion) this.imageVersion = null; }
      }
    }
    this.paint();
  }

  paint() {
    const background = this.value || {};
    const one = hexRgb(background.color);
    const two = hexRgb(background.color2);
    const active = !!(one || (background.image && this.imageData));
    this.target.classList.toggle('has-deck-background', active);
    this.target.style.background = one ? (two ? `linear-gradient(135deg, ${background.color}, ${background.color2})` : background.color) : '';
    this.paintPicture(background);
    this.paintKeys(background, active);
    this.fadeKeys(background);
  }

  paintPicture(background) {
    const position = backgroundPosition(background, this.orientation);
    this.picture.style.backgroundImage = background.image && this.imageData ? `url("${this.imageData}")` : '';
    this.picture.style.backgroundPosition = `${position.x}% ${position.y}%`;
    this.picture.style.filter = background.blur ? `blur(${background.blur}px)` : '';
    this.picture.style.transform = background.blur ? 'scale(1.04)' : '';
    this.shade.style.background = background.dim ? `rgba(0,0,0,${background.dim / 100})` : 'transparent';
    if (!background.image || !this.imageData) { this.picture.style.backgroundSize = ''; return; }
    const width = this.target.clientWidth || 1;
    const height = this.target.clientHeight || 1;
    const imageWidth = background.imageWidth || 1;
    const imageHeight = background.imageHeight || 1;
    const scale = (position.fit === 'contain' ? Math.min(width / imageWidth, height / imageHeight) : Math.max(width / imageWidth, height / imageHeight)) * position.zoom;
    this.picture.style.backgroundSize = `${Math.round(imageWidth * scale)}px ${Math.round(imageHeight * scale)}px`;
  }

  paintKeys(background, active) {
    const mode = !active || background.keys === 'standard' ? '' : background.keys === 'glass' || !background.color ? 'glass' : 'tint';
    const first = hexRgb(background.color);
    const second = hexRgb(background.color2) || first;
    const light = mode === 'tint' && first && (lightness(first) + lightness(second)) / 2 > 0.6;
    this.target.classList.toggle('keys-tint', mode === 'tint');
    this.target.classList.toggle('keys-glass', mode === 'glass');
    this.target.classList.toggle('keys-light', !!light);
    ['--key-bg', '--key-border', '--key-empty', '--key-shadow'].forEach((name) => this.target.style.removeProperty(name));
    if (mode !== 'tint') return;
    const one = keyShade(first, light);
    const two = background.color2 ? keyShade(second, light) : mixRgb(one, light ? [255, 255, 255] : [0, 0, 0], light ? 0.35 : 0.25);
    this.target.style.setProperty('--key-bg', `linear-gradient(145deg, ${rgbCss(one)}, ${rgbCss(two)})`);
    this.target.style.setProperty('--key-border', rgbCss(light ? mixRgb(one, [0, 0, 0], 0.16) : mixRgb(one, [255, 255, 255], 0.28)));
    this.target.style.setProperty('--key-empty', rgbCss(one, 0.45));
    this.target.style.setProperty('--key-shadow', rgbCss(mixRgb(two, [0, 0, 0], light ? 0.3 : 0.55)));
  }

  fadeKeys(background) {
    const view = this.target.ownerDocument.defaultView;
    this.target.querySelectorAll('.deck-tile').forEach((tile) => {
      const own = tile.dataset.keyClear;
      const clear = own !== undefined && own !== '' ? Number(own) : Math.max(0, Math.min(100, background.keyClear || 0));
      tile.classList.remove('key-fade');
      if (!(clear > 0)) { tile.style.removeProperty('--key-fill'); tile.style.removeProperty('--key-alpha'); return; }
      const style = view.getComputedStyle(tile);
      const fill = style.backgroundImage && style.backgroundImage !== 'none' ? `${style.backgroundImage}, ${style.backgroundColor}` : style.backgroundColor;
      tile.style.setProperty('--key-fill', fill);
      tile.style.setProperty('--key-alpha', String(1 - clear / 100));
      tile.classList.add('key-fade');
    });
  }

  destroy() {
    this.target.ownerDocument.defaultView.removeEventListener('resize', this.resize);
    this.layer.remove();
  }
}
