import { ClockWidget } from './clock.js';
import { FaderWidget } from './fader.js';
import { MetricsWidget } from './metrics.js';
import { NowPlayingWidget } from './now-playing.js';
import { KeypadWidget } from './keypad.js';
import { SlideshowWidget } from './slideshow.js';
import { TouchpadWidget } from './touchpad.js';
import { WeatherWidget } from './weather.js';
import { WheelWidget } from './wheel.js';

export const widgetTypes = {
  clock: ClockWidget,
  weather: WeatherWidget,
  metrics: MetricsWidget,
  nowPlaying: NowPlayingWidget,
  slideshow: SlideshowWidget,
  wheel: WheelWidget,
  touchpad: TouchpadWidget,
  keypad: KeypadWidget,
};

export const subscribedWidgetTypes = new Set(['metrics', 'weather', 'nowPlaying', 'wheel', 'touchpad', 'keypad']);

export const faderTypes = { speaker: FaderWidget, mic: FaderWidget };

export function isDisplayWidget(type) {
  return Object.prototype.hasOwnProperty.call(widgetTypes, type);
}

export function isSubscribedWidget(type) { return subscribedWidgetTypes.has(type); }
