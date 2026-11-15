import { el } from '../../core/dom.js';

export function weatherDetails(context) {
  context.root.appendChild(el('p', '', context.t('details.weatherGeneral')));
  const button = el('button', '', context.t('details.openGeneral'));
  button.type = 'button';
  button.addEventListener('click', () => context.chooseSection('general'));
  context.root.appendChild(button);
}
