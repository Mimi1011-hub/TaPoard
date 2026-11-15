import { el } from '../core/dom.js';

export function appendWidgetName(node, item) {
  if (!item.hideLabel && item.name) node.appendChild(el('span', 'widget-label', item.name));
}

export function percent(value, available, unsupported, i18n) {
  if (unsupported) return i18n.t('metrics.unsupported');
  return available && Number.isFinite(value)
    ? `${Math.max(0, Math.min(100, value)).toFixed(1)}%`
    : i18n.t('metrics.waiting');
}
