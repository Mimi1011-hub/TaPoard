import { defaultIconForAction } from './default-icon.js';

const aliases = {
  'widget-clock-digital-wide': 'widget-clock-digital',
  'widget-wheel-vertical-tall': 'widget-wheel-vertical',
  'widget-touchpad-tall': 'widget-touchpad-wide',
  'widget-keypad-tall': 'widget-keypad',
};

export function canonicalCatalogAction(action) {
  return aliases[action] || action;
}

export function catalogSizes(action, definitions) {
  action = canonicalCatalogAction(action);
  if (action === 'widget-clock-digital') return ['2x1', '2x2'];
  if (action === 'widget-clock-analog') return ['2x2'];
  if (action === 'widget-wheel-vertical') return ['1x1', '1x2'];
  if (action === 'widget-wheel-rotary') return ['2x2'];
  if (action === 'widget-touchpad-wide') return ['3x2', '2x3'];
  if (action === 'widget-keypad') return ['4x4', '4x5'];
  if (action === 'widget-weather-now' || action.indexOf('widget-metrics-') === 0 && !action.endsWith('overview')) return ['1x1'];
  if (action === 'widget-weather-days' || action === 'widget-metrics-overview') return ['2x2'];
  if (action.indexOf('widget-slideshow-') === 0) return (definitions.get('slideshow') || {}).sizes || ['3x3'];
  return null;
}

const base = (name, type, category, width = 1, height = 1) => ({
  id: '',
  name,
  type,
  category,
  action: null,
  path: '',
  args: '',
  url: '',
  text: '',
  hotkey: '',
  deviceId: null,
  deviceTarget: null,
  icon: null,
  iconKey: '',
  iconColor: '#3569c8',
  customIcon: '',
  iconPack: null,
  iconPackItem: null,
  width,
  height,
  fontSize: 11,
  iconScale: 82,
  labelOpacity: 45,
  keyClear: null,
  hideLabel: false,
  options: null,
  steps: null,
});

export function controlFromAction(action) {
  return action === 'control-speaker-fader' ? 'speaker' : action === 'control-mic-fader' ? 'mic' : null;
}

export function catalogItem(action, name, category) {
  action = canonicalCatalogAction(action);
  const slideshow = /^widget-slideshow-([3-8])x([3-8])$/.exec(action);
  if (slideshow) {
    const value = base(name, 'slideshow', 'widget', Number(slideshow[1]), Number(slideshow[2]));
    value.hideLabel = true;
    value.options = { folder: '', interval: 10, order: 'name', fit: 'cover' };
    return value;
  }
  if (action.indexOf('widget-clock-') === 0) {
    const analog = action === 'widget-clock-analog';
    const value = base(name, 'clock', 'widget', 2, 2);
    value.hideLabel = true;
    value.options = { style: analog ? 'analog' : 'digital', showSeconds: true, showDate: true, showWeekday: true, hour12: false };
    return value;
  }
  if (action === 'widget-keypad' || action === 'widget-keypad-tall') {
    const value = base(name, 'keypad', 'widget', 4, action.endsWith('tall') ? 5 : 4);
    value.hideLabel = true;
    value.options = {};
    return value;
  }
  if (action === 'widget-weather-now' || action === 'widget-weather-days') {
    const days = action.endsWith('days'),
      value = base(name, 'weather', 'widget', days ? 2 : 1, days ? 2 : 1);
    value.hideLabel = true;
    value.options = { forecastMode: days ? 'days' : 'hours' };
    return value;
  }
  if (action.indexOf('widget-metrics-') === 0) {
    const overview = action.endsWith('overview'),
      value = base(name, 'metrics', 'widget', overview ? 2 : 1, overview ? 2 : 1);
    value.hideLabel = true;
    value.options = {
      primary: action.endsWith('gpu-memory') ? 'gpuMemory' : action.endsWith('memory') ? 'memory' : action.endsWith('gpu') ? 'gpu' : 'cpu',
      cycle: false,
      gpuId: '',
      gpuName: '',
    };
    return value;
  }
  if (action.indexOf('widget-wheel-') === 0) {
    const rotary = action.endsWith('rotary'),
      tall = action.endsWith('tall'),
      value = base(name, 'wheel', 'widget', rotary ? 2 : 1, rotary || tall ? 2 : 1);
    value.hideLabel = true;
    value.options = {
      style: rotary ? 'rotary' : 'vertical',
      sensitivity: rotary ? 18 : 24,
      multiplier: 1,
      reverse: false,
      ctrl: false,
      shift: false,
      alt: false,
      middleClick: false,
    };
    return value;
  }
  if (action.indexOf('widget-touchpad-') === 0) {
    const tall = action.endsWith('tall'),
      value = base(name, 'touchpad', 'widget', tall ? 2 : 3, tall ? 3 : 2);
    value.hideLabel = true;
    value.options = { speed: 5, acceleration: true, tapToClick: true, twoFingerScroll: true, reverseScroll: false, longPress: 'none' };
    return value;
  }
  if (action === 'custom-url' || action === 'custom-clipboard') {
    const value = base(name, action === 'custom-url' ? 'url' : 'clipboard', 'custom');
    value.iconKey = action === 'custom-url' ? 'globe' : 'copy';
    return value;
  }
  if (action === 'custom-audio-output' || action === 'custom-audio-input') {
    const value = base(name, 'audioDevice', 'audio');
    value.deviceTarget = action.endsWith('input') ? 'mic' : 'speaker';
    value.iconKey = action.endsWith('input') ? 'audio-input' : 'audio-output';
    return value;
  }
  const value = base(name, 'hotkey', category || 'common');
  value.action = action;
  value.iconKey = defaultIconForAction(action, value.category);
  return value;
}
