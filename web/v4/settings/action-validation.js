export function actionError(i18n, type, value) {
  if (type === 'url') {
    if (!value || value.length > 2048 || !/^https?:\/\/[^\s]+$/i.test(value)) return i18n.t('validation.url');
  }
  if (type === 'clipboard') {
    if (!value) return i18n.t('validation.textEmpty');
    if (value.length > 32768) return i18n.t('validation.textLong');
  }
  return '';
}
