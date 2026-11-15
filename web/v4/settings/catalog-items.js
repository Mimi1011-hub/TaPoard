const base = (name, type, category, width = 1, height = 1) => ({
  id: '', name, type, category, action: null, path: '', args: '', url: '', text: '', hotkey: '',
  deviceId: null, deviceTarget: null, icon: null, iconKey: '', iconColor: '#3569c8', customIcon: '',
  iconPack: null, iconPackItem: null, width, height, fontSize: 11, iconScale: 82,
  labelOpacity: 45, keyClear: null, hideLabel: false, options: null, steps: null,
});

export function controlFromAction(action) {
  return action === 'control-speaker-fader' ? 'speaker' : action === 'control-mic-fader' ? 'mic' : null;
}

export function catalogItem(action, name) {
  const slideshow = /^widget-slideshow-([3-8])x([3-8])$/.exec(action);
  if (slideshow) {
    const value = base(name, 'slideshow', 'widget', Number(slideshow[1]), Number(slideshow[2]));
    value.hideLabel = true; value.options = { folder: '', interval: 10, order: 'name', fit: 'cover' }; return value;
  }
  if (action.indexOf('widget-clock-') === 0) {
    const analog = action === 'widget-clock-analog', wide = action === 'widget-clock-digital-wide';
    const value = base(name, 'clock', 'widget', 2, wide ? 1 : 2); value.hideLabel = true;
    value.options = { style: analog ? 'analog' : 'digital', showSeconds: true, showDate: true, showWeekday: true, hour12: false }; return value;
  }
  if (action === 'widget-keypad' || action === 'widget-keypad-tall') {
    const value = base(name, 'keypad', 'widget', 4, action.endsWith('tall') ? 5 : 4); value.hideLabel = true; value.options = {}; return value;
  }
  if (action === 'widget-weather-now' || action === 'widget-weather-days') {
    const days = action.endsWith('days'), value = base(name, 'weather', 'widget', days ? 2 : 1, days ? 2 : 1);
    value.hideLabel = true; value.options = { forecastMode: days ? 'days' : 'hours' }; return value;
  }
  if (action.indexOf('widget-metrics-') === 0) {
    const overview = action.endsWith('overview'), value = base(name, 'metrics', 'widget', overview ? 2 : 1, overview ? 2 : 1);
    value.hideLabel = true; value.options = { primary: action.endsWith('gpu-memory') ? 'gpuMemory' : action.endsWith('memory') ? 'memory' : action.endsWith('gpu') ? 'gpu' : 'cpu', cycle: false, gpuId: '', gpuName: '' }; return value;
  }
  if (action.indexOf('widget-wheel-') === 0) {
    const rotary = action.endsWith('rotary'), tall = action.endsWith('tall'), value = base(name, 'wheel', 'widget', rotary ? 2 : 1, rotary || tall ? 2 : 1);
    value.hideLabel = true; value.options = { style: rotary ? 'rotary' : 'vertical', sensitivity: rotary ? 18 : 24, multiplier: 1, reverse: false, ctrl: false, shift: false, alt: false, middleClick: false }; return value;
  }
  if (action.indexOf('widget-touchpad-') === 0) {
    const tall = action.endsWith('tall'), value = base(name, 'touchpad', 'widget', tall ? 2 : 3, tall ? 3 : 2);
    value.hideLabel = true; value.options = { speed: 5, acceleration: true, tapToClick: true, twoFingerScroll: true, reverseScroll: false, longPress: 'none' }; return value;
  }
  if (action === 'custom-url' || action === 'custom-clipboard') {
    const value = base(name, action === 'custom-url' ? 'url' : 'clipboard', 'custom'); value.iconKey = action === 'custom-url' ? 'globe' : 'copy'; return value;
  }
  if (action === 'custom-audio-output' || action === 'custom-audio-input') {
    const value = base(name, 'audioDevice', 'audio'); value.deviceTarget = action.endsWith('input') ? 'mic' : 'speaker'; return value;
  }
  const value = base(name, 'hotkey', action.indexOf('-') < 0 ? 'common' : action.split('-')[0]);
  value.action = action; return value;
}
