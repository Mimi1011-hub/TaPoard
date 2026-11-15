import { el } from '../../core/dom.js';
import { field } from './fields.js';

export async function audioDeviceDetails(context) {
  const select = el('select', '');
  const saved = context.item.deviceId || '';
  const add = (id, name) => {
    const option = el('option', '', name);
    option.value = id;
    select.appendChild(option);
  };
  // The saved device is shown at once; the full list arrives a moment later.
  add(saved, context.item.deviceName || context.t('details.audioLoading'));
  select.disabled = true;
  select.dataset.option = 'deviceId';
  field(context.root, context.t('details.audioDevice'), select);
  let devices = [];
  try {
    const response = await context.api.get('/api/devices');
    devices = (response.devices || []).filter((device) => device.target === context.item.deviceTarget);
  } catch (error) {
    if (select.isConnected) context.onError(error.message);
    return;
  }
  if (!select.isConnected) return;
  select.textContent = '';
  if (!devices.some((device) => device.id === saved)) add(saved, context.item.deviceName || context.t('details.audioChoose'));
  devices.forEach((device) => add(device.id, device.name));
  select.value = saved;
  select.disabled = false;
  select.addEventListener('change', () => {
    const device = devices.find((value) => value.id === select.value);
    if (device) context.updateItem({ deviceId: device.id, deviceTarget: device.target, deviceName: device.name });
  });
}
