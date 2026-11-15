export function safeImageSource(value) {
  if (typeof value !== 'string') return '';
  return /^data:image\//i.test(value) || /^\/(?!\/)/.test(value) ? value : '';
}
