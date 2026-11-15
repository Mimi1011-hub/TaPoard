import { el } from '../../core/dom.js';
import { field } from './fields.js';

export async function audioDeviceDetails(context) {
  try {
    const response = await context.api.get('/api/devices');
    const devices = (response.devices || []).filter((device) => !context.item.deviceTarget || device.target === context.item.deviceTarget);
    const select = el('select', '');
    devices.forEach((device) => {
      const option = el('option', '', device.name);
      option.value = device.id;
      select.appendChild(option);
    });
    select.value = context.item.deviceId || '';
    select.addEventListener('change', () => {
      const device = devices.find((value) => value.id === select.value);
      if (device) context.updateItem({ deviceId: device.id, deviceTarget: device.target, deviceName: device.name });
    });
    field(context.root, context.t('details.audioDevice'), select);
  } catch (error) {
    context.onError(error.message);
  }
}
