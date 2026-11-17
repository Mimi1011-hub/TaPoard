import { catalogGroups } from './catalog-data/index.js';

const catalogItems = catalogGroups.flatMap((group) => group.items);

function catalogItem(action) {
  return catalogItems.find((item) => (item.id || item.action) === action) || null;
}

function text(value, i18n) {
  if (Array.isArray(value)) return value.map((part) => text(part, i18n)).join(i18n.t('catalog.desc.separator'));
  return value && value.indexOf('catalog.') === 0 ? i18n.t(value) : (value || '');
}

function widgetAction(item) {
  const options = item.options || {};
  if (item.type === 'clock') return `widget-clock-${options.style === 'analog' || item.style === 'analog' ? 'analog' : 'digital'}`;
  if (item.type === 'weather') return `widget-weather-${options.forecastMode === 'days' || item.view === 'days' ? 'days' : 'now'}`;
  if (item.type === 'metrics') {
    if (item.width > 1 || item.metric === 'overview') return 'widget-metrics-overview';
    const primary = options.primary || item.metric || 'cpu';
    return `widget-metrics-${primary === 'gpuMemory' ? 'gpu-memory' : primary}`;
  }
  if (item.type === 'wheel') return `widget-wheel-${options.style === 'rotary' ? 'rotary' : 'vertical'}`;
  if (item.type === 'touchpad') return 'widget-touchpad-wide';
  if (item.type === 'keypad') return 'widget-keypad';
  if (item.type === 'slideshow') return 'widget-slideshow-3x3';
  if (item.type === 'nowPlaying') return 'widget-now-playing';
  if (item.type === 'calendar') return 'widget-calendar';
  return '';
}

function catalogHelp(value, i18n) {
  if (!value) return null;
  return { name: value.plain ? value.name : i18n.t(value.name), description: text(value.description || value.keys, i18n) };
}

function fileName(path) {
  const parts = String(path || '').split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

function hostName(value) {
  try { return new URL(value).hostname; }
  catch (_) { return value || ''; }
}

function widgetHelp(item, i18n) {
  return catalogHelp(catalogItem(widgetAction(item)), i18n) || { name: item.name, description: '' };
}

export function customItemHelp(item, i18n) {
  if (['clock', 'weather', 'metrics', 'wheel', 'touchpad', 'keypad', 'slideshow', 'nowPlaying', 'calendar'].indexOf(item.type) >= 0) {
    return widgetHelp(item, i18n);
  }
  if (item.type === 'app') {
    return { name: item.name, description: i18n.t('presets.help.app', { file: fileName(item.path) }), sends: '' };
  }
  if (item.type === 'url') {
    return { name: item.name, description: i18n.t('presets.help.url', { host: hostName(item.url) }), sends: '' };
  }
  if (item.type === 'clipboard') {
    return { name: item.name, description: i18n.t('presets.help.clipboard', { text: String(item.text || '').slice(0, 20) }), sends: '' };
  }
  if (item.type === 'audioDevice') {
    const device = item.deviceName || i18n.t('presets.help.defaultDevice');
    const key = item.deviceTarget === 'mic' ? 'presets.help.audioInput' : 'presets.help.audioOutput';
    return { name: item.name, description: i18n.t(key, { device }), sends: '' };
  }
  const value = catalogItem(item.action), known = catalogHelp(value, i18n);
  const result = known || { name: item.name, description: '' };
  if (item.action && item.action.indexOf('audio-') === 0) result.sends = i18n.t('presets.direct');
  else {
    const keys = item.hotkey || (value && (value.keys || text(value.description, i18n)));
    result.sends = keys ? i18n.t('presets.sends', { keys }) : '';
  }
  return result;
}
