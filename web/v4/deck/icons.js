import { safeImageSource } from '../core/image-source.js';

export const presetGroups = [
  [
    'media',
    [
      ['headphones', '∩'],
      ['headset', '∩'],
      ['earbuds', '♬'],
      ['soundbar', '▰'],
      ['usb-mic', '♩'],
      ['studio-mic', '♩'],
      ['audio-output', '↗'],
      ['audio-input', '↙'],
      ['equalizer', '☷'],
      ['gamepad', '✚'],
      ['laptop', '▱'],
      ['timer', '◷'],
      ['calendar', '▦'],
      ['monitor', '▣'],
      ['recording', '●'],
      ['radio', '▤'],
      ['play', '▶'],
      ['pause', 'Ⅱ'],
      ['stop', '■'],
      ['previous', '◀|'],
      ['next', '|▶'],
      ['record', '●'],
      ['music', '♪'],
      ['speaker', '◖'],
      ['mute', '⊘'],
      ['microphone', '♩'],
      ['camera', '▣'],
      ['video', '▷'],
    ],
  ],
  [
    'basic',
    [
      ['star', '★'],
      ['heart', '♥'],
      ['bolt', 'ϟ'],
      ['check', '✓'],
      ['close', '×'],
      ['plus', '＋'],
      ['minus', '−'],
      ['home', '⌂'],
      ['settings', '⚙'],
      ['power', '⏻'],
      ['lock', '▣'],
      ['unlock', '□'],
      ['search', '⌕'],
      ['bell', '♢'],
      ['info', 'i'],
      ['help', '?'],
    ],
  ],
  [
    'communication',
    [
      ['chat', '●●'],
      ['mail', '✉'],
      ['phone', '☎'],
      ['users', '♟♟'],
      ['person', '♟'],
      ['share', '↗'],
      ['link', '∞'],
      ['upload', '⇧'],
      ['download', '⇩'],
      ['wifi', '⌁'],
      ['bluetooth', 'ᛒ'],
      ['globe', '◎'],
    ],
  ],
  [
    'computer',
    [
      ['windows', '⊞'],
      ['desktop', '▰'],
      ['folder', '▱'],
      ['file', '▤'],
      ['save', '▣'],
      ['keyboard', '⌨'],
      ['mouse', '◉'],
      ['print', '▥'],
      ['screenshot', '▧'],
      ['trash', '⌫'],
      ['copy', '▣▣'],
      ['paste', '▥'],
    ],
  ],
  [
    'creative',
    [
      ['brush', '╱'],
      ['pen', '✒'],
      ['pencil', '✎'],
      ['eraser', '▰'],
      ['palette', '◒'],
      ['image', '▧'],
      ['layers', '▱'],
      ['eye', '◉'],
      ['eyedropper', '◇'],
      ['zoom-in', '⊕'],
      ['zoom-out', '⊖'],
      ['rotate', '↻'],
    ],
  ],
  [
    'navigation',
    [
      ['arrow-up', '↑'],
      ['arrow-down', '↓'],
      ['arrow-left', '←'],
      ['arrow-right', '→'],
      ['back', '↶'],
      ['forward', '↷'],
      ['refresh', '⟳'],
      ['menu', '☰'],
      ['grid', '▦'],
      ['list', '☷'],
      ['fullscreen', '⛶'],
      ['target', '◎'],
    ],
  ],
];

const presetMap = {};
presetGroups.forEach(([className, items]) =>
  items.forEach(([key, glyph]) => {
    presetMap[key] = { className, glyph };
  }),
);

