function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '';
}

function safeImage(value) {
  return typeof value === 'string' && value.indexOf('data:image/') === 0 ? value : '';
}

export class DeckBackground {
  constructor(target, api) {
    this.target = target;
    this.api = api;
    this.imageSignature = null;
    this.imageData = '';
    this.layer = target.ownerDocument.createElement('div');
    this.layer.className = 'deck-background';
    this.layer.setAttribute('aria-hidden', 'true');
    target.insertBefore(this.layer, target.firstChild);
  }

  async update(background, orientation) {
    const value = background || {};
    this.value = value;
    this.orientation = orientation;
    const signature = JSON.stringify([value.image || '', value.imageRevision || value.revision || '']);
    if (signature !== this.imageSignature) {
      this.imageSignature = signature;
      this.imageData = '';
      if (value.image) {
        try {
          const result = await this.api.get('/api/background/image', 20000);
          if (signature === this.imageSignature) this.imageData = safeImage(result.data);
        } catch (error) { this.imageSignature = null; }
      }
    }
    this.paint();
  }

  paint() {
    const value = this.value || {};
    const one = safeColor(value.color);
    const two = safeColor(value.color2);
    this.target.style.background = one ? (two ? `linear-gradient(135deg, ${one}, ${two})` : one) : '';
    const position = value[this.orientation] || {};
    this.layer.style.backgroundImage = this.imageData ? `url("${this.imageData}")` : '';
    this.layer.style.backgroundSize = position.fit === 'contain' ? 'contain' : 'cover';
    this.layer.style.backgroundPosition = `${Number.isFinite(position.x) ? position.x : 50}% ${Number.isFinite(position.y) ? position.y : 50}%`;
    this.layer.style.transform = `scale(${position.zoom >= 1 ? position.zoom : 1})`;
    this.layer.style.filter = value.blur ? `blur(${Math.max(0, Math.min(30, value.blur))}px)` : '';
    const dim = Math.max(0, Math.min(100, value.dim || 0)) / 100;
    this.layer.style.boxShadow = dim ? `inset 0 0 0 100vmax rgba(0,0,0,${dim})` : '';
    this.target.classList.toggle('has-deck-background', !!(one || this.imageData));
    this.target.classList.toggle('keys-glass', value.keys === 'glass' || (!!this.imageData && value.keys !== 'standard'));
    this.target.style.setProperty('--global-key-alpha', String(1 - Math.max(0, Math.min(100, value.keyClear || 0)) / 100));
  }

  destroy() { this.layer.remove(); }
}
