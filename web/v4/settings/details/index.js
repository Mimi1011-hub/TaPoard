import { clockDetails } from './clock-details.js';
import { metricsDetails } from './metrics-details.js';
import { wheelDetails } from './wheel-details.js';
import { slideshowDetails } from './slideshow-details.js';
import { touchpadDetails } from './touchpad-details.js';
import { hotkeyDetails } from './hotkey-details.js';
import { audioDeviceDetails } from './audio-device-details.js';
import { weatherDetails } from './weather-details.js';

const builders = {
  clock: clockDetails,
  metrics: metricsDetails,
  wheel: wheelDetails,
  slideshow: slideshowDetails,
  touchpad: touchpadDetails,
  hotkey: hotkeyDetails,
  audioDevice: audioDeviceDetails,
  weather: weatherDetails,
};

export function detailsFor(options) {
  const build = builders[options.item.type];
  if (!build) return;
  const context = Object.assign({}, options, {
    options: Object.assign({}, options.item.options || {}),
    t: (key) => options.i18n.t(key),
    defaults(values) {
      this.options = Object.assign({}, values, this.options);
    },
    change(name, value) {
      this.options[name] = typeof valuesAsNumber[name] === 'boolean' ? Number(value) : value;
      options.updateItem({ options: this.options });
    },
    changeMany(values) {
      Object.assign(this.options, values);
      options.updateItem({ options: this.options });
    },
  });
  build(context);
}

const valuesAsNumber = { multiplier: true, interval: true };
