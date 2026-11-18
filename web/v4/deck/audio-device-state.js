export function audioDeviceState(item, devices) {
  if (!Array.isArray(devices)) return 'unknown';
  const device = devices.find((value) => value.id === item.deviceId && value.target === item.deviceTarget);
  if (!device || device.available === false) return 'unavailable';
  return device.selected ? 'selected' : 'idle';
}