const presetPaths = {
  headphones:
    '<path d="M8 28v-7a16 16 0 0 1 32 0v7"/><rect x="6" y="24" width="9" height="16" rx="4"/><rect x="33" y="24" width="9" height="16" rx="4"/>',
  headset:
    '<path d="M8 28v-7a16 16 0 0 1 32 0v11q0 10-14 10"/><rect x="6" y="24" width="9" height="12" rx="3"/><rect x="33" y="24" width="9" height="12" rx="3"/><path d="M21 42h7"/>',
  earbuds:
    '<path d="M16 21v17m16-17v17M16 12h-3m19 0h3"/><rect x="6" y="6" width="14" height="18" rx="7"/><rect x="28" y="6" width="14" height="18" rx="7"/>',
  soundbar:
    '<rect x="4" y="16" width="40" height="17" rx="5"/><circle cx="13" cy="24.5" r="4"/><circle cx="35" cy="24.5" r="4"/><path d="M22 24h4"/>',
  'usb-mic': '<rect x="17" y="4" width="14" height="25" rx="7"/><path d="M11 22a13 13 0 0 0 26 0M24 35v7h12m-7-26H19m0-5h10"/>',
  'studio-mic': '<rect x="15" y="4" width="18" height="24" rx="5"/><path d="M10 18v8a14 14 0 0 0 28 0v-8M24 40v4m-9 0h18M20 11h8m-8 6h8"/>',
  'audio-output': '<path d="M6 20h8l10-9v26l-10-9H6zM30 24h13m-5-5 5 5-5 5"/>',
  'audio-input': '<rect x="9" y="6" width="12" height="24" rx="6"/><path d="M4 25a11 11 0 0 0 22 0M15 36v7m-6 0h12M44 17H29m5-5-5 5 5 5"/>',
  equalizer:
    '<path d="M10 6v36M24 6v36M38 6v36"/><rect x="6" y="14" width="8" height="8" rx="2"/><rect x="20" y="28" width="8" height="8" rx="2"/><rect x="34" y="10" width="8" height="8" rx="2"/>',
  gamepad: '<path d="M15 14h18q7 0 9 9l2 12q0 8-7 3l-7-6H18l-7 6q-7 5-7-3l2-12q2-9 9-9zM14 20v10m-5-5h10M33 21h1m3 7h1"/>',
  laptop: '<rect x="9" y="7" width="30" height="25" rx="2"/><path d="m9 32-6 8h42l-6-8M20 36h8"/>',
  timer: '<circle cx="24" cy="27" r="16"/><path d="M19 4h10M24 4v7m0 6v11l7 4M36 13l4-4"/>',
  calendar: '<rect x="6" y="10" width="36" height="32" rx="3"/><path d="M15 5v10m18-10v10M6 20h36m-27 8h3m9 0h3m-15 7h3m9 0h3"/>',
  monitor: '<rect x="5" y="7" width="38" height="27" rx="3"/><path d="M24 34v8m-10 0h20"/>',
  recording: '<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="8" fill="currentColor"/>',
  radio: '<rect x="5" y="15" width="38" height="27" rx="3"/><path d="m12 15 24-10M29 23h7m-7 7h7"/><circle cx="16" cy="29" r="7"/>',
};

const widgetGlyphs = {
  mouse: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 10h12"/></svg>',
  keyboard:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M6 13.5h1M17 13.5h1M9 14.5h6"/></svg>',
};

export function presetIconNode(key, color) {
  const preset = presetMap[key];
  const node = document.createElement('span');
  node.className = `preset-icon preset-${preset ? preset.className : 'basic'}`;
  const glyph = preset ? preset.glyph : '?';
  if (Array.from(glyph).length > 1) {
    const wide = document.createElement('span');
    wide.className = 'glyph-wide';
    wide.textContent = glyph;
    node.appendChild(wide);
  } else node.textContent = glyph;
  if (presetPaths[key])
    node.innerHTML = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${presetPaths[key]}</svg>`;
  if (/^#[0-9a-f]{6}$/i.test(color || '')) node.style.backgroundColor = color;
  return node;
}

function shortcutGlyph(category) {
  const glyphs = { audio: '◖', common: '★', discord: 'D', windows: '⊞', music: '♪', browser: '◎', widget: '◷', custom: '✦', clipstudio: 'C' };
  const node = document.createElement('span');
  node.className = `shortcut-icon ${category || 'app'}`;
  node.textContent = glyphs[category] || '•';
  return node;
}

export function widgetGlyphNode(name) {
  const node = document.createElement('span');
  node.className = 'widget-glyph';
  if (widgetGlyphs[name]) node.innerHTML = widgetGlyphs[name];
  else node.textContent = '◷';
  return node;
}

export function iconNode(item) {
  // Same order as the 3.x screen: own image, then built-in icon, then the app's own icon.
  if (safeImageSource(item.customIcon)) return imageNode(item.customIcon);
  if (item.iconKey && presetMap[item.iconKey]) return presetIconNode(item.iconKey, item.iconColor);
  if (safeImageSource(item.icon)) return imageNode(item.icon);
  if (item.type === 'hotkey') return shortcutGlyph(item.category);
  const fallback = document.createElement('span');
  fallback.className = 'icon-fallback';
  fallback.textContent = String(item.name || '?')
    .slice(0, 1)
    .toUpperCase();
  return fallback;
}

function imageNode(source) {
  const image = document.createElement('img');
  image.className = 'app-icon';
  image.alt = '';
  image.src = source;
  return image;
}
