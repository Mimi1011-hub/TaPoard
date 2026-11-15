const VALID = /^[a-zA-Z0-9_-]{8,64}$/;

export function getViewId(storage, cryptoSource) {
  let value = storage.getItem('tapoard-view-id') || '';
  if (VALID.test(value)) return value;
  const bytes = new Uint8Array(12);
  if (cryptoSource && cryptoSource.getRandomValues) cryptoSource.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  storage.setItem('tapoard-view-id', value);
  return value;
}
