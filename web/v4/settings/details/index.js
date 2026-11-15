import { el } from '../../core/dom.js';
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

// Adds the settings that only one kind of item has. Every change goes through updateItem, so it is saved and undoable.
export function detailsFor(options) {
  const build = builders[options.item.type];
  if (!build) return;
  const root = el('div', 'inspector-details');
  options.root.appendChild(root);
  const context = Object.assign({}, options, {
    root,
    options: Object.assign({}, options.item.options || {}),
    t: (key, values) => options.i18n.t(key, values),
    defaults(values) {
      this.options = Object.assign({}, values, this.options);
    },
    change(name, value) {
      this.changeMany({ [name]: value });
    },
    changeMany(values) {
      Object.assign(this.options, values);
      options.updateItem({ options: Object.assign({}, this.options) });
    },
  });
  build(context);
}
