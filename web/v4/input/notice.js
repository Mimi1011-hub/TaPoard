export function showInputNotice(node, state, i18n) {
  if (state !== 'busy' && state !== 'blocked') return;
  const label = node.querySelector('.input-notice');
  if (label) label.textContent = i18n.t(state === 'busy' ? 'input.busy' : 'input.blocked');
  node.classList.add('input-busy');
  clearTimeout(node.inputNoticeTimer);
  node.inputNoticeTimer = setTimeout(() => node.classList.remove('input-busy'), state === 'busy' ? 2000 : 3000);
}
