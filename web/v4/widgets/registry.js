import { ClockWidget } from './clock.js';
import { FaderWidget } from './fader.js';
import { MetricsWidget } from './metrics.js';
import { SlideshowWidget } from './slideshow.js';
import { WeatherWidget } from './weather.js';

export const widgetTypes = {
  clock: ClockWidget,
  weather: WeatherWidget,
  metrics: MetricsWidget,
  slideshow: SlideshowWidget,
};

export const faderTypes = { speaker: FaderWidget, mic: FaderWidget };

export function isDisplayWidget(type) {
  return Object.prototype.hasOwnProperty.call(widgetTypes, type);
}
