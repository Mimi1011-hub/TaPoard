export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function i18n(node, key, label) {
  node.setAttribute(label ? 'data-i18n-label' : 'data-i18n', key);
  return node;
}
